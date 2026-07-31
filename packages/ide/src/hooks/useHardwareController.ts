import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  type Easy68kHardwareConfig,
  type Easy68kHardwareValidationResult,
} from '@m68k/interpreter';
import { runtimeCommandPort } from '@/runtime/runtimeCommandPort';
import {
  selectHardwarePreferences,
  setHardwareConfig,
  type AppDispatch,
} from '@/store';

export function useHardwareController() {
  const dispatch = useDispatch<AppDispatch>();
  const preferences = useSelector(selectHardwarePreferences);

  const configure = React.useCallback(
    async (config: Easy68kHardwareConfig): Promise<Easy68kHardwareValidationResult> => {
      try {
        const result = await runtimeCommandPort.configureHardware(config);
        if (result.valid) {
          dispatch(setHardwareConfig(result.config ?? config));
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { valid: false, conflicts: [], errors: [message] };
      }
    },
    [dispatch]
  );

  const restoreDefaults = React.useCallback(async () => {
    await configure({ ...DEFAULT_EASY68K_HARDWARE_CONFIG });
  }, [configure]);

  const setToggle = React.useCallback(async (bit: number, enabled: boolean) => {
    try {
      await runtimeCommandPort.setHardwareToggle(bit, enabled);
    } catch {
      // The hardware control surface is best-effort when no runtime is active.
    }
  }, []);

  const setButton = React.useCallback(async (bit: number, pressed: boolean) => {
    try {
      await runtimeCommandPort.setHardwareButton(bit, pressed);
    } catch {
      // The hardware control surface is best-effort when no runtime is active.
    }
  }, []);

  const requestInterrupt = React.useCallback(async (level: number) => {
    try {
      return await runtimeCommandPort.requestInterruptLevel(level);
    } catch {
      return 'rejected' as const;
    }
  }, []);

  return {
    preferences,
    configure,
    restoreDefaults,
    setToggle,
    setButton,
    requestInterrupt,
  };
}
