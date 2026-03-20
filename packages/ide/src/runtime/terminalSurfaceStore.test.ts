import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalFrameBuffer } from '@m68k/interpreter';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';

describe('terminalSurfaceStore', () => {
  beforeEach(() => {
    terminalSurfaceStore.reset();
  });

  it('hydrates the fallback buffer from a terminal snapshot', () => {
    const initialFrameBuffer = terminalSurfaceStore.getSnapshot().frameBuffer;

    terminalSurfaceStore.replaceFromSnapshot({
      columns: 4,
      rows: 2,
      cursorRow: 1,
      cursorColumn: 2,
      output: 'AB\r\nCD',
      lines: ['AB  ', 'CD  '],
      cells: [
        [
          { char: 'A', foreground: null, background: null, bold: false, inverse: false },
          { char: 'B', foreground: null, background: null, bold: false, inverse: false },
          { char: ' ', foreground: null, background: null, bold: false, inverse: false },
          { char: ' ', foreground: null, background: null, bold: false, inverse: false },
        ],
        [
          { char: 'C', foreground: null, background: null, bold: false, inverse: false },
          { char: 'D', foreground: null, background: null, bold: false, inverse: false },
          { char: ' ', foreground: null, background: null, bold: false, inverse: false },
          { char: ' ', foreground: null, background: null, bold: false, inverse: false },
        ],
      ],
    });

    const snapshot = terminalSurfaceStore.getSnapshot();

    expect(snapshot.frameBuffer).toBe(initialFrameBuffer);
    expect(snapshot.dirtyRows).toEqual([0, 1]);
    expect(snapshot.meta.columns).toBe(4);
    expect(snapshot.meta.rows).toBe(2);
    expect(snapshot.meta.cursorRow).toBe(1);
    expect(snapshot.meta.cursorColumn).toBe(2);
    expect(snapshot.meta.output).toBe('AB\r\nCD');
    expect(terminalSurfaceStore.getLines()).toEqual(['AB  ', 'CD  ']);
    expect(terminalSurfaceStore.getText()).toBe('AB  \nCD  ');
  });

  it('can switch to a runtime-owned frame buffer and notify subscribers', () => {
    const runtimeFrameBuffer = createTerminalFrameBuffer(3, 1);
    runtimeFrameBuffer.charBytes.set([...'XYZ'].map((char) => char.charCodeAt(0)));
    runtimeFrameBuffer.dirtyRowFlags[0] = 1;
    runtimeFrameBuffer.version += 1;

    const listener = vi.fn();
    const unsubscribe = terminalSurfaceStore.subscribe(listener);

    terminalSurfaceStore.replaceFromRuntime({
      getTerminalFrameBuffer: () => runtimeFrameBuffer,
      getTerminalMeta: () => ({
        columns: 3,
        rows: 1,
        cursorRow: 0,
        cursorColumn: 3,
        output: 'XYZ',
        version: runtimeFrameBuffer.version,
        geometryVersion: runtimeFrameBuffer.geometryVersion,
      }),
    });

    const snapshot = terminalSurfaceStore.getSnapshot();
    expect(snapshot.frameBuffer).toBe(runtimeFrameBuffer);
    expect(snapshot.dirtyRows).toEqual([0]);
    expect(snapshot.meta.output).toBe('XYZ');
    expect(terminalSurfaceStore.getText()).toBe('XYZ');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(Array.from(runtimeFrameBuffer.dirtyRowFlags)).toEqual([0]);

    unsubscribe();
  });
});
