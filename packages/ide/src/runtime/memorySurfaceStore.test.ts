import { beforeEach, describe, expect, it } from 'vitest';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';

describe('memorySurfaceStore', () => {
  beforeEach(() => {
    memorySurfaceStore.reset();
  });

  it('tracks runtime metadata and reads visible ranges outside Redux', () => {
    memorySurfaceStore.replaceFromRuntime({
      getMemory: () => ({
        0x1000: 0x4e,
        0x1001: 0x75,
      }),
      getMemoryMeta: () => ({
        usedBytes: 2,
        minAddress: 0x1000,
        maxAddress: 0x1001,
        version: 3,
      }),
      readMemoryRange: (address, length) => {
        const bytes = new Uint8Array(length);
        if (address === 0x1000 && length >= 2) {
          bytes[0] = 0x4e;
          bytes[1] = 0x75;
        }
        return bytes;
      },
    });

    expect(memorySurfaceStore.getSnapshot().meta).toEqual({
      usedBytes: 2,
      minAddress: 0x1000,
      maxAddress: 0x1001,
      version: 3,
    });
    expect(Array.from(memorySurfaceStore.readRange(0x1000, 4))).toEqual([0x4e, 0x75, 0x00, 0x00]);
    expect(memorySurfaceStore.exportMemory()).toEqual({
      0x1000: 0x4e,
      0x1001: 0x75,
    });
  });
});
