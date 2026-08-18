import type { Easy68kSoundAsset } from '@m68k/interpreter';

function createToneWav(): Uint8Array {
  const sampleRate = 8000;
  const sampleCount = 1200;
  const bytes = new Uint8Array(44 + sampleCount);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      bytes[offset + index] = value.charCodeAt(index);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, sampleCount, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = 1 - index / sampleCount;
    bytes[44 + index] = Math.round(
      128 + Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 90 * envelope
    );
  }
  return bytes;
}

export const DEFAULT_EASY68K_SOUND_ASSETS: readonly Easy68kSoundAsset[] = [
  { id: 'easy68k-demo-beep', path: 'beep.wav', bytes: createToneWav(), mediaType: 'audio/wav' },
];
