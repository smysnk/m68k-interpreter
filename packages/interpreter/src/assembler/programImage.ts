export interface ProgramSourceMapEntry {
  address: number;
  length: number;
  line: number;
  column?: number;
  kind: 'instruction' | 'data';
}

export interface ProgramImage {
  bytes: Uint8Array;
  loadAddress: number;
  entryPoint: number;
  endAddress: number;
  sourceMap: readonly ProgramSourceMapEntry[];
}

export interface ProgramImageChunk {
  bytes: Uint8Array;
  line: number;
  column?: number;
  kind?: 'instruction' | 'data';
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
      kind: chunk.kind ?? 'instruction',
    });
    offset += chunk.bytes.length;
  }

  return {
    bytes,
    loadAddress: origin,
    entryPoint: options.entryPoint ?? origin,
    endAddress: origin + bytes.length,
    sourceMap,
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
