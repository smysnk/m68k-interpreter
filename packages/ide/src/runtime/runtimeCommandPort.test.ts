import { describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  RuntimeCommandPort,
  RuntimeUnavailableError,
  StaleRuntimeCommandError,
} from '@/runtime/runtimeCommandPort';
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

  it('rejects a queued command when its runtime is replaced before execution', async () => {
    const sessions = createRuntimeSessionStore();
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const oldController = {
      requestQueueInput: vi.fn(async (input: string | number | number[]) => {
        if (input === 'first') await blocker;
      }),
    };
    sessions.replace({ controller: oldController } as unknown as IdeRuntimeSession);
    const port = new RuntimeCommandPort(sessions);
    const first = port.queueInput('first');
    const stale = port.queueInput('stale');
    await Promise.resolve();
    sessions.replace({
      controller: { requestQueueInput: vi.fn() },
    } as unknown as IdeRuntimeSession);
    release();
    await first;
    await expect(stale).rejects.toBeInstanceOf(StaleRuntimeCommandError);
    expect(oldController.requestQueueInput).toHaveBeenCalledTimes(1);
  });

  it('fails closed when no runtime is active', async () => {
    const port = new RuntimeCommandPort(createRuntimeSessionStore());
    await expect(port.reset()).rejects.toBeInstanceOf(RuntimeUnavailableError);
  });

  it('pauses worker and in-process runtimes through equivalent command contracts', async () => {
    const workerSessions = createRuntimeSessionStore();
    const requestPause = vi.fn().mockResolvedValue(undefined);
    const workerPauseDebugger = vi.fn();
    workerSessions.replace({
      controller: { requestPause },
      pauseDebugger: workerPauseDebugger,
    } as unknown as IdeRuntimeSession);
    const workerPort = new RuntimeCommandPort(workerSessions);

    await expect(workerPort.pause()).resolves.toBe(true);
    expect(workerPauseDebugger).toHaveBeenCalledOnce();
    expect(requestPause).toHaveBeenCalledOnce();

    const inProcessSessions = createRuntimeSessionStore();
    const pauseDebugger = vi.fn();
    inProcessSessions.replace({ pauseDebugger } as unknown as IdeRuntimeSession);
    const inProcessPort = new RuntimeCommandPort(inProcessSessions);

    await expect(inProcessPort.pause()).resolves.toBe(false);
    expect(pauseDebugger).toHaveBeenCalledOnce();
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

  it('deduplicates identical topology and automatic interrupt configuration per runtime epoch', async () => {
    const sessions = createRuntimeSessionStore();
    const requestConfigureHardwareDevices = vi.fn().mockResolvedValue({
      valid: true,
      conflicts: [],
      errors: [],
    });
    const requestConfigureAutomaticInterrupts = vi.fn().mockResolvedValue(undefined);
    const session = {
      controller: {
        requestConfigureHardwareDevices,
        requestConfigureAutomaticInterrupts,
      },
    } as unknown as IdeRuntimeSession;
    sessions.replace(session);
    const port = new RuntimeCommandPort(sessions);
    const devices = [
      {
        id: 'display-a',
        deviceType: 'display' as const,
        displayBase: 0xe00000,
      },
    ];

    await port.configureHardwareDevices(devices);
    await port.configureHardwareDevices(devices);
    await port.configureAutomaticInterrupts([3, 1], 250);
    await port.configureAutomaticInterrupts([1, 3, 3], 250);
    expect(requestConfigureHardwareDevices).toHaveBeenCalledTimes(1);
    expect(requestConfigureAutomaticInterrupts).toHaveBeenCalledTimes(1);

    sessions.replace({ ...session } as IdeRuntimeSession);
    await port.configureHardwareDevices(devices);
    await port.configureAutomaticInterrupts([3, 1], 250);
    expect(requestConfigureHardwareDevices).toHaveBeenCalledTimes(2);
    expect(requestConfigureAutomaticInterrupts).toHaveBeenCalledTimes(2);
  });
});
