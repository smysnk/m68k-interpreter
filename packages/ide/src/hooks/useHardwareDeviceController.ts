import React from 'react';
import type {
  Easy68kHardwareConfig,
  Easy68kHardwareValidationResult,
} from '@m68k/interpreter';
import {
  patchDigitalIoBaseConfiguration,
  patchHardwarePanelConfiguration,
} from '@/runtime/hardwareDeviceCommands';
import { runtimeCommandPort } from '@/runtime/runtimeCommandPort';

function messageFromResult(result: Easy68kHardwareValidationResult): string {
  return result.errors[0] ?? 'Hardware address configuration is invalid.';
}

export function useHardwareDeviceController(panelId: string, deviceId: string) {
  const [status, setStatus] = React.useState('Hardware ready');

  const configure = React.useCallback(
    async (patch: Partial<Easy68kHardwareConfig>) => {
      try {
        const result = await patchHardwarePanelConfiguration(panelId, patch);
        setStatus(result.valid ? 'Hardware addresses updated' : messageFromResult(result));
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message);
        return { valid: false, conflicts: [], errors: [message] };
      }
    },
    [panelId]
  );

  const setToggle = React.useCallback(
    async (bit: number, enabled: boolean) => {
      try {
        await runtimeCommandPort.setHardwareToggle(bit, enabled, deviceId);
        setStatus(`Switch ${bit} ${enabled ? 'on' : 'off'}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [deviceId]
  );

  const setButton = React.useCallback(
    async (bit: number, pressed: boolean) => {
      try {
        await runtimeCommandPort.setHardwareButton(bit, pressed, deviceId);
        setStatus(`Button ${bit} ${pressed ? 'pressed' : 'released'}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [deviceId]
  );

  const configureDigitalIoBase = React.useCallback(
    async (baseAddress: number) => {
      try {
        const result = await patchDigitalIoBaseConfiguration(panelId, baseAddress);
        setStatus(result.valid ? 'Digital I/O address updated' : messageFromResult(result));
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message);
        return { valid: false, conflicts: [], errors: [message] };
      }
    },
    [panelId]
  );

  return { configure, configureDigitalIoBase, setButton, setToggle, status };
}
