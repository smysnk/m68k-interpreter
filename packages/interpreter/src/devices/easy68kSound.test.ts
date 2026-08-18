import { describe, expect, it } from 'vitest';
import { Easy68kSoundDevice } from './easy68kSound';

const wav = new Uint8Array(44);
wav.set(
  [...'RIFF'].map((character) => character.charCodeAt(0)),
  0
);
new DataView(wav.buffer).setUint32(4, 36, true);
wav.set(
  [...'WAVE'].map((character) => character.charCodeAt(0)),
  8
);
wav.set(
  [...'fmt '].map((character) => character.charCodeAt(0)),
  12
);
new DataView(wav.buffer).setUint32(16, 16, true);
wav.set(
  [...'data'].map((character) => character.charCodeAt(0)),
  36
);

const asset = {
  id: 'tone',
  path: 'audio/tone.wav',
  bytes: wav,
} as const;

describe('Easy68kSoundDevice', () => {
  it('resolves only normalized project-manifest WAV paths', () => {
    const sound = new Easy68kSoundDevice([asset]);
    expect(sound.playPath('standard', './AUDIO\\TONE.WAV')).toBe(true);
    expect(sound.playPath('polyphonic', '../tone.wav')).toBe(false);
    expect(sound.getSnapshot().diagnostics.at(-1)).toContain('Invalid sound path');
  });

  it('models standard single voice and polyphonic voices independently', () => {
    const sound = new Easy68kSoundDevice([asset]);
    expect(sound.loadReference('standard', 2, 'audio/tone.wav')).toBe(true);
    expect(sound.playReference('standard', 2)).toBe(true);
    expect(sound.playReference('standard', 2)).toBe(false);
    expect(sound.loadReference('polyphonic', 3, 'audio/tone.wav')).toBe(true);
    expect(sound.playReference('polyphonic', 3)).toBe(true);
    expect(sound.playReference('polyphonic', 3)).toBe(true);
    expect(sound.getSnapshot().voices).toHaveLength(3);
  });

  it('emits ordered play and stop commands', () => {
    const sound = new Easy68kSoundDevice([asset]);
    sound.loadReference('polyphonic', 7, 'audio/tone.wav');
    sound.control('polyphonic', 7, 1);
    sound.control('polyphonic', 7, 2);
    const commands = sound.getSnapshot(true).pendingCommands;
    expect(commands.map((command) => command.type)).toEqual(['play', 'stop-reference']);
    expect(commands[1]?.sequence).toBeGreaterThan(commands[0]?.sequence ?? 0);
  });

  it('rejects malformed WAV assets before they enter the manifest', () => {
    const sound = new Easy68kSoundDevice();
    expect(
      sound.registerAssets([{ id: 'bad', path: 'bad.wav', bytes: Uint8Array.of(1, 2, 3) }])
    ).toEqual([]);
    expect(sound.getAssets()).toEqual([]);
    expect(sound.getSnapshot().diagnostics.at(-1)).toContain('Rejected invalid or oversized WAV');
  });
});
