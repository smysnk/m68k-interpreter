import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  type Easy68kHardwareConfig,
} from '@m68k/interpreter';
import { resetSettingsState } from '@/store/settingsSlice';

export interface HardwarePreferencesState {
  config: Easy68kHardwareConfig;
  automaticInterruptLevels: number[];
  automaticInterruptIntervalMs: number;
  configurationOpen: boolean;
}

export const initialHardwareState: HardwarePreferencesState = {
  config: { ...DEFAULT_EASY68K_HARDWARE_CONFIG },
  automaticInterruptLevels: [],
  automaticInterruptIntervalMs: 1000,
  configurationOpen: false,
};

const hardwareSlice = createSlice({
  name: 'hardware',
  initialState: initialHardwareState,
  reducers: {
    setHardwareConfig(state, action: PayloadAction<Easy68kHardwareConfig>) {
      state.config = { ...action.payload };
    },
    restoreHardwareDefaults(state) {
      state.config = { ...DEFAULT_EASY68K_HARDWARE_CONFIG };
    },
    setHardwareConfigurationOpen(state, action: PayloadAction<boolean>) {
      state.configurationOpen = action.payload;
    },
    toggleAutomaticInterruptLevel(state, action: PayloadAction<number>) {
      const level = action.payload;
      state.automaticInterruptLevels = state.automaticInterruptLevels.includes(level)
        ? state.automaticInterruptLevels.filter((candidate) => candidate !== level)
        : [...state.automaticInterruptLevels, level].sort((left, right) => right - left);
    },
    setAutomaticInterruptInterval(state, action: PayloadAction<number>) {
      state.automaticInterruptIntervalMs = Math.max(50, Math.round(action.payload) || 50);
    },
    resetHardwarePreferences() {
      return { ...initialHardwareState, config: { ...initialHardwareState.config } };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetSettingsState, () => ({
      ...initialHardwareState,
      config: { ...initialHardwareState.config },
    }));
  },
});

export const {
  setHardwareConfig,
  restoreHardwareDefaults,
  setHardwareConfigurationOpen,
  toggleAutomaticInterruptLevel,
  setAutomaticInterruptInterval,
  resetHardwarePreferences,
} = hardwareSlice.actions;

export default hardwareSlice.reducer;
