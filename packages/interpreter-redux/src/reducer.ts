import {
  cloneLoadedProgramState,
  cloneCpuState,
  cloneMemoryState,
  cloneTerminalState,
  cloneInputState,
  cloneExecutionRuntimeState,
  cloneDiagnosticsState,
  createHistoryFrame,
  createHistoryState,
  createInitialInterpreterReducerState,
  MAX_HISTORY_FRAMES,
  type InterpreterReducerState,
} from './state';
import type { InterpreterReduxAction } from './actions';
import { createInterpreterReduxStateForProgram, reduceInstructionStep } from './instructionReducer';
import { resizeTerminalState } from './terminalReducer';

function pushHistoryFrame(state: InterpreterReducerState): InterpreterReducerState {
  const undoFrames = [...state.history.undoFrames, createHistoryFrame(state)];
  if (undoFrames.length > MAX_HISTORY_FRAMES) {
    undoFrames.shift();
  }

  return {
    ...state,
    history: createHistoryState({
      undoFrames,
    }),
  };
}

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
    case 'resetRequested':
      return resetRuntimeState(state);
    case 'undoRequested': {
      const undoFrames = state.history.undoFrames;
      const previousFrame = undoFrames[undoFrames.length - 1];

      if (previousFrame === undefined) {
        return state;
      }

      return {
        program: cloneLoadedProgramState(state.program),
        cpu: cloneCpuState(previousFrame.cpu),
        memory: cloneMemoryState(previousFrame.memory),
        terminal: cloneTerminalState(previousFrame.terminal),
        input: cloneInputState(previousFrame.input),
        execution: cloneExecutionRuntimeState(previousFrame.execution),
        diagnostics: cloneDiagnosticsState(previousFrame.diagnostics),
        history: createHistoryState({
          undoFrames: undoFrames.slice(0, -1),
        }),
      };
    }
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
          ...cloneInputState(state.input),
          queue: [...state.input.queue, ...action.payload],
          waitingForInput: false,
          pendingInputTask: undefined,
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
    case 'stepRequested':
      if (state.cpu.pc / 4 >= state.program.instructions.length) {
        const lastInstruction =
          state.program.instructions[state.program.instructions.length - 1]?.[0] ??
          state.execution.lastInstruction;

        return {
          ...state,
          execution: {
            ...state.execution,
            lastInstruction,
          },
        };
      }

      if (
        state.execution.halted ||
        state.diagnostics.exception !== undefined ||
        state.input.waitingForInput
      ) {
        return state;
      }

      return reduceInstructionStep(pushHistoryFrame(state));
    case 'frameRequested':
      return state;
    default:
      return state;
  }
}
