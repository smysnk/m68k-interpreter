import { describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeController, IdeRuntimeSession } from './ideRuntimeSession';
import { buildRuntimeLoadRequest } from './useRuntimeConfiguration';
import { subscribeToCurrentRuntimeFrames } from './useRuntimeFrameSubscription';
import { disposeRuntimeReplacement } from './useRuntimeLifecycle';

describe('runtime lifecycle seams', () => {
  it('builds an immutable, complete load request', () => {
    const devices = [
      {
        id: 'display-a',
        deviceType: 'display' as const,
        displayBase: 0xe00000,
      },
    ];
    const request = buildRuntimeLoadRequest({
      source: 'START\n END START',
      emulation: { cpuModel: 'm68010', machineProfile: 'easy68k' },
      columns: 80,
      rows: 25,
      hardwareDevices: devices,
      execution: { delayMs: 0, speedMultiplier: 1 },
    });
    devices[0].displayBase = 0;
    expect(request).toMatchObject({
      emulation: { cpuModel: 'm68010', machineProfile: 'easy68k' },
      terminal: { columns: 80, rows: 25 },
      hardwareDevices: [{ displayBase: 0xe00000 }],
      undo: { mode: 'full' },
    });
  });

  it('rejects frames after the owning epoch becomes stale', () => {
    let listener: ((event: never) => void) | undefined;
    const controller = {
      subscribeEvents: vi.fn((next) => {
        listener = next as (event: never) => void;
        return () => undefined;
      }),
    } as unknown as IdeRuntimeController;
    const onEvent = vi.fn();
    let current = true;
    subscribeToCurrentRuntimeFrames({ controller, isCurrent: () => current, onEvent });
    listener?.({ type: 'stopped', reason: 'first' } as never);
    current = false;
    listener?.({ type: 'stopped', reason: 'stale' } as never);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('clears publication before disposing a replacement', async () => {
    const order: string[] = [];
    await disposeRuntimeReplacement({
      previous: {} as IdeRuntimeSession,
      clearPublishedRuntime: () => order.push('clear'),
      dispose: async () => {
        order.push('dispose');
      },
    });
    expect(order).toEqual(['clear', 'dispose']);
  });
});
