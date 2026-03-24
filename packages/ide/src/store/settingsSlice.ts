import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  defaultEditorTheme,
  defaultEditorThemes,
  EditorThemeEnum,
  resolveThemeForSurfaceMode,
  type EditorThemeId,
  type IdeSurfaceMode,
} from '@/theme/editorThemeRegistry';

export type RegisterEditRadix = 'hex' | 'dec' | 'bin';
export interface SettingsState {
  themes: EditorThemeId[];
  editorTheme: EditorThemeId;
  engineMode: EngineMode;
  followSystemTheme: boolean;
  lineNumbers: boolean;
  registerEditRadix: RegisterEditRadix;
}

export type EngineMode = 'interpreter' | 'interpreter-redux';

export const initialSettingsState: SettingsState = {
  themes: defaultEditorThemes,
  editorTheme: defaultEditorTheme,
  engineMode: 'interpreter',
  followSystemTheme: true,
  lineNumbers: true,
  registerEditRadix: 'hex',
};

const registerEditRadices: RegisterEditRadix[] = ['hex', 'dec', 'bin'];

function getOppositeTheme(currentTheme: EditorThemeId): EditorThemeId {
  return currentTheme === EditorThemeEnum.M68K_DARK
    ? EditorThemeEnum.M68K_LIGHT
    : EditorThemeEnum.M68K_DARK;
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    setEditorTheme(state, action: PayloadAction<EditorThemeId>) {
      if (!state.themes.includes(action.payload)) {
        return;
      }
      state.editorTheme = action.payload;
      state.followSystemTheme = false;
    },
    setEngineMode(state, action: PayloadAction<EngineMode>) {
      state.engineMode = action.payload;
    },
    toggleEditorTheme(state) {
      state.editorTheme = getOppositeTheme(state.editorTheme);
      state.followSystemTheme = false;
    },
    syncSystemTheme(state, action: PayloadAction<IdeSurfaceMode>) {
      if (!state.followSystemTheme) {
        return;
      }
      state.editorTheme = resolveThemeForSurfaceMode(action.payload);
    },
    setFollowSystemTheme(state, action: PayloadAction<boolean>) {
      state.followSystemTheme = action.payload;
    },
    setLineNumbers(state, action: PayloadAction<boolean>) {
      state.lineNumbers = action.payload;
    },
    setRegisterEditRadix(state, action: PayloadAction<RegisterEditRadix>) {
      if (!registerEditRadices.includes(action.payload)) {
        return;
      }
      state.registerEditRadix = action.payload;
    },
    resetSettingsState() {
      return { ...initialSettingsState };
    },
  },
});

export const {
  setEditorTheme,
  setEngineMode,
  toggleEditorTheme,
  syncSystemTheme,
  setFollowSystemTheme,
  setLineNumbers,
  setRegisterEditRadix,
  resetSettingsState,
} = settingsSlice.actions;

export default settingsSlice.reducer;
