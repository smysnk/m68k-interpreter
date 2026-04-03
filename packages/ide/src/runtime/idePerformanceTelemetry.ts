import React from 'react';

export interface IdeRenderProfileStat {
  id: string;
  renderCount: number;
  mountCount: number;
  updateCount: number;
  actualDurationMs: number;
  baseDurationMs: number;
  maxActualDurationMs: number;
  lastActualDurationMs: number;
  lastCommitTimeMs: number;
}

export interface IdeRuntimeSyncStat {
  callCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  reusedRegisters: number;
  reusedFlags: number;
  reusedMemory: number;
  reusedTerminal: number;
  publishedMemory: number;
  publishedTerminal: number;
}

export interface IdeWorkerTransportStat {
  commandsSent: number;
  eventsReceived: number;
  readyEventsReceived: number;
  repliesReceived: number;
  frameEventsReceived: number;
  stoppedEventsReceived: number;
  faultEventsReceived: number;
  framesWithMemoryImage: number;
  framesWithTerminalFrameBuffer: number;
  framesWithTerminalSnapshot: number;
}

export interface IdeTerminalRepaintStat {
  repaintCount: number;
  fullRedrawCount: number;
  rowPatchCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  totalAnsiBytes: number;
  totalRowsPatched: number;
}

export interface IdeTouchLatencyStat {
  dispatchCount: number;
  totalDispatchDurationMs: number;
  maxDispatchDurationMs: number;
  lastDispatchDurationMs: number;
  visualLatencyCount: number;
  totalVisualLatencyMs: number;
  maxVisualLatencyMs: number;
  lastVisualLatencyMs: number;
}

export interface IdeInputProgressAckStat {
  requestCount: number;
  acceptedCount: number;
  ackCount: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  lastLatencyMs: number;
}

export interface IdePerformanceSnapshot {
  renderStats: IdeRenderProfileStat[];
  runtimeSync: IdeRuntimeSyncStat;
  workerTransport: IdeWorkerTransportStat;
  terminalRepaint: IdeTerminalRepaintStat;
  touchLatency: IdeTouchLatencyStat;
  inputProgressAck: IdeInputProgressAckStat;
}

interface IdePerformanceTelemetryController {
  enabled: boolean;
  markInputAccepted: () => void;
  markInputRequest: (metric?: { startedAtMs?: number }) => void;
  reset: () => void;
  snapshot: () => IdePerformanceSnapshot;
}

declare global {
  interface Window {
    __M68K_IDE_PERF__?: IdePerformanceTelemetryController;
    __M68K_IDE_PERF_ENABLED__?: boolean;
  }
}

const renderStats = new Map<string, IdeRenderProfileStat>();
const runtimeSyncStat: IdeRuntimeSyncStat = {
  callCount: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  reusedRegisters: 0,
  reusedFlags: 0,
  reusedMemory: 0,
  reusedTerminal: 0,
  publishedMemory: 0,
  publishedTerminal: 0,
};

const workerTransportStat: IdeWorkerTransportStat = {
  commandsSent: 0,
  eventsReceived: 0,
  readyEventsReceived: 0,
  repliesReceived: 0,
  frameEventsReceived: 0,
  stoppedEventsReceived: 0,
  faultEventsReceived: 0,
  framesWithMemoryImage: 0,
  framesWithTerminalFrameBuffer: 0,
  framesWithTerminalSnapshot: 0,
};

const terminalRepaintStat: IdeTerminalRepaintStat = {
  repaintCount: 0,
  fullRedrawCount: 0,
  rowPatchCount: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  totalAnsiBytes: 0,
  totalRowsPatched: 0,
};

const touchLatencyStat: IdeTouchLatencyStat = {
  dispatchCount: 0,
  totalDispatchDurationMs: 0,
  maxDispatchDurationMs: 0,
  lastDispatchDurationMs: 0,
  visualLatencyCount: 0,
  totalVisualLatencyMs: 0,
  maxVisualLatencyMs: 0,
  lastVisualLatencyMs: 0,
};

const inputProgressAckStat: IdeInputProgressAckStat = {
  requestCount: 0,
  acceptedCount: 0,
  ackCount: 0,
  totalLatencyMs: 0,
  maxLatencyMs: 0,
  lastLatencyMs: 0,
};

let pendingTouchVisualLatencyStartedAtMs: number | null = null;
let pendingInputProgressAckStartedAtMs: number | null = null;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function isTelemetryEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.__M68K_IDE_PERF_ENABLED__ === true) {
    return true;
  }

  if (process.env.NEXT_PUBLIC_IDE_PROFILE_RENDERS === 'true') {
    return true;
  }

  try {
    return new URLSearchParams(window.location.search).get('ide_perf') === '1';
  } catch {
    return false;
  }
}

function buildSnapshot(): IdePerformanceSnapshot {
  return {
    renderStats: Array.from(renderStats.values()).sort((left, right) =>
      right.actualDurationMs - left.actualDurationMs
    ),
    runtimeSync: {
      ...runtimeSyncStat,
    },
    workerTransport: {
      ...workerTransportStat,
    },
    terminalRepaint: {
      ...terminalRepaintStat,
    },
    touchLatency: {
      ...touchLatencyStat,
    },
    inputProgressAck: {
      ...inputProgressAckStat,
    },
  };
}

function resetTelemetry(): void {
  renderStats.clear();
  runtimeSyncStat.callCount = 0;
  runtimeSyncStat.totalDurationMs = 0;
  runtimeSyncStat.maxDurationMs = 0;
  runtimeSyncStat.reusedRegisters = 0;
  runtimeSyncStat.reusedFlags = 0;
  runtimeSyncStat.reusedMemory = 0;
  runtimeSyncStat.reusedTerminal = 0;
  runtimeSyncStat.publishedMemory = 0;
  runtimeSyncStat.publishedTerminal = 0;
  workerTransportStat.commandsSent = 0;
  workerTransportStat.eventsReceived = 0;
  workerTransportStat.readyEventsReceived = 0;
  workerTransportStat.repliesReceived = 0;
  workerTransportStat.frameEventsReceived = 0;
  workerTransportStat.stoppedEventsReceived = 0;
  workerTransportStat.faultEventsReceived = 0;
  workerTransportStat.framesWithMemoryImage = 0;
  workerTransportStat.framesWithTerminalFrameBuffer = 0;
  workerTransportStat.framesWithTerminalSnapshot = 0;
  terminalRepaintStat.repaintCount = 0;
  terminalRepaintStat.fullRedrawCount = 0;
  terminalRepaintStat.rowPatchCount = 0;
  terminalRepaintStat.totalDurationMs = 0;
  terminalRepaintStat.maxDurationMs = 0;
  terminalRepaintStat.totalAnsiBytes = 0;
  terminalRepaintStat.totalRowsPatched = 0;
  touchLatencyStat.dispatchCount = 0;
  touchLatencyStat.totalDispatchDurationMs = 0;
  touchLatencyStat.maxDispatchDurationMs = 0;
  touchLatencyStat.lastDispatchDurationMs = 0;
  touchLatencyStat.visualLatencyCount = 0;
  touchLatencyStat.totalVisualLatencyMs = 0;
  touchLatencyStat.maxVisualLatencyMs = 0;
  touchLatencyStat.lastVisualLatencyMs = 0;
  inputProgressAckStat.requestCount = 0;
  inputProgressAckStat.acceptedCount = 0;
  inputProgressAckStat.ackCount = 0;
  inputProgressAckStat.totalLatencyMs = 0;
  inputProgressAckStat.maxLatencyMs = 0;
  inputProgressAckStat.lastLatencyMs = 0;
  pendingTouchVisualLatencyStartedAtMs = null;
  pendingInputProgressAckStartedAtMs = null;
}

function ensureTelemetryController(): IdePerformanceTelemetryController | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const enabled = isTelemetryEnabled();
  if (window.__M68K_IDE_PERF__) {
    window.__M68K_IDE_PERF__.enabled = enabled;
    return window.__M68K_IDE_PERF__;
  }

  window.__M68K_IDE_PERF__ = {
    enabled,
    markInputAccepted: recordInputAccepted,
    markInputRequest: recordInputProgressRequest,
    reset: resetTelemetry,
    snapshot: buildSnapshot,
  };

  return window.__M68K_IDE_PERF__;
}

function recordRenderStat(
  id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  baseDuration: number,
  commitTime: number
): void {
  const current =
    renderStats.get(id) ??
    ({
      id,
      renderCount: 0,
      mountCount: 0,
      updateCount: 0,
      actualDurationMs: 0,
      baseDurationMs: 0,
      maxActualDurationMs: 0,
      lastActualDurationMs: 0,
      lastCommitTimeMs: 0,
    } satisfies IdeRenderProfileStat);

  current.renderCount += 1;
  if (phase === 'mount') {
    current.mountCount += 1;
  } else {
    current.updateCount += 1;
  }
  current.actualDurationMs += actualDuration;
  current.baseDurationMs += baseDuration;
  current.maxActualDurationMs = Math.max(current.maxActualDurationMs, actualDuration);
  current.lastActualDurationMs = actualDuration;
  current.lastCommitTimeMs = commitTime;
  renderStats.set(id, current);
}

export function recordRuntimeFrameSync(metric: {
  durationMs: number;
  reusedRegisters: boolean;
  reusedFlags: boolean;
  reusedMemory: boolean;
  reusedTerminal: boolean;
  publishedMemory: boolean;
  publishedTerminal: boolean;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  runtimeSyncStat.callCount += 1;
  runtimeSyncStat.totalDurationMs += metric.durationMs;
  runtimeSyncStat.maxDurationMs = Math.max(runtimeSyncStat.maxDurationMs, metric.durationMs);
  runtimeSyncStat.reusedRegisters += metric.reusedRegisters ? 1 : 0;
  runtimeSyncStat.reusedFlags += metric.reusedFlags ? 1 : 0;
  runtimeSyncStat.reusedMemory += metric.reusedMemory ? 1 : 0;
  runtimeSyncStat.reusedTerminal += metric.reusedTerminal ? 1 : 0;
  runtimeSyncStat.publishedMemory += metric.publishedMemory ? 1 : 0;
  runtimeSyncStat.publishedTerminal += metric.publishedTerminal ? 1 : 0;
}

export function recordWorkerCommandSent(): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  workerTransportStat.commandsSent += 1;
}

export function recordWorkerEventReceived(metric: {
  type: 'ready' | 'reply' | 'frame' | 'stopped' | 'fault';
  includesMemoryImage?: boolean;
  includesTerminalFrameBuffer?: boolean;
  includesTerminalSnapshot?: boolean;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  workerTransportStat.eventsReceived += 1;
  switch (metric.type) {
    case 'ready':
      workerTransportStat.readyEventsReceived += 1;
      break;
    case 'reply':
      workerTransportStat.repliesReceived += 1;
      break;
    case 'frame':
      workerTransportStat.frameEventsReceived += 1;
      workerTransportStat.framesWithMemoryImage += metric.includesMemoryImage ? 1 : 0;
      workerTransportStat.framesWithTerminalFrameBuffer += metric.includesTerminalFrameBuffer ? 1 : 0;
      workerTransportStat.framesWithTerminalSnapshot += metric.includesTerminalSnapshot ? 1 : 0;
      break;
    case 'stopped':
      workerTransportStat.stoppedEventsReceived += 1;
      break;
    case 'fault':
      workerTransportStat.faultEventsReceived += 1;
      break;
  }
}

export function recordTerminalRepaint(metric: {
  kind: 'full-redraw' | 'row-patch';
  durationMs: number;
  ansiBytes: number;
  rowsPatched: number;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  terminalRepaintStat.repaintCount += 1;
  if (metric.kind === 'full-redraw') {
    terminalRepaintStat.fullRedrawCount += 1;
  } else {
    terminalRepaintStat.rowPatchCount += 1;
  }
  terminalRepaintStat.totalDurationMs += metric.durationMs;
  terminalRepaintStat.maxDurationMs = Math.max(
    terminalRepaintStat.maxDurationMs,
    metric.durationMs
  );
  terminalRepaintStat.totalAnsiBytes += Math.max(0, Math.round(metric.ansiBytes));
  terminalRepaintStat.totalRowsPatched += Math.max(0, Math.round(metric.rowsPatched));

  if (pendingTouchVisualLatencyStartedAtMs !== null) {
    const visualLatencyMs = Math.max(0, nowMs() - pendingTouchVisualLatencyStartedAtMs);
    touchLatencyStat.visualLatencyCount += 1;
    touchLatencyStat.totalVisualLatencyMs += visualLatencyMs;
    touchLatencyStat.maxVisualLatencyMs = Math.max(
      touchLatencyStat.maxVisualLatencyMs,
      visualLatencyMs
    );
    touchLatencyStat.lastVisualLatencyMs = visualLatencyMs;
    pendingTouchVisualLatencyStartedAtMs = null;
  }

  if (pendingInputProgressAckStartedAtMs !== null) {
    const progressLatencyMs = Math.max(0, nowMs() - pendingInputProgressAckStartedAtMs);
    inputProgressAckStat.ackCount += 1;
    inputProgressAckStat.totalLatencyMs += progressLatencyMs;
    inputProgressAckStat.maxLatencyMs = Math.max(
      inputProgressAckStat.maxLatencyMs,
      progressLatencyMs
    );
    inputProgressAckStat.lastLatencyMs = progressLatencyMs;
    pendingInputProgressAckStartedAtMs = null;

    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(
        `__M68K_INPUT_PROGRESS_ACK__${JSON.stringify({
          ackCount: inputProgressAckStat.ackCount,
          latencyMs: progressLatencyMs,
          repaintCount: terminalRepaintStat.repaintCount,
          frameEventsReceived: workerTransportStat.frameEventsReceived,
          touchDispatchCount: touchLatencyStat.dispatchCount,
          touchVisualCount: touchLatencyStat.visualLatencyCount,
        })}`
      );
    }
  }
}

export function recordInputProgressRequest(metric?: {
  startedAtMs?: number;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  inputProgressAckStat.requestCount += 1;
  pendingInputProgressAckStartedAtMs = metric?.startedAtMs ?? nowMs();
}

export function recordInputAccepted(): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  inputProgressAckStat.acceptedCount += 1;

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      `__M68K_INPUT_ACCEPTED__${JSON.stringify({
        acceptedCount: inputProgressAckStat.acceptedCount,
        requestCount: inputProgressAckStat.requestCount,
      })}`
    );
  }
}

export function recordTouchDispatch(metric: {
  startedAtMs: number;
  durationMs: number;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  touchLatencyStat.dispatchCount += 1;
  touchLatencyStat.totalDispatchDurationMs += metric.durationMs;
  touchLatencyStat.maxDispatchDurationMs = Math.max(
    touchLatencyStat.maxDispatchDurationMs,
    metric.durationMs
  );
  touchLatencyStat.lastDispatchDurationMs = metric.durationMs;
  pendingTouchVisualLatencyStartedAtMs = metric.startedAtMs;
  recordInputProgressRequest({ startedAtMs: metric.startedAtMs });
}

const handleProfileRender: React.ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  _startTime,
  commitTime
) => {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }

  recordRenderStat(id, phase, actualDuration, baseDuration, commitTime);
};

export const RenderProfileBoundary: React.FC<{
  id: string;
  children: React.ReactNode;
}> = ({ id, children }) =>
  React.createElement(React.Profiler, { id, onRender: handleProfileRender }, children);

export function resetIdePerformanceTelemetry(): void {
  resetTelemetry();
}

export function getIdePerformanceSnapshot(): IdePerformanceSnapshot {
  return buildSnapshot();
}

export function useIdeRenderTelemetry(id: string): void {
  const mountedRef = React.useRef(false);
  const renderStartedAtRef = React.useRef(0);
  renderStartedAtRef.current =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  React.useEffect(() => {
    const controller = ensureTelemetryController();
    if (!controller?.enabled) {
      mountedRef.current = true;
      return;
    }

    const finishedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const actualDuration = Math.max(0, finishedAt - renderStartedAtRef.current);
    recordRenderStat(
      id,
      mountedRef.current ? 'update' : 'mount',
      actualDuration,
      actualDuration,
      finishedAt
    );
    mountedRef.current = true;
  });
}
