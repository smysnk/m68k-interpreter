import type { RootState } from '@/store';

export const selectHardwarePreferences = (state: RootState) => state.hardware;
export const selectHardwareConfig = (state: RootState) => state.hardware.config;
