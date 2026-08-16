import { describe, expect, it } from 'vitest';
import {
  MC68020_EFFECTIVE_ADDRESS_MODES,
  decodeIndexedExtension,
  encodeIndexedExtension,
  type IndexedExtension,
} from './effectiveAddressCodec';

describe('MC68020 typed effective-address extension codec', () => {
  it('defines all 18 architected addressing categories', () => {
    expect(new Set(MC68020_EFFECTIVE_ADDRESS_MODES).size).toBe(18);
  });

  it.each<IndexedExtension>([
    {
      format: 'brief',
      index: { kind: 'data', register: 2, size: 'word', scale: 4 },
      displacement: -7,
    },
    {
      format: 'full',
      baseSuppressed: false,
      index: { kind: 'address', register: 3, size: 'long', scale: 8 },
      baseDisplacement: { size: 'word', value: -200 },
      indirect: 'none',
      outerDisplacement: { size: 'null' },
    },
    {
      format: 'full',
      baseSuppressed: true,
      index: { kind: 'data', register: 1, size: 'long', scale: 2 },
      baseDisplacement: { size: 'long', value: 0x1234_5678 },
      indirect: 'preindexed',
      outerDisplacement: { size: 'word', value: -16 },
    },
    {
      format: 'full',
      baseSuppressed: false,
      index: undefined,
      baseDisplacement: { size: 'null' },
      indirect: 'postindexed',
      outerDisplacement: { size: 'long', value: 0x1020_3040 },
    },
  ])('round trips %#', (extension) => {
    const words = encodeIndexedExtension(extension);
    expect(decodeIndexedExtension(words)).toEqual({ extension, wordsConsumed: words.length });
  });

  it('rejects reserved full-format encodings', () => {
    expect(() => decodeIndexedExtension([0x0108])).toThrow(/Reserved/);
    expect(() => decodeIndexedExtension([0x0104])).toThrow(/Reserved/);
  });
});
