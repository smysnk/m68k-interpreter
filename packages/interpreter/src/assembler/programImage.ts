export interface ProgramSourceMapEntry {
  address: number;
  length: number;
  line: number;
  column?: number;
}

export interface ProgramImage {
  /** Compatibility view of the first segment. */
  bytes: Uint8Array;
  /** Compatibility load address of the first segment. */
  loadAddress: number;
  entryPoint: number;
  endAddress: number;
  segments: readonly ProgramImageSegment[];
  sourceMap: readonly ProgramSourceMapEntry[];
}

export interface ProgramImageSegment {
  address: number;
  bytes: Uint8Array;
}

export interface ProgramImageChunk {
  bytes: Uint8Array;
  line: number;
  column?: number;
}

export function createProgramImage(
  chunks: readonly ProgramImageChunk[],
  options: {
    origin?: number;
    entryPoint?: number;
  } = {}
): ProgramImage {
  const origin = options.origin ?? 0;
  const totalLength = chunks.reduce((length, chunk) => length + chunk.bytes.length, 0);
  const bytes = new Uint8Array(totalLength);
  const sourceMap: ProgramSourceMapEntry[] = [];
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk.bytes, offset);
    sourceMap.push({
      address: origin + offset,
      length: chunk.bytes.length,
      line: chunk.line,
      column: chunk.column,
    });
    offset += chunk.bytes.length;
  }

  return {
    bytes,
    loadAddress: origin,
    entryPoint: options.entryPoint ?? origin,
    endAddress: origin + bytes.length,
    segments: [{ address: origin, bytes }],
    sourceMap,
  };
}

export function createSegmentedProgramImage(
  segments: readonly ProgramImageSegment[],
  options: {
    entryPoint?: number;
    sourceMap?: readonly ProgramSourceMapEntry[];
  } = {}
): ProgramImage {
  const normalized = [...segments]
    .map((segment) => ({
      address: segment.address >>> 0,
      bytes:
        segment.bytes instanceof Uint8Array
          ? segment.bytes
          : Uint8Array.from(segment.bytes),
    }))
    .filter((segment) => segment.bytes.length > 0)
    .sort((left, right) => left.address - right.address);
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    if (previous.address + previous.bytes.length > normalized[index].address) {
      throw new RangeError('Program image segments must not overlap');
    }
  }
  const first = normalized[0] ?? { address: options.entryPoint ?? 0, bytes: new Uint8Array() };
  const last = normalized.at(-1) ?? first;
  return {
    bytes: first.bytes,
    loadAddress: first.address,
    entryPoint: (options.entryPoint ?? first.address) >>> 0,
    endAddress: (last.address + last.bytes.length) >>> 0,
    segments: normalized,
    sourceMap: options.sourceMap ?? [],
  };
}

export function findProgramSource(
  image: ProgramImage,
  address: number
): ProgramSourceMapEntry | undefined {
  return image.sourceMap.find(
    (entry) => address >= entry.address && address < entry.address + entry.length
  );
}
