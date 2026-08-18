import { afterEach, describe, expect, it, vi } from 'vitest';
import { Easy68kAudioHost } from '@/runtime/easy68kAudioHost';

function wav(): Uint8Array {
  const bytes = new Uint8Array(44);
  bytes.set(
    [...'RIFF'].map((character) => character.charCodeAt(0)),
    0
  );
  bytes.set(
    [...'WAVE'].map((character) => character.charCodeAt(0)),
    8
  );
  return bytes;
}

describe('Easy68kAudioHost', () => {
  const originalAudioContext = globalThis.AudioContext;

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    });
  });

  it('queues locked commands, unlocks once, and ignores duplicate sequences', async () => {
    const starts = vi.fn();
    class FakeAudioContext {
      state: AudioContextState = 'suspended';
      destination = {} as AudioDestinationNode;
      createGain() {
        return { connect: vi.fn(), gain: { value: 1 } } as unknown as GainNode;
      }
      createBufferSource() {
        return {
          buffer: null,
          loop: false,
          connect: vi.fn(),
          start: starts,
          stop: vi.fn(),
          onended: null,
        } as unknown as AudioBufferSourceNode;
      }
      decodeAudioData() {
        return Promise.resolve({} as AudioBuffer);
      }
      async resume() {
        this.state = 'running';
      }
      close() {
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
    const host = new Easy68kAudioHost();
    host.configureAssets([{ id: 'tone', path: 'tone.wav', bytes: wav() }]);
    const command = {
      sequence: 1,
      type: 'play' as const,
      voice: { id: 1, player: 'standard' as const, assetId: 'tone', path: 'tone.wav', loop: false },
    };
    await host.handleCommands([command]);
    expect(starts).not.toHaveBeenCalled();
    await host.unlock();
    expect(starts).toHaveBeenCalledOnce();
    await host.handleCommands([command]);
    expect(starts).toHaveBeenCalledOnce();
    host.dispose();
  });
});
