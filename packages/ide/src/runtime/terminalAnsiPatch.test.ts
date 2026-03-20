import { describe, expect, it } from 'vitest';
import {
  TERMINAL_BUFFER_COLOR_DEFAULT,
  TERMINAL_BUFFER_FLAG_BOLD,
  createTerminalFrameBuffer,
} from '@m68k/interpreter';
import {
  buildTerminalAnsiFullRedraw,
  buildTerminalAnsiRowPatch,
} from '@/runtime/terminalAnsiPatch';

describe('terminalAnsiPatch', () => {
  it('builds a cursor-addressed ANSI patch for dirty rows only', () => {
    const frameBuffer = createTerminalFrameBuffer(4, 2);
    frameBuffer.charBytes.set([
      'A'.charCodeAt(0),
      'B'.charCodeAt(0),
      'C'.charCodeAt(0),
      'D'.charCodeAt(0),
      '1'.charCodeAt(0),
      '2'.charCodeAt(0),
      '3'.charCodeAt(0),
      '4'.charCodeAt(0),
    ]);
    frameBuffer.foregroundBytes[5] = 34;
    frameBuffer.backgroundBytes[5] = 235;
    frameBuffer.flagBytes[5] = TERMINAL_BUFFER_FLAG_BOLD;

    const patch = buildTerminalAnsiRowPatch(frameBuffer, [1]);

    expect(patch).toContain('\x1b[2;1H');
    expect(patch).toContain('\x1b[0m1');
    expect(patch).toContain('\x1b[0;1;38;5;34;48;5;235m2');
    expect(patch).not.toContain('\x1b[1;1H');
    expect(patch.endsWith('\x1b[0m')).toBe(true);
  });

  it('can build a full redraw patch across all rows', () => {
    const frameBuffer = createTerminalFrameBuffer(3, 2);
    frameBuffer.charBytes.set([
      'X'.charCodeAt(0),
      'Y'.charCodeAt(0),
      'Z'.charCodeAt(0),
      '7'.charCodeAt(0),
      '8'.charCodeAt(0),
      '9'.charCodeAt(0),
    ]);
    frameBuffer.foregroundBytes.fill(TERMINAL_BUFFER_COLOR_DEFAULT);
    frameBuffer.backgroundBytes.fill(TERMINAL_BUFFER_COLOR_DEFAULT);

    const patch = buildTerminalAnsiFullRedraw(frameBuffer);

    expect(patch).toContain('\x1b[1;1H');
    expect(patch).toContain('\x1b[2;1H');
    expect(patch).toContain('XYZ');
    expect(patch).toContain('789');
  });
});
