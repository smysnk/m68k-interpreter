import {
  cloneInterpreterReducerState,
  cloneLoadedProgramState,
  cloneInputState,
  createInitialInterpreterReducerState,
  type InterpreterReducerState,
} from './state';
import type { InterpreterReduxAction } from './actions';
import { createInterpreterReduxStateForProgram } from './instructionReducer';
import { resizeTerminalState } from './terminalReducer';

function resetRuntimeState(
  state: InterpreterReducerState,
  columns = state.terminal.columns,
  rows = state.terminal.rows
): InterpreterReducerState {
  return createInitialInterpreterReducerState({
    program: state.program,
    initialMemory: state.program.memoryImage,
    columns,
    rows,
  });
}

export function interpreterReducer(
  state: InterpreterReducerState = createInitialInterpreterReducerState(),
  action: InterpreterReduxAction
): InterpreterReducerState {
  switch (action.type) {
    case 'programLoadedCommitted':
    case 'stepCommitted':
    case 'frameCommitted':
    case 'undoCommitted':
    case 'resetCommitted':
      return cloneInterpreterReducerState(action.payload.state);
    case 'programLoaded':
      return createInitialInterpreterReducerState({
        program: cloneLoadedProgramState(action.payload),
        initialMemory: action.payload.memoryImage,
        columns: state.terminal.columns,
        rows: state.terminal.rows,
      });
    case 'programSourceLoaded':
      return createInterpreterReduxStateForProgram(action.payload.source, {
        columns: action.payload.columns ?? state.terminal.columns,
        rows: action.payload.rows ?? state.terminal.rows,
      });
    case 'runtimeStateHydrated':
      return cloneInterpreterReducerState(action.payload);
    case 'resetRequested':
      return resetRuntimeState(state);
    case 'undoRequested':
    case 'stepRequested':
    case 'frameRequested':
      return state;
    case 'inputCleared':
      return {
        ...state,
        input: {
          ...cloneInputState(state.input),
          queue: [],
        },
      };
    case 'inputQueued':
      if (action.payload.length === 0) {
        return state;
      }

      return {
        ...state,
        input: {
          ...state.input,
          queue: [...state.input.queue, ...action.payload],
        },
      };
    case 'terminalResized':
      return {
        ...state,
        terminal: resizeTerminalState(state.terminal, action.payload.columns, action.payload.rows),
      };
    case 'registerValueSet': {
      if (action.payload.register < 0 || action.payload.register >= state.cpu.registers.length) {
        return state;
      }

      const registers = [...state.cpu.registers];
      registers[action.payload.register] = action.payload.value;

      return {
        ...state,
        cpu: {
          ...state.cpu,
          registers,
        },
      };
    }
    default:
      return state;
  }
}
