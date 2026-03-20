import type { Middleware } from '@reduxjs/toolkit';
import { interpreterReduxActions, type FrameRequestOptions, type InterpreterReduxAction } from './actions';
import type { InterpreterReducerState } from './state';
import { ReducerRuntimeStore } from './runtimeStore';

export interface InterpreterReduxIoMiddlewareOptions<RootState = InterpreterReducerState> {
  selectState?: (rootState: RootState) => InterpreterReducerState;
  initialState?: InterpreterReducerState;
}

export interface InterpreterReduxIoMiddlewareController<RootState = InterpreterReducerState> {
  middleware: Middleware<unknown, RootState>;
  getRuntimeStore(): ReducerRuntimeStore;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function isInterpreterReduxAction(action: unknown): action is InterpreterReduxAction {
  if (
    typeof action !== 'object' ||
    action === null ||
    !('type' in action) ||
    typeof action.type !== 'string'
  ) {
    return false;
  }

  return [
    'programLoaded',
    'programSourceLoaded',
    'resetRequested',
    'undoRequested',
    'inputQueued',
    'inputCleared',
    'terminalResized',
    'registerValueSet',
    'runtimeStateHydrated',
    'programLoadedCommitted',
    'stepCommitted',
    'frameCommitted',
    'undoCommitted',
    'resetCommitted',
    'stepRequested',
    'frameRequested',
  ].includes(action.type);
}

function runRequestedFrame(
  runtimeStore: ReducerRuntimeStore,
  options: FrameRequestOptions
): void {
  const instructionBudget = Math.max(1, options.instructionBudget ?? Number.POSITIVE_INFINITY);
  const frameBudgetMs = options.frameBudgetMs ?? Number.POSITIVE_INFINITY;
  const frameStart = nowMs();

  for (let instruction = 0; instruction < instructionBudget; instruction += 1) {
    const stopped = runtimeStore.step();

    if (stopped) {
      return;
    }

    if (nowMs() - frameStart >= frameBudgetMs) {
      return;
    }
  }
}

export function createInterpreterReduxIoMiddleware<RootState = InterpreterReducerState>(
  options: InterpreterReduxIoMiddlewareOptions<RootState> = {}
): InterpreterReduxIoMiddlewareController<RootState> {
  const selectState =
    options.selectState ?? ((rootState: RootState) => rootState as unknown as InterpreterReducerState);
  const runtimeStore = new ReducerRuntimeStore(options.initialState);

  const synchronizeRuntimeState = (rootState: RootState): void => {
    runtimeStore.dispatch(
      interpreterReduxActions.runtimeStateHydrated(selectState(rootState))
    );
  };

  const middleware: Middleware<unknown, RootState> = (storeApi) => (next) => (action) => {
    if (!isInterpreterReduxAction(action)) {
      return next(action);
    }

    synchronizeRuntimeState(storeApi.getState());

    switch (action.type) {
      case 'programLoaded':
      case 'programSourceLoaded':
        runtimeStore.dispatch(action);
        return next(
          interpreterReduxActions.programLoadedCommitted({
            state: runtimeStore.getState(),
          })
        );
      case 'stepRequested':
        runtimeStore.step();
        return next(
          interpreterReduxActions.stepCommitted({
            state: runtimeStore.getState(),
          })
        );
      case 'frameRequested':
        runRequestedFrame(runtimeStore, action.payload);
        return next(
          interpreterReduxActions.frameCommitted({
            state: runtimeStore.getState(),
          })
        );
      case 'undoRequested':
        runtimeStore.undo();
        return next(
          interpreterReduxActions.undoCommitted({
            state: runtimeStore.getState(),
          })
        );
      case 'resetRequested':
        runtimeStore.reset();
        return next(
          interpreterReduxActions.resetCommitted({
            state: runtimeStore.getState(),
          })
        );
      case 'inputQueued':
      case 'inputCleared':
      case 'terminalResized':
      case 'registerValueSet':
      case 'runtimeStateHydrated':
        runtimeStore.dispatch(action);
        return next(action);
      case 'programLoadedCommitted':
      case 'stepCommitted':
      case 'frameCommitted':
      case 'undoCommitted':
      case 'resetCommitted':
      default:
        return next(action);
    }
  };

  return {
    middleware,
    getRuntimeStore: () => runtimeStore,
  };
}
