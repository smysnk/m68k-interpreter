import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { interpreterReducer as interpreterReduxReducer } from '@m68k/interpreter-redux';
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

  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
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

  return store;
}

export const ideStore = createIdeStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createIdeStore>;
export type AppDispatch = AppStore['dispatch'];

export * from '@/store/emulatorSlice';
export * from '@/store/settingsSlice';
export * from '@/store/uiShellSlice';
