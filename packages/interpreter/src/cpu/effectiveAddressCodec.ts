export type IndexRegister = {
  readonly kind: 'data' | 'address';
  readonly register: number;
  readonly size: 'word' | 'long';
  readonly scale: 1 | 2 | 4 | 8;
};

export type Displacement =
  | { readonly size: 'null'; readonly value?: 0 }
  | { readonly size: 'word' | 'long'; readonly value: number };

export interface BriefIndexedExtension {
  readonly format: 'brief';
  readonly index: IndexRegister;
  readonly displacement: number;
}

export interface FullIndexedExtension {
  readonly format: 'full';
  readonly baseSuppressed: boolean;
  readonly index?: IndexRegister;
  readonly baseDisplacement: Displacement;
  readonly indirect: 'none' | 'preindexed' | 'postindexed';
  readonly outerDisplacement: Displacement;
}

export type IndexedExtension = BriefIndexedExtension | FullIndexedExtension;

export const MC68020_EFFECTIVE_ADDRESS_MODES = [
  'data-register',
  'address-register',
  'address-indirect',
  'postincrement',
  'predecrement',
  'displacement',
  'brief-indexed',
  'full-indexed',
  'memory-indirect-preindexed',
  'memory-indirect-postindexed',
  'absolute-short',
  'absolute-long',
  'pc-displacement',
  'pc-brief-indexed',
  'pc-full-indexed',
  'pc-memory-indirect-preindexed',
  'pc-memory-indirect-postindexed',
  'immediate',
] as const;

function signedWord(value: number): number {
  return (value << 16) >> 16;
}

function encodeDisplacement(displacement: Displacement): { code: number; words: number[] } {
  if (displacement.size === 'null') return { code: 1, words: [] };
  if (displacement.size === 'word') return { code: 2, words: [displacement.value & 0xffff] };
  return {
    code: 3,
    words: [(displacement.value >>> 16) & 0xffff, displacement.value & 0xffff],
  };
}

function decodeDisplacement(words: readonly number[], cursor: number, code: number): [Displacement, number] {
  if (code === 1) return [{ size: 'null' }, cursor];
  if (code === 2) return [{ size: 'word', value: signedWord(words[cursor] ?? 0) }, cursor + 1];
  if (code === 3) {
    const value = (((words[cursor] ?? 0) << 16) | (words[cursor + 1] ?? 0)) | 0;
    return [{ size: 'long', value }, cursor + 2];
  }
  throw new RangeError('Reserved full-index displacement-size encoding');
}

function encodeIndex(index: IndexRegister | undefined): number {
  if (index === undefined) return 0;
  if (!Number.isInteger(index.register) || index.register < 0 || index.register > 7) {
    throw new RangeError(`Index register must be from 0 through 7: ${index.register}`);
  }
  const scaleCode = Math.log2(index.scale);
  return (
    (index.kind === 'address' ? 0x8000 : 0) |
    (index.register << 12) |
    (index.size === 'long' ? 0x0800 : 0) |
    (scaleCode << 9)
  );
}

function decodeIndex(extension: number): IndexRegister {
  return {
    kind: (extension & 0x8000) !== 0 ? 'address' : 'data',
    register: (extension >>> 12) & 7,
    size: (extension & 0x0800) !== 0 ? 'long' : 'word',
    scale: (1 << ((extension >>> 9) & 3)) as 1 | 2 | 4 | 8,
  };
}

export function encodeIndexedExtension(extension: IndexedExtension): readonly number[] {
  if (extension.format === 'brief') {
    if (extension.displacement < -128 || extension.displacement > 127) {
      throw new RangeError('Brief-index displacement must fit a signed byte');
    }
    return [encodeIndex(extension.index) | (extension.displacement & 0xff)];
  }
  const base = encodeDisplacement(extension.baseDisplacement);
  const outer = encodeDisplacement(extension.outerDisplacement);
  const indirectSelection =
    extension.indirect === 'none'
      ? 0
      : (extension.indirect === 'postindexed' ? 4 : 0) | outer.code;
  if (extension.indirect !== 'none' && outer.code === 0) {
    throw new RangeError('Memory-indirect form requires a legal outer displacement');
  }
  const word =
    encodeIndex(extension.index) |
    0x0100 |
    (extension.baseSuppressed ? 0x0080 : 0) |
    (extension.index === undefined ? 0x0040 : 0) |
    (base.code << 4) |
    indirectSelection;
  return [word, ...base.words, ...(extension.indirect === 'none' ? [] : outer.words)];
}

export function decodeIndexedExtension(words: readonly number[]): {
  readonly extension: IndexedExtension;
  readonly wordsConsumed: number;
} {
  const first = words[0];
  if (first === undefined) throw new RangeError('Missing indexed extension word');
  if ((first & 0x0100) === 0) {
    return {
      extension: { format: 'brief', index: decodeIndex(first), displacement: (first << 24) >> 24 },
      wordsConsumed: 1,
    };
  }
  if ((first & 0x0008) !== 0 || (first & 7) === 4) {
    throw new RangeError('Reserved full-index extension encoding');
  }
  let cursor = 1;
  let baseDisplacement: Displacement;
  [baseDisplacement, cursor] = decodeDisplacement(words, cursor, (first >>> 4) & 3);
  const selection = first & 7;
  let outerDisplacement: Displacement = { size: 'null' };
  if (selection !== 0) [outerDisplacement, cursor] = decodeDisplacement(words, cursor, selection & 3);
  return {
    extension: {
      format: 'full',
      baseSuppressed: (first & 0x0080) !== 0,
      index: (first & 0x0040) !== 0 ? undefined : decodeIndex(first),
      baseDisplacement,
      indirect: selection === 0 ? 'none' : selection >= 5 ? 'postindexed' : 'preindexed',
      outerDisplacement,
    },
    wordsConsumed: cursor,
  };
}
