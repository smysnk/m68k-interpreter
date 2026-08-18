export type Easy68kSoundPlayer = 'standard' | 'polyphonic';

export interface Easy68kSoundAsset {
  id: string;
  path: string;
  bytes: Uint8Array;
  mediaType?: 'audio/wav';
}

export const EASY68K_SOUND_MAX_ASSET_BYTES = 2 * 1024 * 1024;
export const EASY68K_SOUND_MAX_TOTAL_ASSET_BYTES = 8 * 1024 * 1024;

export interface Easy68kSoundReference {
  reference: number;
  assetId: string;
  path: string;
  player: Easy68kSoundPlayer;
}

export interface Easy68kLogicalVoice {
  id: number;
  player: Easy68kSoundPlayer;
  assetId: string;
  path: string;
  reference?: number;
  loop: boolean;
}

export type Easy68kAudioCommand =
  | { sequence: number; type: 'play'; voice: Easy68kLogicalVoice }
  | { sequence: number; type: 'stop-voice'; voiceId: number }
  | { sequence: number; type: 'stop-reference'; player: Easy68kSoundPlayer; reference: number }
  | { sequence: number; type: 'stop-all'; player?: Easy68kSoundPlayer };

type Easy68kAudioCommandInput = Easy68kAudioCommand extends infer Command
  ? Command extends { sequence: number }
    ? Omit<Command, 'sequence'>
    : never
  : never;

export interface Easy68kSoundSnapshot {
  snapshotVersion: 1;
  version: number;
  commandSequence: number;
  standardReferences: Easy68kSoundReference[];
  polyphonicReferences: Easy68kSoundReference[];
  voices: Easy68kLogicalVoice[];
  diagnostics: string[];
  pendingCommands: Easy68kAudioCommand[];
  lastTaskResult: { task: number; success: boolean } | null;
  assets: Array<{ id: string; path: string; byteLength: number; valid: true }>;
}

export function normalizeEasy68kSoundPath(path: string): string | undefined {
  const normalized = path.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    normalized.length > 1024 ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    return undefined;
  }
  return normalized.toLowerCase();
}

export function isValidEasy68kWav(bytes: Uint8Array): boolean {
  if (
    bytes.length < 44 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE'
  )
    return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredSize = view.getUint32(4, true) + 8;
  if (declaredSize > bytes.length) return false;
  let hasFormat = false;
  let hasData = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size;
    if (end > bytes.length) return false;
    if (id === 'fmt ' && size >= 16) hasFormat = true;
    if (id === 'data') hasData = true;
    offset = end + (size & 1);
  }
  return hasFormat && hasData;
}

export class Easy68kSoundDevice {
  private readonly assetsByPath = new Map<string, Easy68kSoundAsset>();
  private readonly standardReferences = new Map<number, Easy68kSoundReference>();
  private readonly polyphonicReferences = new Map<number, Easy68kSoundReference>();
  private readonly voices = new Map<number, Easy68kLogicalVoice>();
  private readonly diagnostics: string[] = [];
  private pendingCommands: Easy68kAudioCommand[] = [];
  private nextVoiceId = 1;
  private commandSequence = 0;
  private version = 1;
  private lastTaskResult: { task: number; success: boolean } | null = null;

  constructor(assets: readonly Easy68kSoundAsset[] = []) {
    this.replaceAssets(assets);
  }

  replaceAssets(assets: readonly Easy68kSoundAsset[]): void {
    this.assetsByPath.clear();
    this.registerAssets(assets);
  }

  registerAssets(assets: readonly Easy68kSoundAsset[]): Easy68kSoundAsset[] {
    const accepted: Easy68kSoundAsset[] = [];
    let totalBytes = [...this.assetsByPath.values()].reduce(
      (total, asset) => total + asset.bytes.length,
      0
    );
    for (const asset of assets) {
      const path = normalizeEasy68kSoundPath(asset.path);
      const replacingBytes = path ? (this.assetsByPath.get(path)?.bytes.length ?? 0) : 0;
      if (
        !path ||
        asset.bytes.length > EASY68K_SOUND_MAX_ASSET_BYTES ||
        !isValidEasy68kWav(asset.bytes) ||
        totalBytes - replacingBytes + asset.bytes.length > EASY68K_SOUND_MAX_TOTAL_ASSET_BYTES
      ) {
        this.addDiagnostic(`Rejected invalid or oversized WAV asset: ${asset.path}`);
        continue;
      }
      const normalized = {
        ...asset,
        path,
        bytes: new Uint8Array(asset.bytes),
        mediaType: 'audio/wav' as const,
      };
      this.assetsByPath.set(path, normalized);
      accepted.push({ ...normalized, bytes: new Uint8Array(normalized.bytes) });
      totalBytes = totalBytes - replacingBytes + normalized.bytes.length;
    }
    this.version += 1;
    return accepted;
  }

  getAssets(): Easy68kSoundAsset[] {
    return [...this.assetsByPath.values()].map((asset) => ({
      ...asset,
      bytes: new Uint8Array(asset.bytes),
    }));
  }

  getVersion(): number {
    return this.version;
  }

  recordTaskResult(task: number, success: boolean): void {
    this.lastTaskResult = { task, success };
    this.version += 1;
  }

  playPath(player: Easy68kSoundPlayer, sourcePath: string, loop = false): boolean {
    const resolved = this.resolveAsset(sourcePath);
    if (!resolved) return false;
    if (player === 'standard' && this.hasActiveStandardVoice()) {
      this.addDiagnostic('Standard sound player is busy.');
      return false;
    }
    this.startVoice(player, resolved, loop);
    return true;
  }

  loadReference(player: Easy68kSoundPlayer, reference: number, sourcePath: string): boolean {
    const resolved = this.resolveAsset(sourcePath);
    if (!resolved) return false;
    const normalizedReference = reference & 0xff;
    const entry: Easy68kSoundReference = {
      reference: normalizedReference,
      assetId: resolved.id,
      path: resolved.path,
      player,
    };
    this.referenceMap(player).set(normalizedReference, entry);
    this.version += 1;
    return true;
  }

  playReference(player: Easy68kSoundPlayer, reference: number, loop = false): boolean {
    const normalizedReference = reference & 0xff;
    const entry = this.referenceMap(player).get(normalizedReference);
    if (!entry) {
      this.addDiagnostic(`Sound reference ${normalizedReference} is not loaded for ${player}.`);
      return false;
    }
    if (player === 'standard' && this.hasActiveStandardVoice()) {
      this.addDiagnostic('Standard sound player is busy.');
      return false;
    }
    const asset = this.assetsByPath.get(entry.path);
    if (!asset) {
      this.addDiagnostic(`Sound asset is no longer available: ${entry.path}`);
      return false;
    }
    this.startVoice(player, asset, loop, normalizedReference);
    return true;
  }

  control(player: Easy68kSoundPlayer, reference: number, operation: number): boolean {
    switch (operation >>> 0) {
      case 0:
        return this.playReference(player, reference, false);
      case 1:
        return this.playReference(player, reference, true);
      case 2:
        return this.stopReference(player, reference);
      case 3:
        this.stopAll(player);
        return true;
      default:
        this.addDiagnostic(`Unsupported ${player} sound control operation: ${operation >>> 0}`);
        return false;
    }
  }

  completeVoice(voiceId: number): void {
    const voice = this.voices.get(voiceId);
    if (!voice || voice.loop) return;
    this.voices.delete(voiceId);
    this.version += 1;
  }

  stopReference(player: Easy68kSoundPlayer, reference: number): boolean {
    const normalizedReference = reference & 0xff;
    if (!this.referenceMap(player).has(normalizedReference)) {
      this.addDiagnostic(`Cannot stop unloaded ${player} reference ${normalizedReference}.`);
      return false;
    }
    let changed = false;
    for (const [voiceId, voice] of this.voices) {
      if (voice.player === player && voice.reference === normalizedReference) {
        this.voices.delete(voiceId);
        changed = true;
      }
    }
    this.enqueue({ type: 'stop-reference', player, reference: normalizedReference });
    if (changed) this.version += 1;
    return true;
  }

  stopAll(player?: Easy68kSoundPlayer): void {
    for (const [voiceId, voice] of this.voices) {
      if (!player || voice.player === player) this.voices.delete(voiceId);
    }
    this.enqueue(player ? { type: 'stop-all', player } : { type: 'stop-all' });
    this.version += 1;
  }

  consumeCommands(): Easy68kAudioCommand[] {
    const commands = this.pendingCommands;
    this.pendingCommands = [];
    return commands.map((command) =>
      command.type === 'play' ? { ...command, voice: { ...command.voice } } : { ...command }
    );
  }

  getSnapshot(includeCommands = false): Easy68kSoundSnapshot {
    return {
      snapshotVersion: 1,
      version: this.version,
      commandSequence: this.commandSequence,
      standardReferences: [...this.standardReferences.values()].map((entry) => ({ ...entry })),
      polyphonicReferences: [...this.polyphonicReferences.values()].map((entry) => ({ ...entry })),
      voices: [...this.voices.values()].map((voice) => ({ ...voice })),
      diagnostics: [...this.diagnostics],
      pendingCommands: includeCommands ? this.consumeCommands() : [],
      lastTaskResult: this.lastTaskResult ? { ...this.lastTaskResult } : null,
      assets: [...this.assetsByPath.values()].map((asset) => ({
        id: asset.id,
        path: asset.path,
        byteLength: asset.bytes.length,
        valid: true,
      })),
    };
  }

  restore(snapshot: Easy68kSoundSnapshot): void {
    this.standardReferences.clear();
    this.polyphonicReferences.clear();
    this.voices.clear();
    for (const entry of snapshot.standardReferences)
      this.standardReferences.set(entry.reference, { ...entry });
    for (const entry of snapshot.polyphonicReferences)
      this.polyphonicReferences.set(entry.reference, { ...entry });
    for (const voice of snapshot.voices) this.voices.set(voice.id, { ...voice });
    this.diagnostics.splice(0, this.diagnostics.length, ...snapshot.diagnostics);
    this.pendingCommands = [{ sequence: ++this.commandSequence, type: 'stop-all' }];
    this.lastTaskResult = snapshot.lastTaskResult ? { ...snapshot.lastTaskResult } : null;
    for (const voice of this.voices.values()) {
      if (voice.loop) this.enqueue({ type: 'play', voice: { ...voice } });
    }
    this.nextVoiceId = Math.max(1, ...this.voices.keys()) + 1;
    this.version = snapshot.version + 1;
  }

  reset(): void {
    this.standardReferences.clear();
    this.polyphonicReferences.clear();
    this.voices.clear();
    this.diagnostics.length = 0;
    this.pendingCommands = [];
    this.lastTaskResult = null;
    this.enqueue({ type: 'stop-all' });
    this.nextVoiceId = 1;
    this.version += 1;
  }

  private resolveAsset(sourcePath: string): Easy68kSoundAsset | undefined {
    const path = normalizeEasy68kSoundPath(sourcePath);
    if (!path) {
      this.addDiagnostic(`Invalid sound path: ${sourcePath}`);
      return undefined;
    }
    const asset = this.assetsByPath.get(path);
    if (!asset) this.addDiagnostic(`Sound asset is not in the project manifest: ${sourcePath}`);
    return asset;
  }

  private referenceMap(player: Easy68kSoundPlayer): Map<number, Easy68kSoundReference> {
    return player === 'standard' ? this.standardReferences : this.polyphonicReferences;
  }

  private hasActiveStandardVoice(): boolean {
    return [...this.voices.values()].some((voice) => voice.player === 'standard');
  }

  private startVoice(
    player: Easy68kSoundPlayer,
    asset: Easy68kSoundAsset,
    loop: boolean,
    reference?: number
  ): void {
    const voice: Easy68kLogicalVoice = {
      id: this.nextVoiceId++,
      player,
      assetId: asset.id,
      path: asset.path,
      ...(reference === undefined ? {} : { reference }),
      loop,
    };
    this.voices.set(voice.id, voice);
    this.enqueue({ type: 'play', voice: { ...voice } });
    this.version += 1;
  }

  private enqueue(command: Easy68kAudioCommandInput): void {
    this.commandSequence += 1;
    this.pendingCommands.push({
      sequence: this.commandSequence,
      ...command,
    } as Easy68kAudioCommand);
  }

  private addDiagnostic(message: string): void {
    if (this.diagnostics.at(-1) !== message) this.diagnostics.push(message);
    if (this.diagnostics.length > 20) this.diagnostics.shift();
    this.version += 1;
  }
}
