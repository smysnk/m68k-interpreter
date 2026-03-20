import {
  clearTerminalFrameBufferDirtyRows,
  TERMINAL_BUFFER_COLOR_DEFAULT,
  TERMINAL_BUFFER_FLAG_BOLD,
  TERMINAL_BUFFER_FLAG_INVERSE,
  TERMINAL_BUFFER_SPACE_BYTE,
  createTerminalFrameBuffer,
  readTerminalFrameBufferLine,
  readTerminalFrameBufferText,
  resetTerminalFrameBuffer,
  resizeTerminalFrameBuffer,
  type TerminalFrameBuffer,
  type TerminalMeta,
  type TerminalSnapshot,
} from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';

export interface TerminalSurfaceSnapshot {
  frameBuffer: TerminalFrameBuffer;
  meta: TerminalMeta;
  dirtyRows: number[];
}

type Listener = () => void;
type TerminalSurfaceRuntime = Pick<IdeRuntimeSession, 'getTerminalFrameBuffer' | 'getTerminalMeta'>;

function createTerminalMeta(
  frameBuffer: TerminalFrameBuffer,
  overrides: Partial<TerminalMeta> = {}
): TerminalMeta {
  return {
    columns: frameBuffer.columns,
    rows: frameBuffer.rows,
    cursorRow: 0,
    cursorColumn: 0,
    output: '',
    version: frameBuffer.version,
    geometryVersion: frameBuffer.geometryVersion,
    ...overrides,
  };
}

function terminalMetaEquals(left: TerminalMeta, right: TerminalMeta): boolean {
  return (
    left.columns === right.columns &&
    left.rows === right.rows &&
    left.cursorRow === right.cursorRow &&
    left.cursorColumn === right.cursorColumn &&
    left.output === right.output &&
    left.version === right.version &&
    left.geometryVersion === right.geometryVersion
  );
}

function toTerminalByte(value: string | undefined): number {
  if (!value || value.length === 0) {
    return TERMINAL_BUFFER_SPACE_BYTE;
  }

  return value.charCodeAt(0) & 0xff;
}

function copySnapshotIntoFrameBuffer(
  frameBuffer: TerminalFrameBuffer,
  snapshot: TerminalSnapshot
): TerminalFrameBuffer {
  if (frameBuffer.columns !== snapshot.columns || frameBuffer.rows !== snapshot.rows) {
    resizeTerminalFrameBuffer(frameBuffer, snapshot.columns, snapshot.rows);
  } else {
    resetTerminalFrameBuffer(frameBuffer);
  }

  for (let row = 0; row < snapshot.rows; row += 1) {
    const line = snapshot.lines[row] ?? '';
    const cells = snapshot.cells[row] ?? [];

    for (let column = 0; column < snapshot.columns; column += 1) {
      const offset = row * snapshot.columns + column;
      const cell = cells[column];

      frameBuffer.charBytes[offset] = toTerminalByte(cell?.char ?? line[column]);
      frameBuffer.foregroundBytes[offset] =
        cell?.foreground === null || cell?.foreground === undefined
          ? TERMINAL_BUFFER_COLOR_DEFAULT
          : cell.foreground & 0xff;
      frameBuffer.backgroundBytes[offset] =
        cell?.background === null || cell?.background === undefined
          ? TERMINAL_BUFFER_COLOR_DEFAULT
          : cell.background & 0xff;

      let flags = 0;
      if (cell?.bold) {
        flags |= TERMINAL_BUFFER_FLAG_BOLD;
      }
      if (cell?.inverse) {
        flags |= TERMINAL_BUFFER_FLAG_INVERSE;
      }
      frameBuffer.flagBytes[offset] = flags;
    }

    frameBuffer.dirtyRowFlags[row] = 1;
  }

  frameBuffer.version += 1;
  return frameBuffer;
}

function collectDirtyRows(frameBuffer: TerminalFrameBuffer): number[] {
  const dirtyRows: number[] = [];

  for (let row = 0; row < frameBuffer.rows; row += 1) {
    if (frameBuffer.dirtyRowFlags[row] === 1) {
      dirtyRows.push(row);
    }
  }

  return dirtyRows;
}

class TerminalSurfaceStore {
  private readonly listeners = new Set<Listener>();
  private readonly fallbackFrameBuffer = createTerminalFrameBuffer();
  private snapshot: TerminalSurfaceSnapshot = {
    frameBuffer: this.fallbackFrameBuffer,
    meta: createTerminalMeta(this.fallbackFrameBuffer),
    dirtyRows: collectDirtyRows(this.fallbackFrameBuffer),
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): TerminalSurfaceSnapshot => this.snapshot;

  getServerSnapshot = (): TerminalSurfaceSnapshot => this.snapshot;

  publishFrame(frameBuffer: TerminalFrameBuffer, meta: TerminalMeta): void {
    this.publish(frameBuffer, meta);
  }

  replaceFromRuntime(runtime: TerminalSurfaceRuntime): void {
    this.publishFrame(runtime.getTerminalFrameBuffer(), runtime.getTerminalMeta());
  }

  replaceFromSnapshot(snapshot: TerminalSnapshot): void {
    const frameBuffer = copySnapshotIntoFrameBuffer(this.fallbackFrameBuffer, snapshot);

    this.publish(
      frameBuffer,
      createTerminalMeta(frameBuffer, {
        columns: snapshot.columns,
        rows: snapshot.rows,
        cursorRow: snapshot.cursorRow,
        cursorColumn: snapshot.cursorColumn,
        output: snapshot.output,
      })
    );
  }

  reset(columns = this.fallbackFrameBuffer.columns, rows = this.fallbackFrameBuffer.rows): void {
    if (columns !== this.fallbackFrameBuffer.columns || rows !== this.fallbackFrameBuffer.rows) {
      resizeTerminalFrameBuffer(this.fallbackFrameBuffer, columns, rows);
    } else {
      resetTerminalFrameBuffer(this.fallbackFrameBuffer);
    }

    this.publish(this.fallbackFrameBuffer, createTerminalMeta(this.fallbackFrameBuffer));
  }

  getLines(): string[] {
    return Array.from({ length: this.snapshot.meta.rows }, (_, row) =>
      readTerminalFrameBufferLine(this.snapshot.frameBuffer, row)
    );
  }

  getText(): string {
    return readTerminalFrameBufferText(this.snapshot.frameBuffer);
  }

  private publish(frameBuffer: TerminalFrameBuffer, meta: TerminalMeta): void {
    const dirtyRows = collectDirtyRows(frameBuffer);

    if (
      this.snapshot.frameBuffer === frameBuffer &&
      terminalMetaEquals(this.snapshot.meta, meta) &&
      dirtyRows.length === 0
    ) {
      return;
    }

    this.snapshot = { frameBuffer, meta, dirtyRows };
    clearTerminalFrameBufferDirtyRows(frameBuffer);

    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const terminalSurfaceStore = new TerminalSurfaceStore();
