import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { patchDigitalIoBaseConfiguration } from '@/runtime/hardwareDeviceCommands';
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

  it('updates the shared digital I/O address space atomically', async () => {
    const panel = digitalPanel();

    const result = await patchDigitalIoBaseConfiguration(panel.id, 0xe00040);

    expect(result.valid).toBe(true);
    expect(digitalPanel().config).toMatchObject({
      ledAddress: 0xe00040,
      switchAddress: 0xe00040,
      buttonAddress: 0xe00042,
    });
  });

  it('serializes shared-base updates against fresh panel state', async () => {
    const panel = digitalPanel();

    const [firstResult, secondResult] = await Promise.all([
      patchDigitalIoBaseConfiguration(panel.id, 0xe00040),
      patchDigitalIoBaseConfiguration(panel.id, 0xe00060),
    ]);

    expect(firstResult.valid).toBe(true);
    expect(secondResult.valid).toBe(true);
    expect(digitalPanel().config).toMatchObject({
      ledAddress: 0xe00060,
      switchAddress: 0xe00060,
      buttonAddress: 0xe00062,
    });
  });

  it('rejects a digital I/O base that would wrap the button register', async () => {
    const panel = digitalPanel();
    const previousConfig = panel.config;
    const result = await patchDigitalIoBaseConfiguration(panel.id, 0x00ff_ffff);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('base + 2');
    expect(digitalPanel().config).toEqual(previousConfig);
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

    const result = await patchDigitalIoBaseConfiguration(panel.id, 0xe00040);

    expect(result.valid).toBe(false);
    expect(requestConfigureHardwareDevices).toHaveBeenCalledTimes(1);
    expect(digitalPanel().config).toEqual(previousConfig);
  });
});
