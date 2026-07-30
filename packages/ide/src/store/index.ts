import {
  combineReducers,
  configureStore,
  type Middleware,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { getIdeBootConfig, resolvePreloadedFileId } from '@/config/ideBootConfig';
import emulatorReducer from '@/store/emulatorSlice';
import filesReducer, {
  getActiveFile,
  normalizeFilesState,
  setActiveFileContent,
  type FilesState,
} from '@/store/filesSlice';
import {
  readPersistedIdeState,
  normalizePersistedHardwarePreferences,
  writePersistedIdeState,
  type PersistedIdeState,
} from '@/store/persistence';
import settingsReducer, { initialSettingsState } from '@/store/settingsSlice';
import uiShellReducer, { initialUiShellState } from '@/store/uiShellSlice';
import hardwareReducer from '@/store/hardwareSlice';
import panelLayoutReducer, { initialPanelLayoutState } from '@/store/panelLayoutSlice';
import { migrateLegacyPanelLayout, normalizePanelLayoutState } from '@/store/panelLayoutValidation';
import { resetEmulatorState, setEditorCode } from '@/store/emulatorSlice';
import { recordPanelWorkspaceCommit, recordPanelWorkspacePersistence } from '@/runtime/idePerformanceTelemetry';

const combinedReducer = combineReducers({
  emulator: emulatorReducer,
  files: filesReducer,
  settings: settingsReducer,
  uiShell: uiShellReducer,
  hardware: hardwareReducer,
  panelLayout: panelLayoutReducer,
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
      history: {
        length: typedState.emulator.history.length,
      },
    },
    files: sanitizeFilesState(typedState.files),
  } as S;
}

export function createActionSizeGuardMiddleware<RootState>(
  warnAtBytes = ACTION_SIZE_GUARD_THRESHOLD_BYTES
): Middleware<unknown, RootState> {
  return () => (next) => (action) => {
    const result = next(action);
    const bytes = measureSerializedSize(sanitizeIdeDevToolsAction(action as UnknownAction));

    if (bytes > warnAtBytes && typeof action === 'object' && action !== null && 'type' in action) {
      console.warn(`[redux-size-guard] action ${String(action.type)} serialized to ${bytes} bytes`);
    }

    return result;
  };
}

function createPanelWorkspaceTelemetryMiddleware(): Middleware<unknown, ReturnType<typeof combinedReducer>> {
  return (api) => (next) => (action) => {
    if (typeof action !== 'object' || action === null || !('type' in action) || !String(action.type).startsWith('panelLayout/')) return next(action);
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const previousOwner = api.getState().panelLayout.activeLayout.terminalOwnerPanelId;
    const result = next(action);
    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    const document = api.getState().panelLayout.activeLayout;
    const panels = Object.values(document.instances);
    const terminalCount = panels.filter((panel) => panel.kind === 'terminal').length;
    recordPanelWorkspaceCommit({
      durationMs,
      visiblePanels: panels.length,
      expandedPanels: panels.filter((panel) => !panel.minimized).length,
      minimizedPanels: panels.filter((panel) => panel.minimized).length,
      floatingPanels: document.floatingPanelIds.length,
      terminalMirrors: Math.max(0, terminalCount - (document.terminalOwnerPanelId ? 1 : 0)),
      ownershipTransfer: previousOwner !== document.terminalOwnerPanelId,
    });
    return result;
  };
}

const rootReducer = (
  state: ReturnType<typeof combinedReducer> | undefined,
  action: Parameters<typeof combinedReducer>[1]
) => {
  if (action.type === resetEmulatorState.type) {
    return combinedReducer(state, action);
  }

  if (action.type === setEditorCode.type && state) {
    return combinedReducer(
      {
        ...state,
        files: filesReducer(
          state.files,
          setActiveFileContent((action as ReturnType<typeof setEditorCode>).payload)
        ),
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
  const hydratedHardware = normalizePersistedHardwarePreferences(persisted?.hardware);
  const preloadedState = {
    ...initialState,
    emulator: {
      ...initialState.emulator,
      editorCode: activeFile.content,
    },
    files,
    settings: hydratedSettings,
    hardware: hydratedHardware ?? initialState.hardware,
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
    panelLayout: persisted?.panelLayout
      ? normalizePanelLayoutState(persisted.panelLayout)
      : persisted?.uiShell
        ? migrateLegacyPanelLayout(persisted.uiShell)
        : initialPanelLayoutState,
  };

  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    devTools: {
      actionSanitizer: sanitizeIdeDevToolsAction,
      stateSanitizer: sanitizeIdeDevToolsState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        createActionSizeGuardMiddleware<ReturnType<typeof combinedReducer>>(),
        createPanelWorkspaceTelemetryMiddleware()
      ),
  });

  let lastPersistedState = '';
  let pendingLayoutWrite: number | null = null;
  let previousPersistentSlices = {
    files: store.getState().files,
    settings: store.getState().settings,
    uiShell: store.getState().uiShell,
    hardware: store.getState().hardware,
    panelLayout: store.getState().panelLayout,
  };

  const persist = (): void => {
    pendingLayoutWrite = null;
    const state = store.getState();
    const persistableState: PersistedIdeState = {
      schemaVersion: 2,
      files: state.files,
      settings: {
        editorTheme: state.settings.editorTheme,
        followSystemTheme: state.settings.followSystemTheme,
        lineNumbers: state.settings.lineNumbers,
        registerEditRadix: state.settings.registerEditRadix,
        terminalInputMode: state.settings.terminalInputMode,
      },
      uiShell: {
        workspaceTab: state.uiShell.workspaceTab,
        inspectorView: state.uiShell.inspectorView,
        contextView: state.uiShell.contextView,
        contextOpen: state.uiShell.contextOpen,
        layout: state.uiShell.layout,
      },
      hardware: {
        config: state.hardware.config,
        automaticInterruptLevels: state.hardware.automaticInterruptLevels,
        automaticInterruptIntervalMs: state.hardware.automaticInterruptIntervalMs,
      },
      panelLayout: state.panelLayout,
    };
    const serialized = JSON.stringify(persistableState);
    if (serialized === lastPersistedState) return;
    lastPersistedState = serialized;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    writePersistedIdeState(persistableState);
    recordPanelWorkspacePersistence({
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
      bytes: new TextEncoder().encode(serialized).length,
    });
  };

  store.subscribe(() => {
    const state = store.getState();
    const nonLayoutChanged =
      previousPersistentSlices.files !== state.files ||
      previousPersistentSlices.settings !== state.settings ||
      previousPersistentSlices.uiShell !== state.uiShell ||
      previousPersistentSlices.hardware !== state.hardware;
    const layoutChanged = previousPersistentSlices.panelLayout !== state.panelLayout;
    previousPersistentSlices = {
      files: state.files,
      settings: state.settings,
      uiShell: state.uiShell,
      hardware: state.hardware,
      panelLayout: state.panelLayout,
    };
    if (!nonLayoutChanged && !layoutChanged) return;
    if (nonLayoutChanged) {
      if (pendingLayoutWrite !== null && typeof window !== 'undefined') window.clearTimeout(pendingLayoutWrite);
      persist();
    } else if (typeof window !== 'undefined') {
      if (pendingLayoutWrite !== null) window.clearTimeout(pendingLayoutWrite);
      pendingLayoutWrite = window.setTimeout(persist, 250);
    } else {
      persist();
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (pendingLayoutWrite !== null) persist();
    }, { once: true });
  }

  return store;
}

export const ideStore = createIdeStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createIdeStore>;
export type AppDispatch = AppStore['dispatch'];

export * from '@/store/emulatorSlice';
export * from '@/store/filesSlice';
export * from '@/store/hardwareSlice';
export * from '@/store/hardwareSelectors';
export * from '@/store/settingsSlice';
export * from '@/store/uiShellSlice';
export * from '@/store/appShellSelectors';
export * from '@/store/fileExplorerSelectors';
export * from '@/store/flagsSelectors';
export * from '@/store/navbarSelectors';
export * from '@/store/registerSelectors';
export * from '@/store/paneDescriptors';
export * from '@/store/panelLayoutTypes';
export * from '@/store/panelLayoutSlice';
export * from '@/store/panelLayoutSelectors';
export * from '@/store/panelLayoutValidation';
