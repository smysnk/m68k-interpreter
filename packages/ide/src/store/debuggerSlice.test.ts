import { describe, expect, it } from 'vitest';
import reducer, {
  addSourceBreakpoint,
  initialDebuggerState,
  markDebugSourceStale,
  markDebugSourceSynchronized,
  resetDebugSession,
  syncDebugSnapshot,
  upsertBreakpoint,
} from './debuggerSlice';

describe('debuggerSlice', () => {
  it('toggles file-scoped source breakpoints without coupling them to a runtime', () => {
    const added = reducer(
      initialDebuggerState,
      addSourceBreakpoint({ fileId: 'main.asm', line: 12, id: 'source-12' })
    );
    expect(added.configuration.breakpoints).toEqual([
      { id: 'source-12', enabled: true, kind: 'source', fileId: 'main.asm', line: 12 },
    ]);
    expect(
      reducer(added, addSourceBreakpoint({ fileId: 'main.asm', line: 12 })).configuration
        .breakpoints
    ).toEqual([]);
  });

  it('keeps serializable policy separate from resolved session state', () => {
    const configured = reducer(
      initialDebuggerState,
      upsertBreakpoint({ id: 'raw', enabled: true, kind: 'address', address: 0x1000 })
    );
    const stale = reducer(configured, markDebugSourceStale());
    expect(stale.sourceStale).toBe(true);
    const snapshotUpdated = reducer(
      stale,
      syncDebugSnapshot({
        status: 'paused',
        stop: { reason: 'breakpoint', pc: 0x1000, breakpointId: 'raw' },
        breakpoints: [
          {
            id: 'raw',
            enabled: true,
            kind: 'address',
            address: 0x1000,
            addresses: [0x1000],
            bound: true,
            hitCount: 1,
          },
        ],
        watchpoints: [],
        watches: [],
        callStack: [],
        logs: [],
      })
    );
    expect(snapshotUpdated.sourceStale).toBe(true);
    const synchronized = reducer(snapshotUpdated, markDebugSourceSynchronized());
    expect(synchronized.sourceStale).toBe(false);
    expect(synchronized.configuration.breakpoints[0]).not.toHaveProperty('addresses');
    expect(synchronized.snapshot.breakpoints[0]?.hitCount).toBe(1);
  });

  it.fails('tracks a waiting inspection as shared serializable debugger UI state', () => {
    const waiting = reducer(
      initialDebuggerState,
      syncDebugSnapshot({
        status: 'waiting',
        stop: { reason: 'waiting-for-input', pc: 0x1006 },
        breakpoints: [],
        watchpoints: [],
        watches: [],
        callStack: [],
        logs: [],
      })
    );
    const inspecting = reducer(waiting, { type: 'debugger/startWaitingInspection' });

    expect(inspecting as unknown).toMatchObject({ waitingInspectionActive: true });
  });

  it.fails('clears waiting inspection on resume, source replacement, halt, and reset', () => {
    const beginInspection = () =>
      reducer(initialDebuggerState, { type: 'debugger/startWaitingInspection' });
    const running = reducer(
      beginInspection(),
      syncDebugSnapshot({
        status: 'running',
        breakpoints: [],
        watchpoints: [],
        watches: [],
        callStack: [],
        logs: [],
      })
    );
    const sourceReplaced = reducer(beginInspection(), markDebugSourceStale());
    const halted = reducer(
      beginInspection(),
      syncDebugSnapshot({
        status: 'halted',
        stop: { reason: 'completed', pc: 0x1010 },
        breakpoints: [],
        watchpoints: [],
        watches: [],
        callStack: [],
        logs: [],
      })
    );
    const reset = reducer(beginInspection(), resetDebugSession());

    for (const state of [running, sourceReplaced, halted, reset]) {
      expect(state as unknown).toMatchObject({ waitingInspectionActive: false });
    }
  });
});
