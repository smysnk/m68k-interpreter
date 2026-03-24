import { decodeTerminalByte } from './terminalCharset';

export const DEFAULT_TERMINAL_BUFFER_COLUMNS = 80;
export const DEFAULT_TERMINAL_BUFFER_ROWS = 25;
export const TERMINAL_BUFFER_SPACE_BYTE = 0x20;
export const TERMINAL_BUFFER_COLOR_DEFAULT = 0xff;
export const TERMINAL_BUFFER_FLAG_BOLD = 1 << 0;
export const TERMINAL_BUFFER_FLAG_INVERSE = 1 << 1;

export interface TerminalFrameBuffer {
  columns: number;
  rows: number;
  cellCount: number;
  data: Uint8Array;
  charBytes: Uint8Array;
  foregroundBytes: Uint8Array;
  backgroundBytes: Uint8Array;
  flagBytes: Uint8Array;
  dirtyRowFlags: Uint8Array;
  version: number;
  geometryVersion: number;
}

export interface TerminalFrameBufferCellWrite {
  charByte?: number;
  foreground?: number | null;
  background?: number | null;
  bold?: boolean;
  inverse?: boolean;
}

export interface TerminalFrameBufferCellSnapshot {
  charByte: number;
  char: string;
  foreground: number | null;
  background: number | null;
  bold: boolean;
  inverse: boolean;
}

function normalizeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeByte(value: number): number {
  return value & 0xff;
}

function normalizeColorByte(value: number | null | undefined): number {
  return value === null || value === undefined ? TERMINAL_BUFFER_COLOR_DEFAULT : normalizeByte(value);
}

function encodeFlags(
  bold: boolean,
  inverse: boolean
): number {
  let flags = 0;

  if (bold) {
    flags |= TERMINAL_BUFFER_FLAG_BOLD;
  }

  if (inverse) {
    flags |= TERMINAL_BUFFER_FLAG_INVERSE;
  }

  return flags;
}

function allocateTerminalFrameBufferData(columns: number, rows: number): Uint8Array {
  const cellCount = columns * rows;
  return new Uint8Array(cellCount * 4 + rows);
}

function assignTerminalFrameBufferViews(
  frameBuffer: TerminalFrameBuffer,
  data: Uint8Array,
  columns: number,
  rows: number
): void {
  const cellCount = columns * rows;
  let offset = 0;

  frameBuffer.columns = columns;
  frameBuffer.rows = rows;
  frameBuffer.cellCount = cellCount;
  frameBuffer.data = data;
  frameBuffer.charBytes = data.subarray(offset, offset + cellCount);
  offset += cellCount;
  frameBuffer.foregroundBytes = data.subarray(offset, offset + cellCount);
  offset += cellCount;
  frameBuffer.backgroundBytes = data.subarray(offset, offset + cellCount);
  offset += cellCount;
  frameBuffer.flagBytes = data.subarray(offset, offset + cellCount);
  offset += cellCount;
  frameBuffer.dirtyRowFlags = data.subarray(offset, offset + rows);
}

function assertCellInBounds(
  frameBuffer: TerminalFrameBuffer,
  row: number,
  column: number
): void {
  if (row < 0 || row >= frameBuffer.rows || column < 0 || column >= frameBuffer.columns) {
    throw new RangeError(
      `Terminal frame buffer cell ${row}:${column} is out of bounds for ${frameBuffer.columns}x${frameBuffer.rows}`
    );
  }
}

function getCellOffset(frameBuffer: TerminalFrameBuffer, row: number, column: number): number {
  return row * frameBuffer.columns + column;
}

function fillTerminalFrameBufferDefaults(frameBuffer: TerminalFrameBuffer): void {
  frameBuffer.charBytes.fill(TERMINAL_BUFFER_SPACE_BYTE);
  frameBuffer.foregroundBytes.fill(TERMINAL_BUFFER_COLOR_DEFAULT);
  frameBuffer.backgroundBytes.fill(TERMINAL_BUFFER_COLOR_DEFAULT);
  frameBuffer.flagBytes.fill(0);
  frameBuffer.dirtyRowFlags.fill(1);
}

export function createTerminalFrameBuffer(
  columns = DEFAULT_TERMINAL_BUFFER_COLUMNS,
  rows = DEFAULT_TERMINAL_BUFFER_ROWS
): TerminalFrameBuffer {
  const normalizedColumns = normalizeDimension(columns, DEFAULT_TERMINAL_BUFFER_COLUMNS);
  const normalizedRows = normalizeDimension(rows, DEFAULT_TERMINAL_BUFFER_ROWS);
  const frameBuffer = {
    columns: normalizedColumns,
    rows: normalizedRows,
    cellCount: normalizedColumns * normalizedRows,
    data: new Uint8Array(),
    charBytes: new Uint8Array(),
    foregroundBytes: new Uint8Array(),
    backgroundBytes: new Uint8Array(),
    flagBytes: new Uint8Array(),
    dirtyRowFlags: new Uint8Array(),
    version: 1,
    geometryVersion: 1,
  } satisfies TerminalFrameBuffer;

  assignTerminalFrameBufferViews(
    frameBuffer,
    allocateTerminalFrameBufferData(normalizedColumns, normalizedRows),
    normalizedColumns,
    normalizedRows
  );
  fillTerminalFrameBufferDefaults(frameBuffer);

  return frameBuffer;
}

export function resetTerminalFrameBuffer(frameBuffer: TerminalFrameBuffer): TerminalFrameBuffer {
  fillTerminalFrameBufferDefaults(frameBuffer);
  frameBuffer.version += 1;
  return frameBuffer;
}

export function resizeTerminalFrameBuffer(
  frameBuffer: TerminalFrameBuffer,
  columns: number,
  rows: number
): TerminalFrameBuffer {
  const normalizedColumns = normalizeDimension(columns, frameBuffer.columns);
  const normalizedRows = normalizeDimension(rows, frameBuffer.rows);

  if (normalizedColumns === frameBuffer.columns && normalizedRows === frameBuffer.rows) {
    return resetTerminalFrameBuffer(frameBuffer);
  }

  assignTerminalFrameBufferViews(
    frameBuffer,
    allocateTerminalFrameBufferData(normalizedColumns, normalizedRows),
    normalizedColumns,
    normalizedRows
  );
  fillTerminalFrameBufferDefaults(frameBuffer);
  frameBuffer.geometryVersion += 1;
  frameBuffer.version += 1;
  return frameBuffer;
}

export function writeTerminalFrameBufferCell(
  frameBuffer: TerminalFrameBuffer,
  row: number,
  column: number,
  value: TerminalFrameBufferCellWrite
): TerminalFrameBuffer {
  assertCellInBounds(frameBuffer, row, column);
  const offset = getCellOffset(frameBuffer, row, column);
  const nextCharByte =
    value.charByte === undefined
      ? frameBuffer.charBytes[offset]
      : normalizeByte(value.charByte);
  const nextForeground =
    value.foreground === undefined
      ? frameBuffer.foregroundBytes[offset]
      : normalizeColorByte(value.foreground);
  const nextBackground =
    value.background === undefined
      ? frameBuffer.backgroundBytes[offset]
      : normalizeColorByte(value.background);
  const currentFlags = frameBuffer.flagBytes[offset];
  const nextFlags = encodeFlags(
    value.bold === undefined ? (currentFlags & TERMINAL_BUFFER_FLAG_BOLD) !== 0 : value.bold,
    value.inverse === undefined ? (currentFlags & TERMINAL_BUFFER_FLAG_INVERSE) !== 0 : value.inverse
  );

  if (
    frameBuffer.charBytes[offset] === nextCharByte &&
    frameBuffer.foregroundBytes[offset] === nextForeground &&
    frameBuffer.backgroundBytes[offset] === nextBackground &&
    frameBuffer.flagBytes[offset] === nextFlags
  ) {
    return frameBuffer;
  }

  frameBuffer.charBytes[offset] = nextCharByte;
  frameBuffer.foregroundBytes[offset] = nextForeground;
  frameBuffer.backgroundBytes[offset] = nextBackground;
  frameBuffer.flagBytes[offset] = nextFlags;
  frameBuffer.dirtyRowFlags[row] = 1;
  frameBuffer.version += 1;

  return frameBuffer;
}

export function markTerminalFrameBufferRowDirty(
  frameBuffer: TerminalFrameBuffer,
  row: number
): TerminalFrameBuffer {
  if (row < 0 || row >= frameBuffer.rows) {
    throw new RangeError(`Terminal frame buffer row ${row} is out of bounds for ${frameBuffer.rows} rows`);
  }

  frameBuffer.dirtyRowFlags[row] = 1;
  return frameBuffer;
}

export function clearTerminalFrameBufferDirtyRows(
  frameBuffer: TerminalFrameBuffer
): TerminalFrameBuffer {
  frameBuffer.dirtyRowFlags.fill(0);
  return frameBuffer;
}

export function readTerminalFrameBufferCell(
  frameBuffer: TerminalFrameBuffer,
  row: number,
  column: number
): TerminalFrameBufferCellSnapshot {
  assertCellInBounds(frameBuffer, row, column);
  const offset = getCellOffset(frameBuffer, row, column);
  const flags = frameBuffer.flagBytes[offset];
  const charByte = frameBuffer.charBytes[offset];

  return {
    charByte,
    char: decodeTerminalByte(charByte),
    foreground:
      frameBuffer.foregroundBytes[offset] === TERMINAL_BUFFER_COLOR_DEFAULT
        ? null
        : frameBuffer.foregroundBytes[offset],
    background:
      frameBuffer.backgroundBytes[offset] === TERMINAL_BUFFER_COLOR_DEFAULT
        ? null
        : frameBuffer.backgroundBytes[offset],
    bold: (flags & TERMINAL_BUFFER_FLAG_BOLD) !== 0,
    inverse: (flags & TERMINAL_BUFFER_FLAG_INVERSE) !== 0,
  };
}

export function readTerminalFrameBufferLine(
  frameBuffer: TerminalFrameBuffer,
  row: number
): string {
  if (row < 0 || row >= frameBuffer.rows) {
    throw new RangeError(`Terminal frame buffer row ${row} is out of bounds for ${frameBuffer.rows} rows`);
  }

  const start = row * frameBuffer.columns;
  const end = start + frameBuffer.columns;
  return Array.from(frameBuffer.charBytes.subarray(start, end), (value) => decodeTerminalByte(value)).join('');
}

export function readTerminalFrameBufferText(frameBuffer: TerminalFrameBuffer): string {
  return Array.from({ length: frameBuffer.rows }, (_, row) =>
    readTerminalFrameBufferLine(frameBuffer, row)
  ).join('\n');
}
