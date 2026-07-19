import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type {
  Easy68kHardwareConfig,
  Easy68kHardwareValidationResult,
} from '@m68k/interpreter';
import { runtimeCommandPort } from '@/runtime/runtimeCommandPort';
import { useRuntimeSession } from '@/runtime/useRuntimeSession';
import {
  restoreHardwareDefaults,
  selectHardwarePreferences,
  setHardwareConfig,
  type AppDispatch,
} from '@/store';

export function useHardwareController() {
  const dispatch = useDispatch<AppDispatch>();
  const preferences = useSelector(selectHardwarePreferences);
  const runtimeSession = useRuntimeSession();
  const [status, setStatus] = React.useState('Hardware ready');

  const configure = React.useCallback(
    async (config: Easy68kHardwareConfig): Promise<Easy68kHardwareValidationResult> => {
      try {
        const result = await runtimeCommandPort.configureHardware(config);
        if (result.valid) {
          dispatch(setHardwareConfig(result.config ?? config));
          setStatus('Hardware addresses updated');
        } else {
          setStatus(result.errors[0] ?? 'Hardware address configuration is invalid');
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message);
        return { valid: false, conflicts: [], errors: [message] };
      }
    },
    [dispatch]
  );

  const restoreDefaults = React.useCallback(async () => {
    dispatch(restoreHardwareDefaults());
    await configure({
      displayBase: 0xe00000,
      ledAddress: 0xe00010,
      switchAddress: 0xe00010,
      buttonAddress: 0xe00012,
    });
  }, [configure, dispatch]);

  const setToggle = React.useCallback(async (bit: number, enabled: boolean) => {
    try {
      await runtimeCommandPort.setHardwareToggle(bit, enabled);
      setStatus(`Switch ${bit} ${enabled ? 'on' : 'off'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const setButton = React.useCallback(async (bit: number, pressed: boolean) => {
    try {
      await runtimeCommandPort.setHardwareButton(bit, pressed);
      setStatus(`Button ${bit} ${pressed ? 'pressed' : 'released'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const reset = React.useCallback(async () => {
    try {
      await runtimeCommandPort.reset();
      setStatus('Hardware and emulator reset');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  React.useEffect(() => {
    if (!runtimeSession.ready) return;
    void runtimeCommandPort.configureAutomaticInterrupts(
      preferences.automaticInterruptLevels,
      preferences.automaticInterruptIntervalMs
    );
  }, [
    preferences.automaticInterruptIntervalMs,
    preferences.automaticInterruptLevels,
    runtimeSession.epoch,
    runtimeSession.ready,
  ]);

  const requestInterrupt = React.useCallback(async (level: number) => {
    try {
      const result = await runtimeCommandPort.requestInterruptLevel(level);
      setStatus(
        result === 'accepted'
          ? `IRQ ${level} accepted`
          : result === 'masked'
            ? `IRQ ${level} queued but masked by the current SR`
            : `IRQ ${level} rejected`
      );
      return result;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return 'rejected' as const;
    }
  }, []);

  return {
    preferences,
    status,
    setStatus,
    configure,
    restoreDefaults,
    setToggle,
    setButton,
    reset,
    requestInterrupt,
  };
}
