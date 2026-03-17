import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { interpreterReducer as interpreterReduxReducer } from '@m68k/interpreter-redux';
import emulatorReducer from '@/store/emulatorSlice';
import settingsReducer from '@/store/settingsSlice';
import { resetEmulatorState } from '@/store/emulatorSlice';

const combinedReducer = combineReducers({
  emulator: emulatorReducer,
  interpreterRedux: interpreterReduxReducer,
  settings: settingsReducer,
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
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
}

export const ideStore = createIdeStore();

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createIdeStore>;
export type AppDispatch = AppStore['dispatch'];

export * from '@/store/emulatorSlice';
export * from '@/store/settingsSlice';
