import { combineReducers, configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';
import {
  createInterpreterReduxIoMiddleware,
  interpreterReducer as interpreterReduxReducer,
} from '@m68k/interpreter-redux';
import emulatorReducer from '@/store/emulatorSlice';
import { readPersistedIdeState, writePersistedIdeState, type PersistedIdeState } from '@/store/persistence';
import settingsReducer, { initialSettingsState } from '@/store/settingsSlice';
import uiShellReducer, { initialUiShellState } from '@/store/uiShellSlice';
import { resetEmulatorState } from '@/store/emulatorSlice';

const combinedReducer = combineReducers({
  emulator: emulatorReducer,
  interpreterRedux: interpreterReduxReducer,
  settings: settingsReducer,
  uiShell: uiShellReducer,
});

const SOURCE_PREVIEW_LENGTH = 80;
export const ACTION_SIZE_GUARD_THRESHOLD_BYTES = 128 * 1024;

function createSourceSummary(source: string) {
  return {
    length: source.length,
    lines: source.length === 0 ? 0 : source.split('\n').length,
    preview:
      source.length <= SOURCE_PREVIEW_LENGTH
        ? source
        : `${source.slice(0, SOURCE_PREVIEW_LENGTH)}...`,
  };
}

function countMemoryImageBytes(memoryImage: Record<number, number>): number {
  return Object.keys(memoryImage).length;
}

function sanitizeInterpreterReduxState(interpreterRedux: ReturnType<typeof combinedReducer>['interpreterRedux']) {
  return {
    ...interpreterRedux,
    program: {
      ...interpreterRedux.program,
      source: createSourceSummary(interpreterRedux.program.source),
      sourceLines: {
        count: interpreterRedux.program.sourceLines.length,
      },
      memoryImage: {
        usedBytes: countMemoryImageBytes(interpreterRedux.program.memoryImage),
      },
    },
    terminal: {
      ...interpreterRedux.terminal,
      output: {
        length: interpreterRedux.terminal.output.length,
      },
    },
  };
}

export function measureSerializedSize(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return new TextEncoder().encode(serialized ?? '').length;
  } catch {
    return 0;
  }
}

export function sanitizeIdeDevToolsAction<A extends UnknownAction>(action: A, _id?: number): A {
  if (typeof action !== 'object' || action === null || typeof action.type !== 'string') {
    return action;
  }

  switch (action.type) {
    case 'emulator/setEditorCode':
      return {
        ...action,
        payload: createSourceSummary(typeof action.payload === 'string' ? action.payload : ''),
      } as A;
    case 'emulator/setEmulatorInstance':
      return {
        ...action,
        payload: action.payload ? '<runtime>' : null,
      } as A;
    case 'runtimeStateHydrated':
    case 'programLoadedCommitted':
    case 'stepCommitted':
    case 'frameCommitted':
    case 'undoCommitted':
    case 'resetCommitted':
      if (
        typeof action.payload === 'object' &&
        action.payload !== null &&
        'state' in action.payload &&
        action.payload.state
      ) {
        return {
          ...action,
          payload: {
            ...action.payload,
            state: sanitizeInterpreterReduxState(
              action.payload.state as ReturnType<typeof combinedReducer>['interpreterRedux']
            ),
          },
        } as A;
      }

      if (action.payload) {
        return {
          ...action,
          payload: sanitizeInterpreterReduxState(
            action.payload as ReturnType<typeof combinedReducer>['interpreterRedux']
          ),
        } as A;
      }

      return action;
    default:
      return action;
  }
}

export function sanitizeIdeDevToolsState<S>(state: S, _index?: number): S {
  if (!state || typeof state !== 'object') {
    return state;
  }

  const typedState = state as ReturnType<typeof combinedReducer>;

  return {
    ...typedState,
    emulator: {
      ...typedState.emulator,
      editorCode: createSourceSummary(typedState.emulator.editorCode),
      emulatorInstance: typedState.emulator.emulatorInstance ? '<runtime>' : null,
      history: {
        length: typedState.emulator.history.length,
      },
    },
    interpreterRedux: sanitizeInterpreterReduxState(typedState.interpreterRedux),
  } as S;
}

export function createActionSizeGuardMiddleware<RootState>(
  warnAtBytes = ACTION_SIZE_GUARD_THRESHOLD_BYTES
): Middleware<unknown, RootState> {
  return () => (next) => (action) => {
    const result = next(action);
    const bytes = measureSerializedSize(sanitizeIdeDevToolsAction(action as UnknownAction));

    if (bytes > warnAtBytes && typeof action === 'object' && action !== null && 'type' in action) {
      console.warn(
        `[redux-size-guard] action ${String(action.type)} serialized to ${bytes} bytes`
      );
    }

    return result;
  };
}

const rootReducer = (
  state: ReturnType<typeof combinedReducer> | undefined,
  action: Parameters<typeof combinedReducer>[1]
) => {
  if (action.type === resetEmulatorState.type) {
    return combinedReducer(
      state
        ? {
            ...state,
            interpreterRedux: undefined,
          }
        : state,
      action
    );
  }

  return combinedReducer(state, action);
};

export function createIdeStore() {
  const persisted = readPersistedIdeState();
  const initialState = combinedReducer(undefined, { type: '@@INIT' });
  const preloadedState =
    persisted !== undefined
      ? {
          ...initialState,
          settings: persisted.settings
            ? {
                ...initialSettingsState,
                ...persisted.settings,
              }
            : initialState.settings,
          uiShell: persisted.uiShell
            ? {
                ...initialUiShellState,
                ...persisted.uiShell,
                layout: {
                  ...initialUiShellState.layout,
                  ...persisted.uiShell.layout,
                },
              }
            : initialState.uiShell,
        }
      : undefined;

  const interpreterReduxIo = createInterpreterReduxIoMiddleware<ReturnType<typeof combinedReducer>>({
    selectState: (rootState) => rootState.interpreterRedux,
  });

  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    devTools: {
      actionSanitizer: sanitizeIdeDevToolsAction,
      stateSanitizer: sanitizeIdeDevToolsState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }).concat(
        interpreterReduxIo.middleware as Middleware<unknown, ReturnType<typeof combinedReducer>>,
        createActionSizeGuardMiddleware<ReturnType<typeof combinedReducer>>()
      ),
  });

  let lastPersistedState = '';

  store.subscribe(() => {
    const state = store.getState();
    const persistableState: PersistedIdeState = {
      settings: {
        editorTheme: state.settings.editorTheme,
        followSystemTheme: state.settings.followSystemTheme,
        lineNumbers: state.settings.lineNumbers,
        engineMode: state.settings.engineMode,
      },
      uiShell: {
        workspaceTab: state.uiShell.workspaceTab,
        inspectorView: state.uiShell.inspectorView,
        contextView: state.uiShell.contextView,
        contextOpen: state.uiShell.contextOpen,
        layout: state.uiShell.layout,
      },
    };
    const serialized = JSON.stringify(persistableState);

    if (serialized === lastPersistedState) {
      return;
    }

    lastPersistedState = serialized;
    writePersistedIdeState(persistableState);
  });

  return Object.assign(store, {
    getInterpreterReduxRuntimeStore: interpreterReduxIo.getRuntimeStore,
  });
}

export const ideStore = createIdeStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createIdeStore>;
export type AppDispatch = AppStore['dispatch'];

export * from '@/store/emulatorSlice';
export * from '@/store/settingsSlice';
export * from '@/store/uiShellSlice';
