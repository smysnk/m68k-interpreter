import type { Easy68kAudioCommand, Easy68kSoundAsset } from '@m68k/interpreter';
import { soundSurfaceStore } from './soundSurfaceStore';

interface ActiveVoice {
  command: Extract<Easy68kAudioCommand, { type: 'play' }>;
  source: AudioBufferSourceNode;
}

const AUDIO_PREFERENCES_KEY = 'm68k-interpreter.easy68k-audio-preferences.v1';

export class Easy68kAudioHost {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private readonly assets = new Map<string, Easy68kSoundAsset>();
  private readonly decoded = new Map<string, Promise<AudioBuffer>>();
  private readonly voices = new Map<number, ActiveVoice>();
  private pending: Extract<Easy68kAudioCommand, { type: 'play' }>[] = [];
  private lastSequence = 0;
  private muted = false;
  private volume = 1;
  private voiceEnded: ((voiceId: number) => void) | null = null;
  private generation = 0;

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const preferences = JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_KEY) ?? '{}') as {
        muted?: unknown;
        volume?: unknown;
      };
      if (typeof preferences.muted === 'boolean') this.muted = preferences.muted;
      if (typeof preferences.volume === 'number') {
        this.volume = Math.max(0, Math.min(1, preferences.volume));
      }
    } catch {
      // Invalid preferences fall back to safe defaults.
    }
  }

  configureAssets(assets: readonly Easy68kSoundAsset[]): void {
    this.generation += 1;
    this.stopAll();
    this.assets.clear();
    this.decoded.clear();
    this.lastSequence = 0;
    this.registerAssets(assets);
    soundSurfaceStore.publishHost({ muted: this.muted, volume: this.volume });
  }

  registerAssets(assets: readonly Easy68kSoundAsset[]): void {
    for (const asset of assets) {
      this.assets.set(asset.id, { ...asset, bytes: new Uint8Array(asset.bytes) });
      this.decoded.delete(asset.id);
    }
  }

  setVoiceEndedHandler(handler: ((voiceId: number) => void) | null): void {
    this.voiceEnded = handler;
  }

  async unlock(): Promise<boolean> {
    try {
      const context = this.ensureContext();
      if (!context) return false;
      if (context.state !== 'running') await context.resume();
      const unlocked = context.state === 'running';
      soundSurfaceStore.publishHost({ unlocked, supported: true, error: null });
      if (unlocked) {
        const queued = this.pending;
        this.pending = [];
        for (const command of queued) await this.play(command);
      }
      return unlocked;
    } catch (error) {
      soundSurfaceStore.publishHost({
        unlocked: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async handleCommands(commands: readonly Easy68kAudioCommand[]): Promise<void> {
    for (const command of commands) {
      if (command.sequence <= this.lastSequence) continue;
      this.lastSequence = command.sequence;
      if (command.type === 'play') {
        const context = this.ensureContext();
        if (!context || context.state !== 'running') {
          this.pending.push(structuredClone(command));
          soundSurfaceStore.publishHost({
            unlocked: false,
            error: context ? 'Audio is ready to unlock.' : 'Web Audio is unavailable.',
          });
        } else {
          await this.play(command);
        }
      } else if (command.type === 'stop-voice') {
        this.stopVoice(command.voiceId);
      } else if (command.type === 'stop-reference') {
        for (const [voiceId, voice] of this.voices) {
          if (
            voice.command.voice.player === command.player &&
            voice.command.voice.reference === command.reference
          )
            this.stopVoice(voiceId);
        }
        this.pending = this.pending.filter(
          (entry) =>
            entry.voice.player !== command.player || entry.voice.reference !== command.reference
        );
      } else {
        this.stopAll(command.player);
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateGain();
    soundSurfaceStore.publishHost({ muted });
    this.persistPreferences();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateGain();
    soundSurfaceStore.publishHost({ volume: this.volume });
    this.persistPreferences();
  }

  stopAll(player?: 'standard' | 'polyphonic'): void {
    for (const [voiceId, voice] of this.voices) {
      if (!player || voice.command.voice.player === player) this.stopVoice(voiceId);
    }
    this.pending = player ? this.pending.filter((entry) => entry.voice.player !== player) : [];
  }

  dispose(): void {
    this.generation += 1;
    this.stopAll();
    this.assets.clear();
    this.decoded.clear();
    this.voiceEnded = null;
    const context = this.context;
    this.context = null;
    this.gain = null;
    if (context) void context.close();
    soundSurfaceStore.reset();
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === 'undefined') {
      soundSurfaceStore.publishHost({ supported: false, error: 'Web Audio is unavailable.' });
      return null;
    }
    this.context = new AudioContext();
    this.gain = this.context.createGain();
    this.gain.connect(this.context.destination);
    this.updateGain();
    soundSurfaceStore.publishHost({
      supported: true,
      unlocked: this.context.state === 'running',
      error: null,
    });
    return this.context;
  }

  private async play(command: Extract<Easy68kAudioCommand, { type: 'play' }>): Promise<void> {
    const context = this.ensureContext();
    const gain = this.gain;
    const asset = this.assets.get(command.voice.assetId);
    if (!context || !gain || !asset) {
      soundSurfaceStore.publishHost({ error: `Audio asset is unavailable: ${command.voice.path}` });
      return;
    }
    try {
      const generation = this.generation;
      const bufferPromise = this.decoded.get(asset.id) ?? this.decode(asset, context);
      this.decoded.set(asset.id, bufferPromise);
      const buffer = await bufferPromise;
      if (generation !== this.generation || context !== this.context) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = command.voice.loop;
      source.connect(gain);
      source.onended = () => {
        if (this.voices.get(command.voice.id)?.source !== source) return;
        this.voices.delete(command.voice.id);
        if (!command.voice.loop) this.voiceEnded?.(command.voice.id);
      };
      this.voices.set(command.voice.id, { command, source });
      source.start();
      soundSurfaceStore.publishHost({ error: null, unlocked: true });
    } catch (error) {
      soundSurfaceStore.publishHost({
        error: error instanceof Error ? error.message : String(error),
      });
      this.voiceEnded?.(command.voice.id);
    }
  }

  private decode(asset: Easy68kSoundAsset, context: AudioContext): Promise<AudioBuffer> {
    const bytes = new Uint8Array(asset.bytes);
    return context.decodeAudioData(bytes.buffer.slice(0));
  }

  private stopVoice(voiceId: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice) return;
    this.voices.delete(voiceId);
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {
      // A completed source is already stopped.
    }
  }

  private updateGain(): void {
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume;
  }

  private persistPreferences(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        AUDIO_PREFERENCES_KEY,
        JSON.stringify({ muted: this.muted, volume: this.volume })
      );
    } catch {
      // Keep preferences for this session if persistent storage is unavailable.
    }
  }
}

export const easy68kAudioHost = new Easy68kAudioHost();
