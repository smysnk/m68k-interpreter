import { describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { RuntimeCommandPort, RuntimeUnavailableError } from '@/runtime/runtimeCommandPort';
import { createRuntimeSessionStore } from '@/runtime/runtimeSessionStore';

describe('RuntimeCommandPort', () => {
  it('orders worker commands and waits for each acknowledgement', async () => {
    const sessions = createRuntimeSessionStore();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const requestQueueInput = vi.fn(async (value: string | number | number[]) => {
      events.push(`start:${String(value)}`);
      if (value === 'a') {
        await first;
      }
      events.push(`end:${String(value)}`);
    });
    sessions.replace({ controller: { requestQueueInput } } as unknown as IdeRuntimeSession);
    const port = new RuntimeCommandPort(sessions);

    const firstCommand = port.queueInput('a');
    const secondCommand = port.queueInput('b');
    await Promise.resolve();
    expect(events).toEqual(['start:a']);
    releaseFirst();
    await Promise.all([firstCommand, secondCommand]);

    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('propagates rejection and continues the ordered queue', async () => {
    const sessions = createRuntimeSessionStore();
    const requestQueueInput = vi
      .fn()
      .mockRejectedValueOnce(new Error('worker rejected command'))
      .mockResolvedValueOnce(undefined);
    sessions.replace({ controller: { requestQueueInput } } as unknown as IdeRuntimeSession);
    const port = new RuntimeCommandPort(sessions);

    await expect(port.queueInput('a')).rejects.toThrow('worker rejected command');
    await expect(port.queueInput('b')).resolves.toBeUndefined();
  });

  it('fails closed when no runtime is active', async () => {
    const port = new RuntimeCommandPort(createRuntimeSessionStore());
    await expect(port.reset()).rejects.toBeInstanceOf(RuntimeUnavailableError);
  });

  it('orders hardware input commands through the worker controller', async () => {
    const sessions = createRuntimeSessionStore();
    const requestSetHardwareToggle = vi.fn().mockResolvedValue(undefined);
    const requestSetHardwareButton = vi.fn().mockResolvedValue(undefined);
    sessions.replace({
      controller: { requestSetHardwareToggle, requestSetHardwareButton },
    } as unknown as IdeRuntimeSession);
    const port = new RuntimeCommandPort(sessions);

    await port.setHardwareToggle(7, true);
    await port.setHardwareButton(0, true);

    expect(requestSetHardwareToggle).toHaveBeenCalledWith(7, true);
    expect(requestSetHardwareButton).toHaveBeenCalledWith(0, true);
  });
});
