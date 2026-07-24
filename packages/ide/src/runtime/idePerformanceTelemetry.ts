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
  framesWithHardwareSnapshot: number;
}

export interface IdeHardwareSurfaceStat {
  snapshotsReceived: number;
  snapshotsPublished: number;
  snapshotsReused: number;
  noOpSnapshots: number;
  outputVersionChanges: number;
  framesWithHardwareSnapshot: number;
  approximatePayloadBytes: number;
  commandRequests: number;
  commandAcceptances: number;
  commandAcknowledgements: number;
  commandRejections: number;
  totalCommandAckLatencyMs: number;
  maxCommandAckLatencyMs: number;
  visibleStateLatencies: number;
  totalVisibleStateLatencyMs: number;
  maxVisibleStateLatencyMs: number;
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

export interface IdePanelWorkspaceStat {
  visiblePanels: number;
  expandedPanels: number;
  minimizedPanels: number;
  floatingPanels: number;
  terminalMirrors: number;
  layoutCommits: number;
  dragStarts: number;
  dragCancels: number;
  successfulDrops: number;
  validDockDrops: number;
  floatingDrops: number;
  dragDurationCount: number;
  totalDragDurationMs: number;
  maxDragDurationMs: number;
  previewFrameCount: number;
  p95PreviewFrameIntervalMs: number;
  maxPreviewFrameIntervalMs: number;
  ownershipTransfers: number;
  totalReducerDurationMs: number;
  maxReducerDurationMs: number;
  persistenceWrites: number;
  persistenceBytes: number;
  totalPersistenceDurationMs: number;
}

export interface IdePerformanceSnapshot {
  renderStats: IdeRenderProfileStat[];
  runtimeSync: IdeRuntimeSyncStat;
  workerTransport: IdeWorkerTransportStat;
  terminalRepaint: IdeTerminalRepaintStat;
  touchLatency: IdeTouchLatencyStat;
  inputProgressAck: IdeInputProgressAckStat;
  hardwareSurface: IdeHardwareSurfaceStat;
  panelWorkspace: IdePanelWorkspaceStat;
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
  framesWithHardwareSnapshot: 0,
};

const hardwareSurfaceStat: IdeHardwareSurfaceStat = {
  snapshotsReceived: 0,
  snapshotsPublished: 0,
  snapshotsReused: 0,
  noOpSnapshots: 0,
  outputVersionChanges: 0,
  framesWithHardwareSnapshot: 0,
  approximatePayloadBytes: 0,
  commandRequests: 0,
  commandAcceptances: 0,
  commandAcknowledgements: 0,
  commandRejections: 0,
  totalCommandAckLatencyMs: 0,
  maxCommandAckLatencyMs: 0,
  visibleStateLatencies: 0,
  totalVisibleStateLatencyMs: 0,
  maxVisibleStateLatencyMs: 0,
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
const panelWorkspaceStat: IdePanelWorkspaceStat = {
  visiblePanels: 0,
  expandedPanels: 0,
  minimizedPanels: 0,
  floatingPanels: 0,
  terminalMirrors: 0,
  layoutCommits: 0,
  dragStarts: 0,
  dragCancels: 0,
  successfulDrops: 0,
  validDockDrops: 0,
  floatingDrops: 0,
  dragDurationCount: 0,
  totalDragDurationMs: 0,
  maxDragDurationMs: 0,
  previewFrameCount: 0,
  p95PreviewFrameIntervalMs: 0,
  maxPreviewFrameIntervalMs: 0,
  ownershipTransfers: 0,
  totalReducerDurationMs: 0,
  maxReducerDurationMs: 0,
  persistenceWrites: 0,
  persistenceBytes: 0,
  totalPersistenceDurationMs: 0,
};

let pendingTouchVisualLatencyStartedAtMs: number | null = null;
let pendingInputProgressAckStartedAtMs: number | null = null;
const panelDragFrameIntervalsMs: number[] = [];

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

  if (import.meta.env.VITE_IDE_PROFILE_RENDERS === 'true') {
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
    renderStats: Array.from(renderStats.values()).sort(
      (left, right) => right.actualDurationMs - left.actualDurationMs
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
    hardwareSurface: {
      ...hardwareSurfaceStat,
    },
    panelWorkspace: {
      ...panelWorkspaceStat,
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
  workerTransportStat.framesWithHardwareSnapshot = 0;
  hardwareSurfaceStat.snapshotsReceived = 0;
  hardwareSurfaceStat.snapshotsPublished = 0;
  hardwareSurfaceStat.snapshotsReused = 0;
  hardwareSurfaceStat.noOpSnapshots = 0;
  hardwareSurfaceStat.outputVersionChanges = 0;
  hardwareSurfaceStat.framesWithHardwareSnapshot = 0;
  hardwareSurfaceStat.approximatePayloadBytes = 0;
  hardwareSurfaceStat.commandRequests = 0;
  hardwareSurfaceStat.commandAcceptances = 0;
  hardwareSurfaceStat.commandAcknowledgements = 0;
  hardwareSurfaceStat.commandRejections = 0;
  hardwareSurfaceStat.totalCommandAckLatencyMs = 0;
  hardwareSurfaceStat.maxCommandAckLatencyMs = 0;
  hardwareSurfaceStat.visibleStateLatencies = 0;
  hardwareSurfaceStat.totalVisibleStateLatencyMs = 0;
  hardwareSurfaceStat.maxVisibleStateLatencyMs = 0;
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
  Object.assign(panelWorkspaceStat, {
    visiblePanels: 0, expandedPanels: 0, minimizedPanels: 0, floatingPanels: 0,
    terminalMirrors: 0, layoutCommits: 0, dragStarts: 0, dragCancels: 0,
    successfulDrops: 0, validDockDrops: 0, floatingDrops: 0,
    dragDurationCount: 0, totalDragDurationMs: 0, maxDragDurationMs: 0,
    previewFrameCount: 0, p95PreviewFrameIntervalMs: 0, maxPreviewFrameIntervalMs: 0,
    ownershipTransfers: 0, totalReducerDurationMs: 0,
    maxReducerDurationMs: 0, persistenceWrites: 0, persistenceBytes: 0,
    totalPersistenceDurationMs: 0,
  });
  panelDragFrameIntervalsMs.length = 0;
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
  includesHardwareSnapshot?: boolean;
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
      workerTransportStat.framesWithTerminalFrameBuffer += metric.includesTerminalFrameBuffer
        ? 1
        : 0;
      workerTransportStat.framesWithTerminalSnapshot += metric.includesTerminalSnapshot ? 1 : 0;
      workerTransportStat.framesWithHardwareSnapshot += metric.includesHardwareSnapshot ? 1 : 0;
      hardwareSurfaceStat.framesWithHardwareSnapshot += metric.includesHardwareSnapshot ? 1 : 0;
      break;
    case 'stopped':
      workerTransportStat.stoppedEventsReceived += 1;
      break;
    case 'fault':
      workerTransportStat.faultEventsReceived += 1;
      break;
  }
}

export function recordHardwareSurfaceSnapshot(metric: {
  received: boolean;
  published: boolean;
  reused: boolean;
  noOp: boolean;
  outputVersionChanged: boolean;
  approximatePayloadBytes: number;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) {
    return;
  }
  hardwareSurfaceStat.snapshotsReceived += metric.received ? 1 : 0;
  hardwareSurfaceStat.snapshotsPublished += metric.published ? 1 : 0;
  hardwareSurfaceStat.snapshotsReused += metric.reused ? 1 : 0;
  hardwareSurfaceStat.noOpSnapshots += metric.noOp ? 1 : 0;
  hardwareSurfaceStat.outputVersionChanges += metric.outputVersionChanged ? 1 : 0;
  hardwareSurfaceStat.approximatePayloadBytes += Math.max(
    0,
    Math.round(metric.approximatePayloadBytes)
  );
}

export function recordHardwareCommandRequest(): void {
  const controller = ensureTelemetryController();
  if (controller?.enabled) hardwareSurfaceStat.commandRequests += 1;
}

export function recordHardwareCommandAcknowledgement(metric: {
  accepted: boolean;
  durationMs: number;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) return;
  hardwareSurfaceStat.commandAcknowledgements += 1;
  hardwareSurfaceStat.commandAcceptances += metric.accepted ? 1 : 0;
  hardwareSurfaceStat.commandRejections += metric.accepted ? 0 : 1;
  hardwareSurfaceStat.totalCommandAckLatencyMs += metric.durationMs;
  hardwareSurfaceStat.maxCommandAckLatencyMs = Math.max(
    hardwareSurfaceStat.maxCommandAckLatencyMs,
    metric.durationMs
  );
}

export function recordHardwareCommandVisibleLatency(durationMs: number): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) return;
  hardwareSurfaceStat.visibleStateLatencies += 1;
  hardwareSurfaceStat.totalVisibleStateLatencyMs += durationMs;
  hardwareSurfaceStat.maxVisibleStateLatencyMs = Math.max(
    hardwareSurfaceStat.maxVisibleStateLatencyMs,
    durationMs
  );
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

export function recordInputProgressRequest(metric?: { startedAtMs?: number }): void {
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

export function recordTouchDispatch(metric: { startedAtMs: number; durationMs: number }): void {
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

export function recordPanelWorkspaceCommit(metric: {
  durationMs: number;
  visiblePanels: number;
  expandedPanels: number;
  minimizedPanels: number;
  floatingPanels: number;
  terminalMirrors: number;
  ownershipTransfer?: boolean;
}): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) return;
  panelWorkspaceStat.visiblePanels = metric.visiblePanels;
  panelWorkspaceStat.expandedPanels = metric.expandedPanels;
  panelWorkspaceStat.minimizedPanels = metric.minimizedPanels;
  panelWorkspaceStat.floatingPanels = metric.floatingPanels;
  panelWorkspaceStat.terminalMirrors = metric.terminalMirrors;
  panelWorkspaceStat.layoutCommits += 1;
  panelWorkspaceStat.ownershipTransfers += metric.ownershipTransfer ? 1 : 0;
  panelWorkspaceStat.totalReducerDurationMs += metric.durationMs;
  panelWorkspaceStat.maxReducerDurationMs = Math.max(panelWorkspaceStat.maxReducerDurationMs, metric.durationMs);
}

export function recordPanelWorkspaceDrag(
  kind: 'start' | 'cancel' | 'drop',
  metric?: {
    durationMs?: number;
    outcome?: 'dock' | 'float' | 'noop';
    frameIntervalsMs?: readonly number[];
  },
): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) return;
  if (kind === 'start') panelWorkspaceStat.dragStarts += 1;
  if (kind === 'cancel') panelWorkspaceStat.dragCancels += 1;
  if (kind === 'drop') {
    panelWorkspaceStat.successfulDrops += 1;
    panelWorkspaceStat.validDockDrops += metric?.outcome === 'dock' ? 1 : 0;
    panelWorkspaceStat.floatingDrops += metric?.outcome === 'float' ? 1 : 0;
  }
  if (typeof metric?.durationMs === 'number') {
    panelWorkspaceStat.dragDurationCount += 1;
    panelWorkspaceStat.totalDragDurationMs += metric.durationMs;
    panelWorkspaceStat.maxDragDurationMs = Math.max(
      panelWorkspaceStat.maxDragDurationMs,
      metric.durationMs,
    );
  }
  if (metric?.frameIntervalsMs?.length) {
    panelDragFrameIntervalsMs.push(
      ...metric.frameIntervalsMs.filter((value) => Number.isFinite(value) && value >= 0),
    );
    if (panelDragFrameIntervalsMs.length > 240) {
      panelDragFrameIntervalsMs.splice(0, panelDragFrameIntervalsMs.length - 240);
    }
    const sorted = [...panelDragFrameIntervalsMs].sort((left, right) => left - right);
    panelWorkspaceStat.previewFrameCount += metric.frameIntervalsMs.length + 1;
    panelWorkspaceStat.p95PreviewFrameIntervalMs =
      sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
    panelWorkspaceStat.maxPreviewFrameIntervalMs = Math.max(
      panelWorkspaceStat.maxPreviewFrameIntervalMs,
      ...metric.frameIntervalsMs,
    );
  }
}

export function recordPanelWorkspacePersistence(metric: { durationMs: number; bytes: number }): void {
  const controller = ensureTelemetryController();
  if (!controller?.enabled) return;
  panelWorkspaceStat.persistenceWrites += 1;
  panelWorkspaceStat.persistenceBytes = metric.bytes;
  panelWorkspaceStat.totalPersistenceDurationMs += metric.durationMs;
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
