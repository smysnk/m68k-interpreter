import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { patchHardwarePanelConfiguration } from '@/runtime/hardwareDeviceCommands';
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';
import { ideStore, resetToPreset } from '@/store';

function digitalPanel() {
  const panel = Object.values(
    ideStore.getState().panelLayout.activeLayout.instances
  ).find((candidate) => candidate.config.kind === 'hardware-digital-io');
  if (!panel || panel.config.kind !== 'hardware-digital-io') {
    throw new Error('Hardware Lab did not create its digital I/O panel');
  }
  return panel;
}

describe('hardwareDeviceCommands', () => {
  beforeEach(() => {
    runtimeSessionStore.clear();
    ideStore.dispatch(resetToPreset('hardware-lab'));
  });

  afterEach(() => {
    runtimeSessionStore.clear();
  });

  it('serializes concurrent patches against fresh panel state', async () => {
    const panel = digitalPanel();

    const [ledResult, buttonResult] = await Promise.all([
      patchHardwarePanelConfiguration(panel.id, { ledAddress: 0xe00040 }),
      patchHardwarePanelConfiguration(panel.id, { buttonAddress: 0xe00042 }),
    ]);

    expect(ledResult.valid).toBe(true);
    expect(buttonResult.valid).toBe(true);
    expect(digitalPanel().config).toMatchObject({
      ledAddress: 0xe00040,
      switchAddress: 0xe00010,
      buttonAddress: 0xe00042,
    });
  });

  it('leaves Redux unchanged when the active runtime rejects a patch', async () => {
    const panel = digitalPanel();
    const previousConfig = panel.config;
    const requestConfigureHardwareDevices = vi.fn().mockResolvedValue({
      valid: false,
      conflicts: [],
      errors: ['Runtime rejected the topology.'],
    });
    runtimeSessionStore.replace({
      controller: { requestConfigureHardwareDevices },
    } as unknown as IdeRuntimeSession);

    const result = await patchHardwarePanelConfiguration(panel.id, {
      buttonAddress: 0xe00042,
    });

    expect(result.valid).toBe(false);
    expect(requestConfigureHardwareDevices).toHaveBeenCalledTimes(1);
    expect(digitalPanel().config).toEqual(previousConfig);
  });
});
