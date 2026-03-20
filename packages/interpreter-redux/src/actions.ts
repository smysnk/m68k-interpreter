import type { ProgramSource } from '@m68k/interpreter';
import type { InterpreterReducerState, LoadedProgramState } from './state';

export interface FrameRequestOptions {
  frameBudgetMs?: number;
  instructionBudget?: number;
  speedMultiplier?: number;
}

export interface TerminalResizePayload {
  columns: number;
  rows: number;
}

export interface ProgramSourceLoadPayload {
  source: ProgramSource;
  columns?: number;
  rows?: number;
}

export interface RegisterValuePayload {
  register: number;
  value: number;
}

export interface CommittedRuntimePayload {
  state: InterpreterReducerState;
}

export const interpreterReduxActions = {
  programLoaded: (program: LoadedProgramState) =>
    ({
      type: 'programLoaded',
      payload: program,
    }) as const,
  programSourceLoaded: (payload: ProgramSourceLoadPayload) =>
    ({
      type: 'programSourceLoaded',
      payload,
    }) as const,
  resetRequested: () =>
    ({
      type: 'resetRequested',
    }) as const,
  undoRequested: () =>
    ({
      type: 'undoRequested',
    }) as const,
  inputQueued: (bytes: number[]) =>
    ({
      type: 'inputQueued',
      payload: bytes,
    }) as const,
  inputCleared: () =>
    ({
      type: 'inputCleared',
    }) as const,
  terminalResized: (payload: TerminalResizePayload) =>
    ({
      type: 'terminalResized',
      payload,
    }) as const,
  registerValueSet: (payload: RegisterValuePayload) =>
    ({
      type: 'registerValueSet',
      payload,
    }) as const,
  runtimeStateHydrated: (payload: InterpreterReducerState) =>
    ({
      type: 'runtimeStateHydrated',
      payload,
    }) as const,
  programLoadedCommitted: (payload: CommittedRuntimePayload) =>
    ({
      type: 'programLoadedCommitted',
      payload,
    }) as const,
  stepCommitted: (payload: CommittedRuntimePayload) =>
    ({
      type: 'stepCommitted',
      payload,
    }) as const,
  frameCommitted: (payload: CommittedRuntimePayload) =>
    ({
      type: 'frameCommitted',
      payload,
    }) as const,
  undoCommitted: (payload: CommittedRuntimePayload) =>
    ({
      type: 'undoCommitted',
      payload,
    }) as const,
  resetCommitted: (payload: CommittedRuntimePayload) =>
    ({
      type: 'resetCommitted',
      payload,
    }) as const,
  stepRequested: () =>
    ({
      type: 'stepRequested',
    }) as const,
  frameRequested: (payload: FrameRequestOptions = {}) =>
    ({
      type: 'frameRequested',
      payload,
    }) as const,
};

export type InterpreterReduxAction = ReturnType<
  (typeof interpreterReduxActions)[keyof typeof interpreterReduxActions]
>;
