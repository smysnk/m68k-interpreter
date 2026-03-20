import type {
  TerminalFrameBuffer,
  TerminalMeta,
  TerminalSnapshot,
} from '@m68k/interpreter';
import { ReducerMemoryRuntime } from './memoryRuntime';
import { ReducerTerminalRuntime } from './terminalRuntime';
import { ReducerIoUndoStack } from './ioRuntimeUndo';
import type { LoadedProgramState, TerminalState } from './state';

export class ReducerIoRuntime {
  readonly memory: ReducerMemoryRuntime;
  readonly terminal: ReducerTerminalRuntime;
  readonly undo: ReducerIoUndoStack;

  constructor(
    program: LoadedProgramState,
    terminalState: TerminalState
  ) {
    this.memory = new ReducerMemoryRuntime(program.memoryImage);
    this.terminal = new ReducerTerminalRuntime(terminalState);
    this.undo = new ReducerIoUndoStack();
  }

  loadProgram(program: LoadedProgramState, terminalState: TerminalState): void {
    this.memory.reset(program.memoryImage);
    this.undo.clear();
    this.terminal.synchronize(terminalState);
  }

  synchronizeTerminal(terminalState: TerminalState): void {
    this.terminal.synchronize(terminalState);
  }

  getTerminalFrameBuffer(): TerminalFrameBuffer {
    return this.terminal.getFrameBuffer();
  }

  getTerminalMeta(): TerminalMeta {
    return this.terminal.getTerminalMeta();
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return this.terminal.getSnapshot();
  }

  getTerminalLines(): string[] {
    return this.terminal.getLines();
  }

  getTerminalText(): string {
    return this.terminal.getText();
  }
}
