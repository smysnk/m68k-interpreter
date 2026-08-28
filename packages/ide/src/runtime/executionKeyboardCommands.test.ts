import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createIdeStore,
  setExecutionState,
  setRuntimeSessionMetadata,
  syncDebugSnapshot,
} from '@/store';
import { executionCoordinator } from './executionCoordinator';
import { handleExecutionShortcut } from './executionKeyboardCommands';

function runningState() {
  const store = createIdeStore();
  store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
  store.dispatch(setExecutionState({ started: true, ended: false, stopped: false }));
  store.dispatch(
    syncDebugSnapshot({
      status: 'running',
      breakpoints: [],
      callStack: [],
      logs: [],
      watches: [],
      watchpoints: [],
    })
  );
  return store.getState();
}

describe('execution keyboard commands', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('routes F6 through the canonical pause command exactly once', () => {
    const execute = vi.spyOn(executionCoordinator, 'execute').mockImplementation(() => {});
    const event = new KeyboardEvent('keydown', { key: 'F6', cancelable: true });

    expect(handleExecutionShortcut(event, runningState())).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith('pause');
  });

  it('does not dispatch disabled toolbar commands while still consuming browser shortcuts', () => {
    const execute = vi.spyOn(executionCoordinator, 'execute').mockImplementation(() => {});
    const readyState = createIdeStore().getState();
    const pause = new KeyboardEvent('keydown', { key: 'F6', cancelable: true });
    const stop = new KeyboardEvent('keydown', { key: 'F5', shiftKey: true, cancelable: true });

    expect(handleExecutionShortcut(pause, readyState)).toBe(true);
    expect(handleExecutionShortcut(stop, readyState)).toBe(true);
    expect(pause.defaultPrevented).toBe(true);
    expect(stop.defaultPrevented).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it('maps F5 to Continue only while the debugger is paused', () => {
    const execute = vi.spyOn(executionCoordinator, 'execute').mockImplementation(() => {});
    const store = createIdeStore();
    store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
    store.dispatch(setExecutionState({ started: false, ended: false, stopped: true }));
    store.dispatch(
      syncDebugSnapshot({
        status: 'paused',
        stop: { pc: 0x1006, reason: 'manual-pause' },
        breakpoints: [],
        callStack: [],
        logs: [],
        watches: [],
        watchpoints: [],
      })
    );

    const event = new KeyboardEvent('keydown', { key: 'F5', cancelable: true });
    expect(handleExecutionShortcut(event, store.getState())).toBe(true);
    expect(execute).toHaveBeenCalledWith('resume');
  });

  it('does not intercept F6 from an editable control', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true });
    input.addEventListener('keydown', (keyboardEvent) => {
      expect(handleExecutionShortcut(keyboardEvent)).toBe(false);
    });

    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
