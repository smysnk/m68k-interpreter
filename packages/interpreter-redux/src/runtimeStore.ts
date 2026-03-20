import type { ProgramSource, TerminalFrameBuffer, TerminalMeta, TerminalSnapshot } from '@m68k/interpreter';
import { interpreterReduxActions, type InterpreterReduxAction } from './actions';
import {
  createInterpreterReduxStateForProgram,
  reduceInstructionStep,
} from './instructionReducer';
import { ReducerIoRuntime } from './ioRuntime';
import type { ReducerIoUndoFrame } from './ioRuntimeUndo';
import {
  cloneInterpreterReducerState,
  cloneLoadedProgramState,
  createHistoryState,
  type InterpreterReducerState,
} from './state';
import { interpreterReducer } from './reducer';

function synchronizeHistoryDepth(state: InterpreterReducerState, undoDepth: number): InterpreterReducerState {
  if (state.history.undoDepth === undoDepth) {
    return state;
  }

  return {
    ...state,
    history: createHistoryState({
      undoDepth,
    }),
  };
}

export class ReducerRuntimeStore {
  private state: InterpreterReducerState;
  private readonly ioRuntime: ReducerIoRuntime;

  constructor(initialState: InterpreterReducerState = createInterpreterReduxStateForProgram('')) {
    this.state = cloneInterpreterReducerState(initialState);
    this.ioRuntime = new ReducerIoRuntime(this.state.program, this.state.terminal);
    this.synchronizeStateMetadata();
  }

  getState(): InterpreterReducerState {
    return this.state;
  }

  dispatch(action: InterpreterReduxAction): InterpreterReducerState {
    switch (action.type) {
      case 'programLoaded':
        this.applyLoadedState({
          ...createInterpreterReduxStateForProgram(action.payload.source, {
            columns: this.state.terminal.columns,
            rows: this.state.terminal.rows,
          }),
          program: cloneLoadedProgramState(action.payload),
        });
        return this.state;
      case 'programSourceLoaded':
        this.applyLoadedState(
          createInterpreterReduxStateForProgram(action.payload.source, {
            columns: action.payload.columns ?? this.state.terminal.columns,
            rows: action.payload.rows ?? this.state.terminal.rows,
          })
        );
        return this.state;
      case 'stepRequested':
        this.step();
        return this.state;
      case 'resetRequested':
        this.reset();
        return this.state;
      case 'undoRequested':
        this.undo();
        return this.state;
      case 'inputQueued':
      case 'inputCleared':
      case 'terminalResized':
      case 'registerValueSet':
        this.state = interpreterReducer(this.state, action);
        this.ioRuntime.synchronizeTerminal(this.state.terminal);
        this.synchronizeStateMetadata();
        return this.state;
      case 'runtimeStateHydrated':
        this.state = cloneInterpreterReducerState(action.payload);
        // Hydration is used to mirror runtime-owned state back into reducer
        // state. The mutable IO runtime remains the source of truth for memory,
        // terminal buffers, and undo journals, so we must not reset it here.
        this.ioRuntime.synchronizeTerminal(this.state.terminal);
        this.synchronizeStateMetadata();
        return this.state;
      case 'frameRequested':
      default:
        return this.state;
    }
  }

  loadProgram(program: ProgramSource): void {
    this.dispatch(interpreterReduxActions.programSourceLoaded({
      source: program,
      columns: this.state.terminal.columns,
      rows: this.state.terminal.rows,
    }));
  }

  resizeTerminal(columns: number, rows: number): void {
    this.dispatch(interpreterReduxActions.terminalResized({ columns, rows }));
  }

  queueInput(input: number[]): void {
    this.dispatch(interpreterReduxActions.inputQueued(input));
  }

  clearInputQueue(): void {
    this.dispatch(interpreterReduxActions.inputCleared());
  }

  setRegisterValue(register: number, value: number): void {
    this.dispatch(interpreterReduxActions.registerValueSet({ register, value }));
  }

  reset(): void {
    this.state = interpreterReducer(this.state, interpreterReduxActions.resetRequested());
    this.ioRuntime.loadProgram(this.state.program, this.state.terminal);
    this.synchronizeStateMetadata();
  }

  undo(): void {
    const frame = this.ioRuntime.undo.pop();

    if (!frame) {
      return;
    }

    this.restoreUndoFrame(frame);
  }

  step(): boolean {
    if (
      this.state.diagnostics.exception !== undefined ||
      this.state.execution.halted ||
      this.state.cpu.pc / 4 >= this.state.program.instructions.length
    ) {
      return true;
    }

    const preStepState = this.state;
    this.ioRuntime.memory.beginUndoJournal();

    try {
      this.state = reduceInstructionStep(this.state, this.ioRuntime.memory);
    } catch (error) {
      this.ioRuntime.memory.cancelUndoJournal();
      throw error;
    }

    this.ioRuntime.undo.push({
      state: preStepState,
      memoryJournal: this.ioRuntime.memory.finishUndoJournal(),
    });
    this.ioRuntime.synchronizeTerminal(this.state.terminal);
    this.synchronizeStateMetadata();

    return this.state.execution.halted || this.state.diagnostics.exception !== undefined;
  }

  getMemory(): Record<number, number> {
    return this.ioRuntime.memory.exportMemory();
  }

  getMemoryMeta(): InterpreterReducerState['memory'] {
    return this.ioRuntime.memory.toMemoryState();
  }

  readMemoryRange(address: number, length: number): Uint8Array {
    return this.ioRuntime.memory.readRange(address, length);
  }

  getTerminalFrameBuffer(): TerminalFrameBuffer {
    return this.ioRuntime.getTerminalFrameBuffer();
  }

  getTerminalMeta(): TerminalMeta {
    return this.ioRuntime.getTerminalMeta();
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return this.ioRuntime.getTerminalSnapshot();
  }

  getTerminalLines(): string[] {
    return this.ioRuntime.getTerminalLines();
  }

  getTerminalText(): string {
    return this.ioRuntime.getTerminalText();
  }

  private applyLoadedState(nextState: InterpreterReducerState): void {
    this.state = nextState;
    this.ioRuntime.loadProgram(this.state.program, this.state.terminal);
    this.synchronizeStateMetadata();
  }

  private restoreUndoFrame(frame: ReducerIoUndoFrame): void {
    this.ioRuntime.memory.restoreUndoJournal(frame.memoryJournal);
    this.state = cloneInterpreterReducerState(frame.state);
    this.ioRuntime.synchronizeTerminal(this.state.terminal);
    this.synchronizeStateMetadata();
  }

  private synchronizeStateMetadata(): void {
    this.state = synchronizeHistoryDepth(
      {
        ...this.state,
        memory: this.ioRuntime.memory.toMemoryState(),
      },
      this.ioRuntime.undo.size()
    );
  }
}
