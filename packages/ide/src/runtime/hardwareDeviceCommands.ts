import type {
  Easy68kHardwareConfig,
  Easy68kHardwareValidationResult,
} from '@m68k/interpreter';
import { validateEasy68kHardwareDevices } from '@m68k/interpreter';
import { runtimeCommandPort } from '@/runtime/runtimeCommandPort';
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';
import {
  commitHardwarePanelConfiguration,
  getPanelHardwareDeviceConfigs,
  ideStore,
  type PanelConfiguration,
  type PanelInstance,
} from '@/store';

type AddressablePanelConfiguration = Extract<
  PanelConfiguration,
  { kind: 'hardware-display' | 'hardware-digital-io' }
>;

let configurationTail: Promise<void> = Promise.resolve();

function rejected(message: string): Easy68kHardwareValidationResult {
  return { valid: false, conflicts: [], errors: [message] };
}

function patchConfiguration(
  config: AddressablePanelConfiguration,
  patch: Partial<Easy68kHardwareConfig>
): AddressablePanelConfiguration {
  if (config.kind === 'hardware-display') {
    return {
      ...config,
      ...(patch.displayBase === undefined ? {} : { displayBase: patch.displayBase }),
    };
  }
  return {
    ...config,
    ...(patch.ledAddress === undefined ? {} : { ledAddress: patch.ledAddress }),
    ...(patch.switchAddress === undefined ? {} : { switchAddress: patch.switchAddress }),
    ...(patch.buttonAddress === undefined ? {} : { buttonAddress: patch.buttonAddress }),
  };
}

export function patchHardwarePanelConfiguration(
  panelId: string,
  patch: Partial<Easy68kHardwareConfig>
): Promise<Easy68kHardwareValidationResult> {
  const operation = configurationTail.then(async () => {
    const state = ideStore.getState();
    const panel = state.panelLayout.activeLayout.instances[panelId];
    if (
      !panel ||
      (panel.config.kind !== 'hardware-display' &&
        panel.config.kind !== 'hardware-digital-io')
    ) {
      return rejected('The hardware panel is no longer available.');
    }

    const previousConfig = panel.config;
    const nextConfig = patchConfiguration(previousConfig, patch);
    const instances = Object.values(state.panelLayout.activeLayout.instances).map(
      (candidate): PanelInstance => {
        if (
          candidate.config.kind === nextConfig.kind &&
          candidate.config.deviceId === previousConfig.deviceId
        ) {
          return { ...candidate, config: nextConfig };
        }
        return candidate;
      }
    );
    const devices = getPanelHardwareDeviceConfigs(instances);
    const localValidation = validateEasy68kHardwareDevices(devices);
    if (!localValidation.valid) {
      return localValidation;
    }
    const result = runtimeSessionStore.getSession()
      ? await runtimeCommandPort.configureHardwareDevices(devices)
      : localValidation;
    if (result.valid) {
      ideStore.dispatch(
        commitHardwarePanelConfiguration({
          panelId,
          config: nextConfig,
        })
      );
    }
    return result;
  });
  configurationTail = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}
