import { combineReducers, configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';
import {
  createInterpreterReduxIoMiddleware,
  interpreterReducer as interpreterReduxReducer,
} from '@m68k/interpreter-redux';
import { getIdeBootConfig, resolvePreloadedFileId } from '@/config/ideBootConfig';
import emulatorReducer from '@/store/emulatorSlice';
import filesReducer, {
  NIBBLES_FILE_ID,
  getActiveFile,
  normalizeFilesState,
  setActiveFileContent,
  type FilesState,
} from '@/store/filesSlice';
import { readPersistedIdeState, writePersistedIdeState, type PersistedIdeState } from '@/store/persistence';
import settingsReducer, { initialSettingsState } from '@/store/settingsSlice';
import uiShellReducer, { initialUiShellState } from '@/store/uiShellSlice';
import { resetEmulatorState, setEditorCode } from '@/store/emulatorSlice';

const combinedReducer = combineReducers({
  emulator: emulatorReducer,
  files: filesReducer,
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

function sanitizeFilesState(files: FilesState) {
  return {
    activeFileId: files.activeFileId,
    items: files.items.map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      kind: item.kind,
      content: createSourceSummary(item.content),
    })),
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
    case 'files/setActiveFileContent':
      return {
        ...action,
        payload: createSourceSummary(typeof action.payload === 'string' ? action.payload : ''),
      } as A;
    case 'files/setActiveFile':
      return action;
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
    files: sanitizeFilesState(typedState.files),
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

  if (action.type === setEditorCode.type && state) {
    return combinedReducer(
      {
        ...state,
        files: filesReducer(state.files, setActiveFileContent((action as ReturnType<typeof setEditorCode>).payload)),
      },
      action
    );
  }

  return combinedReducer(state, action);
};

export function createIdeStore() {
  const persisted = readPersistedIdeState();
  const initialState = combinedReducer(undefined, { type: '@@INIT' });
  const bootConfig = getIdeBootConfig();
  const normalizedFiles = normalizeFilesState(persisted?.files);
  const preloadedFileId =
    resolvePreloadedFileId(normalizedFiles, bootConfig.preloadFile) ?? normalizedFiles.activeFileId;
  const files =
    preloadedFileId === normalizedFiles.activeFileId
      ? normalizedFiles
      : {
          ...normalizedFiles,
          activeFileId: preloadedFileId,
        };
  const activeFile = getActiveFile(files);
  const hydratedSettings = persisted?.settings
    ? {
        ...initialSettingsState,
        ...persisted.settings,
      }
    : initialState.settings;
  const settings =
    files.activeFileId === NIBBLES_FILE_ID && hydratedSettings.engineMode === 'interpreter-redux'
      ? {
          ...hydratedSettings,
          engineMode: 'interpreter' as const,
        }
      : hydratedSettings;
  const preloadedState = {
    ...initialState,
    emulator: {
      ...initialState.emulator,
      editorCode: activeFile.content,
    },
    files,
    settings,
    uiShell: persisted?.uiShell
      ? {
          ...initialUiShellState,
          ...persisted.uiShell,
          layout: {
            ...initialUiShellState.layout,
            ...persisted.uiShell.layout,
          },
        }
      : initialState.uiShell,
  };

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
      files: state.files,
      settings: {
        editorTheme: state.settings.editorTheme,
        followSystemTheme: state.settings.followSystemTheme,
        lineNumbers: state.settings.lineNumbers,
        engineMode: state.settings.engineMode,
        registerEditRadix: state.settings.registerEditRadix,
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
export * from '@/store/filesSlice';
export * from '@/store/settingsSlice';
export * from '@/store/uiShellSlice';
export * from '@/store/appShellSelectors';
export * from '@/store/fileExplorerSelectors';
export * from '@/store/flagsSelectors';
export * from '@/store/navbarSelectors';
export * from '@/store/registerSelectors';
