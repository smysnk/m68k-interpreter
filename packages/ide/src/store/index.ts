import { combineReducers, configureStore } from '@reduxjs/toolkit';
import emulatorReducer from '@/store/emulatorSlice';
import settingsReducer from '@/store/settingsSlice';

const rootReducer = combineReducers({
  emulator: emulatorReducer,
  settings: settingsReducer,
});

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
