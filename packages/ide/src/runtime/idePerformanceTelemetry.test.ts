import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getIdePerformanceSnapshot,
  recordDebuggerPauseRequest,
  recordDebuggerSnapshotDispatch,
  resetIdePerformanceTelemetry,
} from '@/runtime/idePerformanceTelemetry';

describe('debugger surface performance telemetry', () => {
  beforeEach(() => {
    window.__M68K_IDE_PERF_ENABLED__ = true;
    resetIdePerformanceTelemetry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.__M68K_IDE_PERF_ENABLED__;
  });

  it('records changed snapshot payloads and manual-pause publication latency', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(100).mockReturnValueOnce(116);

    recordDebuggerPauseRequest();
    recordDebuggerSnapshotDispatch({
      snapshot: { status: 'paused', stop: { reason: 'manual-pause', pc: 0x1000 } },
      manualPause: true,
    });

    const snapshot = getIdePerformanceSnapshot().debuggerSurface;
    expect(snapshot).toMatchObject({
      snapshotDispatchCount: 1,
      pauseRequestCount: 1,
      pauseSnapshotCount: 1,
      lastPauseToSnapshotLatencyMs: 16,
      maxPauseToSnapshotLatencyMs: 16,
    });
    expect(snapshot.totalSnapshotPayloadBytes).toBeGreaterThan(0);
    expect(snapshot.maxSnapshotPayloadBytes).toBe(snapshot.totalSnapshotPayloadBytes);
  });

  it('does not attribute unrelated debugger snapshots to a pending manual pause', () => {
    recordDebuggerPauseRequest();
    recordDebuggerSnapshotDispatch({ snapshot: { status: 'running' }, manualPause: false });

    expect(getIdePerformanceSnapshot().debuggerSurface).toMatchObject({
      snapshotDispatchCount: 1,
      pauseRequestCount: 1,
      pauseSnapshotCount: 0,
    });
  });
});
