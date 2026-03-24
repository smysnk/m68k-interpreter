import {
  TERMINAL_BUFFER_COLOR_DEFAULT,
  TERMINAL_BUFFER_FLAG_BOLD,
  TERMINAL_BUFFER_FLAG_INVERSE,
  decodeTerminalByte,
  type TerminalFrameBuffer,
} from '@m68k/interpreter';

const ESCAPE_PREFIX = '\x1b[';

function buildCursorMove(row: number, column: number): string {
  return `${ESCAPE_PREFIX}${row + 1};${column + 1}H`;
}

function buildCellStyleSequence(frameBuffer: TerminalFrameBuffer, offset: number): string {
  const codes = [0];
  const flags = frameBuffer.flagBytes[offset];
  const foreground = frameBuffer.foregroundBytes[offset];
  const background = frameBuffer.backgroundBytes[offset];

  if ((flags & TERMINAL_BUFFER_FLAG_BOLD) !== 0) {
    codes.push(1);
  }

  if ((flags & TERMINAL_BUFFER_FLAG_INVERSE) !== 0) {
    codes.push(7);
  }

  if (foreground !== TERMINAL_BUFFER_COLOR_DEFAULT) {
    codes.push(38, 5, foreground);
  }

  if (background !== TERMINAL_BUFFER_COLOR_DEFAULT) {
    codes.push(48, 5, background);
  }

  return `${ESCAPE_PREFIX}${codes.join(';')}m`;
}

function cellStyleKey(frameBuffer: TerminalFrameBuffer, offset: number): string {
  return [
    frameBuffer.foregroundBytes[offset],
    frameBuffer.backgroundBytes[offset],
    frameBuffer.flagBytes[offset],
  ].join(':');
}

export function buildTerminalAnsiRowPatch(
  frameBuffer: TerminalFrameBuffer,
  dirtyRows: readonly number[]
): string {
  if (dirtyRows.length === 0) {
    return '';
  }

  let patch = '';

  for (const row of dirtyRows) {
    if (row < 0 || row >= frameBuffer.rows) {
      continue;
    }

    patch += buildCursorMove(row, 0);
    let previousStyleKey: string | null = null;

    for (let column = 0; column < frameBuffer.columns; column += 1) {
      const offset = row * frameBuffer.columns + column;
      const nextStyleKey = cellStyleKey(frameBuffer, offset);

      if (nextStyleKey !== previousStyleKey) {
        patch += buildCellStyleSequence(frameBuffer, offset);
        previousStyleKey = nextStyleKey;
      }

      patch += decodeTerminalByte(frameBuffer.charBytes[offset]);
    }

    patch += `${ESCAPE_PREFIX}0m`;
  }

  return patch;
}

export function buildTerminalAnsiFullRedraw(frameBuffer: TerminalFrameBuffer): string {
  return buildTerminalAnsiRowPatch(
    frameBuffer,
    Array.from({ length: frameBuffer.rows }, (_, row) => row)
  );
}
