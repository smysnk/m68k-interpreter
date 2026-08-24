import { describe, expect, it } from 'vitest';
import type { DebugStopReason, DebugSnapshot } from '@m68k/interpreter';
import {
  createIdeStore,
  setExecutionState,
  setRuntimeSessionMetadata,
  syncDebugSnapshot,
} from '@/store';
import { selectCodeDebuggerControlModel } from './codeDebuggerSelectors';

function snapshotFor(reason?: DebugStopReason): DebugSnapshot {
  const paused =
    reason !== undefined && !['waiting-for-input', 'halted', 'completed'].includes(reason);
  return {
    status:
      reason === undefined
        ? 'running'
        : reason === 'waiting-for-input'
          ? 'waiting'
          : reason === 'halted' || reason === 'completed'
            ? 'halted'
            : reason === 'exception'
              ? 'faulted'
              : paused
                ? 'paused'
                : 'running',
    stop:
      reason === undefined
        ? undefined
        : {
            reason,
            pc: 0x1000,
            source: { fileId: 'workspace:scratch.asm', line: 2 },
          },
    breakpoints: [],
    callStack: [],
    logs: [],
    watches: [],
    watchpoints: [],
  };
}

function modelFor(reason?: DebugStopReason, runtimeReady = true) {
  const store = createIdeStore();
  if (runtimeReady) {
    store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
  }
  store.dispatch(
    setExecutionState({
      started: true,
      ended: reason === 'halted' || reason === 'completed',
      stopped: reason === 'waiting-for-input',
    })
  );
  store.dispatch(syncDebugSnapshot(snapshotFor(reason)));
  return selectCodeDebuggerControlModel(store.getState());
}

function waitingInspectionModel() {
  const store = createIdeStore();
  const fileId = store.getState().files.activeFileId;
  store.dispatch(setRuntimeSessionMetadata({ epoch: 1, ready: true, transport: 'worker' }));
  store.dispatch(setExecutionState({ started: true, ended: false, stopped: true }));
  store.dispatch(
    syncDebugSnapshot({
      ...snapshotFor('waiting-for-input'),
      stop: {
        reason: 'waiting-for-input',
        pc: 0x1006,
        source: { fileId, line: 4 },
      },
    })
  );
  store.dispatch({ type: 'debugger/startWaitingInspection' });
  return selectCodeDebuggerControlModel(store.getState());
}

describe('selectCodeDebuggerControlModel', () => {
  it('enables the collapsed Debug pause action only for active execution', () => {
    expect(modelFor(undefined, false)).toMatchObject({
      canPause: false,
      controlsExpanded: false,
    });
    expect(modelFor()).toMatchObject({ canPause: true, controlsExpanded: false });
    expect(modelFor('waiting-for-input')).toMatchObject({
      canPause: false,
      controlsExpanded: false,
    });
    expect(modelFor('halted')).toMatchObject({ canPause: false, controlsExpanded: false });
  });

  it.each<DebugStopReason>([
    'breakpoint',
    'watchpoint',
    'manual-pause',
    'step-complete',
    'run-to-cursor',
    'exception',
    'interrupt',
  ])('expands for the actionable %s stop', (reason) => {
    expect(modelFor(reason)).toMatchObject({
      canPause: false,
      controlsExpanded: true,
      stopReason: reason,
    });
  });

  it.each<DebugStopReason>(['waiting-for-input', 'halted', 'completed'])(
    'stays collapsed for the terminal %s stop',
    (reason) => {
      expect(modelFor(reason)).toMatchObject({ canPause: false, controlsExpanded: false });
    }
  );

  it.fails('distinguishes pausing active execution from inspecting an input wait', () => {
    expect(modelFor() as unknown).toMatchObject({
      primaryAction: 'pause',
      disabledReason: undefined,
    });
    expect(modelFor('waiting-for-input') as unknown).toMatchObject({
      primaryAction: 'inspect-wait',
      disabledReason: undefined,
    });
    expect(modelFor('halted') as unknown).toMatchObject({
      primaryAction: 'unavailable',
      disabledReason: 'Program has halted',
    });
  });

  it.fails('uses shared debugger state to expand a requested waiting inspection', () => {
    expect(waitingInspectionModel()).toMatchObject({
      controlsExpanded: true,
      stopReason: 'waiting-for-input',
    });
  });

  it('retains the current source location while the machine is waiting', () => {
    expect(modelFor('waiting-for-input')).toMatchObject({
      stopReason: 'waiting-for-input',
      currentSourceLocation: { line: 2 },
    });
  });

  it.fails('exposes the waiting program counter to debugger presentation', () => {
    expect(waitingInspectionModel() as unknown).toMatchObject({
      currentAddress: 0x1006,
      currentSourceLocation: { line: 4 },
    });
  });

  it.fails('exposes only commands that are valid during an inspected input wait', () => {
    expect(waitingInspectionModel()).toMatchObject({
      canStepBackward: true,
      canStepOver: false,
      canStepInto: false,
      canStepOut: false,
      runToAddress: undefined,
    });
  });
});
