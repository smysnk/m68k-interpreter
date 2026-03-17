import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  defaultEditorTheme,
  defaultEditorThemes,
  EditorThemeEnum,
  resolveThemeForSurfaceMode,
  type EditorThemeId,
  type IdeSurfaceMode,
} from '@/theme/editorThemeRegistry';

export interface SettingsState {
  themes: EditorThemeId[];
  editorTheme: EditorThemeId;
  followSystemTheme: boolean;
  lineNumbers: boolean;
  showHelp: boolean;
  showRegisters: boolean;
}

const initialState: SettingsState = {
  themes: defaultEditorThemes,
  editorTheme: defaultEditorTheme,
  followSystemTheme: true,
  lineNumbers: true,
  showHelp: false,
  showRegisters: true,
};

function getOppositeTheme(currentTheme: EditorThemeId): EditorThemeId {
  return currentTheme === EditorThemeEnum.M68K_DARK
    ? EditorThemeEnum.M68K_LIGHT
    : EditorThemeEnum.M68K_DARK;
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setEditorTheme(state, action: PayloadAction<EditorThemeId>) {
      if (!state.themes.includes(action.payload)) {
        return;
      }
      state.editorTheme = action.payload;
      state.followSystemTheme = false;
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
    toggleHelp(state) {
      state.showHelp = !state.showHelp;
    },
    toggleRegisters(state) {
      state.showRegisters = !state.showRegisters;
    },
    resetSettingsState() {
      return { ...initialState };
    },
  },
});

export const {
  setEditorTheme,
  toggleEditorTheme,
  syncSystemTheme,
  setFollowSystemTheme,
  setLineNumbers,
  toggleHelp,
  toggleRegisters,
  resetSettingsState,
} = settingsSlice.actions;

export default settingsSlice.reducer;
