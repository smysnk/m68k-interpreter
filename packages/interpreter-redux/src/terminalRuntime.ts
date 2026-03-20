import {
  TerminalDevice,
  type TerminalFrameBuffer,
  type TerminalMeta,
  type TerminalSnapshot,
} from '@m68k/interpreter';
import type { TerminalState } from './state';

function writeOutputToTerminalDevice(terminal: TerminalDevice, output: string): void {
  for (const char of output) {
    terminal.writeByte(char.charCodeAt(0));
  }
}

export class ReducerTerminalRuntime {
  private terminal: TerminalDevice;
  private syncedColumns: number;
  private syncedRows: number;
  private syncedOutput: string;

  constructor(state: TerminalState) {
    this.terminal = new TerminalDevice({
      columns: state.columns,
      rows: state.rows,
    });
    this.syncedColumns = state.columns;
    this.syncedRows = state.rows;
    this.syncedOutput = '';
    this.synchronize(state);
  }

  synchronize(state: TerminalState): void {
    const geometryChanged =
      state.columns !== this.syncedColumns || state.rows !== this.syncedRows;

    if (geometryChanged) {
      this.terminal = new TerminalDevice({
        columns: state.columns,
        rows: state.rows,
      });
      this.syncedColumns = state.columns;
      this.syncedRows = state.rows;
      this.syncedOutput = '';
    }

    const nextOutput = state.output;

    if (nextOutput === this.syncedOutput) {
      return;
    }

    if (
      !nextOutput ||
      nextOutput.length < this.syncedOutput.length ||
      !nextOutput.startsWith(this.syncedOutput)
    ) {
      this.terminal.reset();
      if (nextOutput.length > 0) {
        writeOutputToTerminalDevice(this.terminal, nextOutput);
      }
    } else {
      writeOutputToTerminalDevice(
        this.terminal,
        nextOutput.slice(this.syncedOutput.length)
      );
    }

    this.syncedOutput = nextOutput;
  }

  getSnapshot(): TerminalSnapshot {
    return this.terminal.getDebugSnapshot();
  }

  getDebugSnapshot(): TerminalSnapshot {
    return this.terminal.getDebugSnapshot();
  }

  getFrameBuffer(): TerminalFrameBuffer {
    return this.terminal.getFrameBuffer();
  }

  getTerminalMeta(): TerminalMeta {
    return this.terminal.getTerminalMeta();
  }

  getLines(): string[] {
    return this.terminal.getLines();
  }

  getText(): string {
    return this.terminal.getText();
  }
}

export function createReducerTerminalSnapshot(state: TerminalState): TerminalSnapshot {
  return new ReducerTerminalRuntime(state).getDebugSnapshot();
}

export function createReducerTerminalLines(state: TerminalState): string[] {
  return new ReducerTerminalRuntime(state).getLines();
}

export function createReducerTerminalText(state: TerminalState): string {
  return new ReducerTerminalRuntime(state).getText();
}
