import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_EMULATION_CONFIG,
  normalizeEmulationConfig,
  type CpuModel,
  type CpuProfile,
  type EmulationConfig,
  type MachineProfile,
} from '@m68k/interpreter';
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
  cpuModel: CpuModel;
  machineProfile: MachineProfile;
}

export const initialSettingsState: SettingsState = {
  themes: defaultEditorThemes,
  editorTheme: defaultEditorTheme,
  followSystemTheme: true,
  lineNumbers: true,
  registerEditRadix: 'hex',
  terminalInputMode: 'auto',
  ...DEFAULT_EMULATION_CONFIG,
};

const registerEditRadices: RegisterEditRadix[] = ['hex', 'dec', 'bin'];
const terminalInputModes: TerminalInputModePreference[] = ['auto', 'text-input', 'touch-only'];
/** @deprecated Persistence compatibility helper. */
export function normalizeCpuProfile(value: unknown): CpuProfile {
  return value === 'm68000' || value === 'm68010' || value === 'm68020' || value === 'easy68k'
    ? value
    : 'easy68k';
}

export function normalizeSettingsEmulation(
  value: unknown,
  legacyCpuProfile?: unknown
): EmulationConfig {
  const candidate =
    typeof value === 'object' && value !== null ? (value as Partial<EmulationConfig>) : undefined;
  return normalizeEmulationConfig(candidate, normalizeCpuProfile(legacyCpuProfile));
}

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
    setCpuModel(state, action: PayloadAction<CpuModel>) {
      state.cpuModel = normalizeEmulationConfig({ cpuModel: action.payload }).cpuModel;
    },
    setMachineProfile(state, action: PayloadAction<MachineProfile>) {
      state.machineProfile = normalizeEmulationConfig({
        machineProfile: action.payload,
      }).machineProfile;
    },
    setEmulationConfig(state, action: PayloadAction<EmulationConfig>) {
      const normalized = normalizeEmulationConfig(action.payload);
      state.cpuModel = normalized.cpuModel;
      state.machineProfile = normalized.machineProfile;
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
  setCpuModel,
  setMachineProfile,
  setEmulationConfig,
  resetSettingsState,
} = settingsSlice.actions;

export default settingsSlice.reducer;
