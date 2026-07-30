import React from 'react';
import {
  DEFAULT_EASY68K_HARDWARE_DEVICE_CONFIG,
  type Easy68kHardwareDeviceConfig,
} from '@m68k/interpreter';
import { useSelector } from 'react-redux';
import {
  RuntimeUnavailableError,
  runtimeCommandPort,
} from '@/runtime/runtimeCommandPort';
import { useHardwareTopologyVersion } from '@/runtime/useHardwareSurface';
import { useRuntimeSession } from '@/runtime/useRuntimeSession';
import {
  getPanelHardwareDeviceConfigs,
  selectActivePanelLayout,
  selectHardwarePreferences,
} from '@/store';

function deviceSignature(devices: readonly Easy68kHardwareDeviceConfig[]): string {
  return devices
    .map(
      (device) =>
        `${device.id}:${device.deviceType ?? 'board'}:${device.displayBase}:${device.ledAddress}:${device.switchAddress}:${device.buttonAddress}`
    )
    .join('|');
}

function reportSynchronizationError(error: unknown): void {
  if (
    error instanceof RuntimeUnavailableError ||
    (error instanceof Error && /disposed/i.test(error.message))
  ) {
    return;
  }
  console.error('Hardware runtime synchronization failed', error);
}

export default function HardwareRuntimeBridge(): null {
  const layout = useSelector(selectActivePanelLayout);
  const preferences = useSelector(selectHardwarePreferences);
  const runtimeSession = useRuntimeSession();
  const topologyVersion = useHardwareTopologyVersion();
  const devices = React.useMemo(() => {
    const configured = getPanelHardwareDeviceConfigs(Object.values(layout.instances));
    return configured.length > 0
      ? configured
      : [{
          ...DEFAULT_EASY68K_HARDWARE_DEVICE_CONFIG,
          ...preferences.config,
        }];
  }, [layout.instances, preferences.config]);
  const signature = deviceSignature(devices);

  React.useEffect(() => {
    if (!runtimeSession.ready || topologyVersion <= 0) return;
    void runtimeCommandPort
      .configureHardwareDevices(devices)
      .catch(reportSynchronizationError);
  }, [
    devices,
    topologyVersion,
    runtimeSession.epoch,
    runtimeSession.ready,
    signature,
  ]);

  React.useEffect(() => {
    if (!runtimeSession.ready || topologyVersion <= 0) return;
    void runtimeCommandPort
      .configureAutomaticInterrupts(
        preferences.automaticInterruptLevels,
        preferences.automaticInterruptIntervalMs
      )
      .catch(reportSynchronizationError);
  }, [
    preferences.automaticInterruptIntervalMs,
    preferences.automaticInterruptLevels,
    topologyVersion,
    runtimeSession.epoch,
    runtimeSession.ready,
  ]);

  return null;
}
