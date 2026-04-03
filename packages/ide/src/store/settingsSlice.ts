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
export type TerminalInputModePreference = 'auto' | 'text-input' | 'touch-only';
export interface SettingsState {
  themes: EditorThemeId[];
  editorTheme: EditorThemeId;
  followSystemTheme: boolean;
  lineNumbers: boolean;
  registerEditRadix: RegisterEditRadix;
  terminalInputMode: TerminalInputModePreference;
}

export const initialSettingsState: SettingsState = {
  themes: defaultEditorThemes,
  editorTheme: defaultEditorTheme,
  followSystemTheme: true,
  lineNumbers: true,
  registerEditRadix: 'hex',
  terminalInputMode: 'auto',
};

const registerEditRadices: RegisterEditRadix[] = ['hex', 'dec', 'bin'];
const terminalInputModes: TerminalInputModePreference[] = ['auto', 'text-input', 'touch-only'];

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
    setTerminalInputMode(state, action: PayloadAction<TerminalInputModePreference>) {
      if (!terminalInputModes.includes(action.payload)) {
        return;
      }
      state.terminalInputMode = action.payload;
    },
    resetSettingsState() {
      return { ...initialSettingsState };
    },
  },
});

export const {
  setEditorTheme,
  toggleEditorTheme,
  syncSystemTheme,
  setFollowSystemTheme,
  setLineNumbers,
  setRegisterEditRadix,
  setTerminalInputMode,
  resetSettingsState,
} = settingsSlice.actions;

export default settingsSlice.reducer;
