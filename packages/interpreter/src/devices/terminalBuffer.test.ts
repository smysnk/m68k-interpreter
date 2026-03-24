import { describe, expect, it } from 'vitest';
import {
  TERMINAL_BUFFER_COLOR_DEFAULT,
  createTerminalFrameBuffer,
  clearTerminalFrameBufferDirtyRows,
  readTerminalFrameBufferCell,
  readTerminalFrameBufferLine,
  readTerminalFrameBufferText,
  resizeTerminalFrameBuffer,
  writeTerminalFrameBufferCell,
} from './terminalBuffer';

describe('terminalBuffer', () => {
  it('allocates a contiguous byte buffer with reusable plane views', () => {
    const frameBuffer = createTerminalFrameBuffer(4, 3);

    expect(frameBuffer.cellCount).toBe(12);
    expect(frameBuffer.data.length).toBe(12 * 4 + 3);
    expect(frameBuffer.charBytes.length).toBe(12);
    expect(frameBuffer.foregroundBytes.length).toBe(12);
    expect(frameBuffer.backgroundBytes.length).toBe(12);
    expect(frameBuffer.flagBytes.length).toBe(12);
    expect(frameBuffer.dirtyRowFlags.length).toBe(3);
    expect(readTerminalFrameBufferLine(frameBuffer, 0)).toBe('    ');
    expect(Array.from(frameBuffer.dirtyRowFlags)).toEqual([1, 1, 1]);
    expect(frameBuffer.foregroundBytes[0]).toBe(TERMINAL_BUFFER_COLOR_DEFAULT);
    expect(frameBuffer.backgroundBytes[0]).toBe(TERMINAL_BUFFER_COLOR_DEFAULT);
  });

  it('writes cell bytes in place and marks only the affected row dirty', () => {
    const frameBuffer = createTerminalFrameBuffer(5, 2);
    const backingStore = frameBuffer.data;
    const initialVersion = frameBuffer.version;

    clearTerminalFrameBufferDirtyRows(frameBuffer);
    writeTerminalFrameBufferCell(frameBuffer, 1, 3, {
      charByte: '!'.charCodeAt(0),
      foreground: 33,
      background: 40,
      bold: true,
    });

    expect(frameBuffer.data).toBe(backingStore);
    expect(frameBuffer.version).toBe(initialVersion + 1);
    expect(Array.from(frameBuffer.dirtyRowFlags)).toEqual([0, 1]);
    expect(readTerminalFrameBufferCell(frameBuffer, 1, 3)).toEqual({
      charByte: '!'.charCodeAt(0),
      char: '!',
      foreground: 33,
      background: 40,
      bold: true,
      inverse: false,
    });

    const versionAfterFirstWrite = frameBuffer.version;
    writeTerminalFrameBufferCell(frameBuffer, 1, 3, {
      charByte: '!'.charCodeAt(0),
      foreground: 33,
      background: 40,
      bold: true,
    });

    expect(frameBuffer.version).toBe(versionAfterFirstWrite);
  });

  it('reuses the same frame buffer object and only reallocates backing storage when geometry changes', () => {
    const frameBuffer = createTerminalFrameBuffer(3, 2);
    const originalData = frameBuffer.data;
    const originalGeometryVersion = frameBuffer.geometryVersion;

    writeTerminalFrameBufferCell(frameBuffer, 0, 0, { charByte: 'A'.charCodeAt(0) });

    const sameGeometryBuffer = resizeTerminalFrameBuffer(frameBuffer, 3, 2);

    expect(sameGeometryBuffer).toBe(frameBuffer);
    expect(frameBuffer.data).toBe(originalData);
    expect(frameBuffer.geometryVersion).toBe(originalGeometryVersion);
    expect(readTerminalFrameBufferLine(frameBuffer, 0)).toBe('   ');

    const resizedBuffer = resizeTerminalFrameBuffer(frameBuffer, 4, 3);

    expect(resizedBuffer).toBe(frameBuffer);
    expect(frameBuffer.data).not.toBe(originalData);
    expect(frameBuffer.columns).toBe(4);
    expect(frameBuffer.rows).toBe(3);
    expect(frameBuffer.geometryVersion).toBe(originalGeometryVersion + 1);
    expect(Array.from(frameBuffer.dirtyRowFlags)).toEqual([1, 1, 1]);
  });

  it('serializes the byte buffer back into line and text form for tests and debug tooling', () => {
    const frameBuffer = createTerminalFrameBuffer(4, 2);

    writeTerminalFrameBufferCell(frameBuffer, 0, 0, { charByte: 'N'.charCodeAt(0) });
    writeTerminalFrameBufferCell(frameBuffer, 0, 1, { charByte: 'O'.charCodeAt(0) });
    writeTerminalFrameBufferCell(frameBuffer, 1, 2, { charByte: 'K'.charCodeAt(0), inverse: true });

    expect(readTerminalFrameBufferLine(frameBuffer, 0)).toBe('NO  ');
    expect(readTerminalFrameBufferText(frameBuffer)).toBe('NO  \n  K ');
    expect(readTerminalFrameBufferCell(frameBuffer, 1, 2).inverse).toBe(true);
  });

  it('decodes CP437 screen bytes when reading terminal text back out', () => {
    const frameBuffer = createTerminalFrameBuffer(4, 1);

    writeTerminalFrameBufferCell(frameBuffer, 0, 0, { charByte: 0xda });
    writeTerminalFrameBufferCell(frameBuffer, 0, 1, { charByte: 0xc4 });
    writeTerminalFrameBufferCell(frameBuffer, 0, 2, { charByte: 0xc4 });
    writeTerminalFrameBufferCell(frameBuffer, 0, 3, { charByte: 0xbf });

    expect(readTerminalFrameBufferLine(frameBuffer, 0)).toBe('┌──┐');
    expect(readTerminalFrameBufferCell(frameBuffer, 0, 0).char).toBe('┌');
  });
});
