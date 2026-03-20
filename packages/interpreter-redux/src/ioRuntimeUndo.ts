import type { MemoryUndoPageEntry } from '@m68k/interpreter';
import {
  cloneInterpreterReducerState,
  MAX_HISTORY_FRAMES,
  type InterpreterReducerState,
} from './state';

export interface ReducerIoUndoFrame {
  state: InterpreterReducerState;
  memoryJournal: MemoryUndoPageEntry[];
}

export class ReducerIoUndoStack {
  private readonly frames: ReducerIoUndoFrame[] = [];

  push(frame: ReducerIoUndoFrame): void {
    this.frames.push({
      state: cloneInterpreterReducerState(frame.state),
      memoryJournal: frame.memoryJournal,
    });

    if (this.frames.length > MAX_HISTORY_FRAMES) {
      this.frames.shift();
    }
  }

  pop(): ReducerIoUndoFrame | undefined {
    return this.frames.pop();
  }

  clear(): void {
    this.frames.length = 0;
  }

  size(): number {
    return this.frames.length;
  }
}
