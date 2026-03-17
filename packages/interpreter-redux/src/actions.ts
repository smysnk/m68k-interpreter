import type { ProgramSource } from '@m68k/interpreter';
import type { LoadedProgramState } from './state';

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
      payload: [...bytes],
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
