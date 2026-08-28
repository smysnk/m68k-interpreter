import { describe, expect, it } from 'vitest';
import type { DebugSnapshot } from '@m68k/interpreter';
import {
  createIdeStore,
  requestDebuggerPause,
  resetEmulatorState,
  selectExecutionToolbarModel,
  selectRuntimePhaseModel,
  setEditorCode,
  setExecutionState,
  setRuntimeCommandPending,
  setRuntimeSessionMetadata,
  syncDebugSnapshot,
  type AppStore,
  type RuntimeLifecycleCommand,
} from '@/store';

function snapshot(
  status: DebugSnapshot['status'],
  reason?: NonNullable<DebugSnapshot['stop']>['reason']
): DebugSnapshot {
  return {
    status,
    stop: reason ? { pc: 0x1006, reason } : undefined,
    breakpoints: [],
    watchpoints: [],
    watches: [],
    callStack: [],
    logs: [],
  };
}

function runningStore(): AppStore {
  const store = createIdeStore();
  store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
  store.dispatch(setExecutionState({ started: true, ended: false, stopped: false }));
  store.dispatch(syncDebugSnapshot(snapshot('running')));
  return store;
}

function pendingStore(command: RuntimeLifecycleCommand): AppStore {
  const store = runningStore();
  store.dispatch(setRuntimeCommandPending(command));
  return store;
}

describe('execution control selectors', () => {
  it('derives ready and empty phases from runnable source', () => {
    const store = createIdeStore();
    expect(selectRuntimePhaseModel(store.getState()).phase).toBe('ready');

    store.dispatch(setEditorCode('   \n'));
    expect(selectRuntimePhaseModel(store.getState()).phase).toBe('empty');
    expect(selectExecutionToolbarModel(store.getState()).controls.run.enabled).toBe(false);
  });

  it.each([
    {
      name: 'ready',
      setup: () => createIdeStore(),
      phase: 'ready',
      enabled: [true, false, false, false],
      current: [false, false, false, false],
    },
    {
      name: 'starting',
      setup: () => pendingStore('start'),
      phase: 'starting',
      enabled: [false, false, false, false],
      current: [true, false, false, false],
    },
    {
      name: 'running',
      setup: runningStore,
      phase: 'running',
      enabled: [false, true, true, true],
      current: [false, false, false, false],
    },
    {
      name: 'pause requested',
      setup: () => {
        const store = runningStore();
        store.dispatch(requestDebuggerPause());
        return store;
      },
      phase: 'pause-requested',
      enabled: [false, false, true, true],
      current: [false, true, false, false],
    },
    {
      name: 'paused',
      setup: () => {
        const store = runningStore();
        store.dispatch(setExecutionState({ started: false, stopped: true }));
        store.dispatch(syncDebugSnapshot(snapshot('paused', 'manual-pause')));
        return store;
      },
      phase: 'paused',
      enabled: [true, false, true, true],
      current: [false, true, false, false],
    },
    {
      name: 'waiting',
      setup: () => {
        const store = runningStore();
        store.dispatch(setExecutionState({ started: true, stopped: true }));
        store.dispatch(syncDebugSnapshot(snapshot('waiting', 'waiting-for-input')));
        return store;
      },
      phase: 'waiting',
      enabled: [false, false, true, true],
      current: [false, false, false, false],
    },
    {
      name: 'halted',
      setup: () => {
        const store = runningStore();
        store.dispatch(setExecutionState({ started: false, ended: true, stopped: false }));
        store.dispatch(syncDebugSnapshot(snapshot('halted', 'completed')));
        return store;
      },
      phase: 'halted',
      enabled: [true, false, false, true],
      current: [false, false, false, false],
    },
    {
      name: 'exception',
      setup: () => {
        const store = runningStore();
        store.dispatch(
          setExecutionState({ started: false, ended: true, stopped: false, exception: 'Fault' })
        );
        store.dispatch(syncDebugSnapshot(snapshot('faulted', 'exception')));
        return store;
      },
      phase: 'exception',
      enabled: [true, false, false, true],
      current: [false, false, false, false],
    },
    {
      name: 'stopping',
      setup: () => pendingStore('stop'),
      phase: 'stopping',
      enabled: [false, false, false, false],
      current: [false, false, true, false],
    },
    {
      name: 'restarting',
      setup: () => pendingStore('restart'),
      phase: 'restarting',
      enabled: [false, false, false, false],
      current: [false, false, false, true],
    },
  ])('$name exposes the expected toolbar state', ({ setup, phase, enabled, current }) => {
    const model = selectExecutionToolbarModel(setup().getState());
    const controls = [
      model.controls.run,
      model.controls.debug,
      model.controls.stop,
      model.controls.restart,
    ];

    expect(model.phase).toBe(phase);
    expect(controls.map((item) => item.enabled)).toEqual(enabled);
    expect(controls.map((item) => item.current)).toEqual(current);
  });

  it('preserves the old runtime truth when edited source becomes stale', () => {
    const store = runningStore();
    store.dispatch(setEditorCode('START\n  NOP\n  END START'));

    const phase = selectRuntimePhaseModel(store.getState());
    const toolbar = selectExecutionToolbarModel(store.getState());
    expect(phase).toMatchObject({
      phase: 'source-stale',
      underlyingPhase: 'running',
      sourceStale: true,
    });
    expect(toolbar.stateLabel).toBe('SOURCE CHANGED · OLD BUILD RUNNING');
    expect(toolbar.controls.run).toMatchObject({
      command: 'run',
      enabled: true,
      label: 'Run updated source',
    });
    expect(toolbar.controls.debug.enabled).toBe(false);
    expect(toolbar.controls.stop.enabled).toBe(true);
  });

  it('preserves lifecycle state while reset clears the active runtime', () => {
    const store = pendingStore('stop');
    store.dispatch(resetEmulatorState());

    expect(store.getState().emulator.runtimeCommandPending).toBe('stop');
    expect(selectExecutionToolbarModel(store.getState()).phase).toBe('stopping');
  });
});
