import type {
  MemoryMeta,
  RuntimeSyncVersions,
  TerminalFrameBuffer,
  TerminalMeta,
  TerminalSnapshot,
  UndoCaptureMode,
} from '@m68k/interpreter';
import type { RuntimeFrameSyncPayload } from '@/runtime/runtimeFramePayload';
import type {
  TerminalTouchPacket,
  TerminalTouchProtocolSymbols,
} from '@/runtime/terminalTouchProtocol';

export type SerializedInt32Array = number[];
export type SerializedUint8Array = number[];

export interface WorkerRuntimeMetricsSnapshot {
  lastFrameInstructions: number;
  lastFrameDurationMs: number;
  lastStopReason: string;
}

export interface WorkerTerminalFrameBufferSnapshot {
  columns: number;
  rows: number;
  version: number;
  geometryVersion: number;
  data: Uint8Array;
  dirtyRows: number[];
}

export interface WorkerExecutionConfig {
  delayMs: number;
  speedMultiplier: number;
  frameBudgetMs?: number;
  publishMemoryDuringContinuousFrames?: boolean;
  terminalFocusedContinuousFrames?: boolean;
}

export interface WorkerStepResult {
  halted: boolean;
  waitingForInput: boolean;
  exception: string | null;
}

export interface WorkerRuntimeSnapshot {
  rawRegisters?: SerializedInt32Array;
  pc?: number;
  ccr?: number;
  sr?: number;
  usp?: number;
  ssp?: number;
  memoryMeta?: MemoryMeta;
  memoryImage?: Record<number, number>;
  terminalMeta?: TerminalMeta;
  terminalSnapshot?: TerminalSnapshot;
  terminalFrameBuffer?: WorkerTerminalFrameBufferSnapshot;
  lastInstruction?: string;
  errors?: string[];
  exception?: string | null;
  queuedInputLength?: number;
  halted?: boolean;
  waitingForInput?: boolean;
  symbols?: Record<string, number>;
  syncVersions?: RuntimeSyncVersions;
  runtimeMetrics?: Partial<WorkerRuntimeMetricsSnapshot>;
}

export type WorkerFrameKind = 'full' | 'terminal' | 'heartbeat';

export type InterpreterWorkerCommand =
  | { id: number; type: 'init' }
  | { id: number; type: 'dispose' }
  | { id: number; type: 'loadProgram'; source: string; columns: number; rows: number }
  | { id: number; type: 'run'; config: WorkerExecutionConfig }
  | { id: number; type: 'resume'; config: WorkerExecutionConfig }
  | { id: number; type: 'pause' }
  | { id: number; type: 'step' }
  | { id: number; type: 'undo' }
  | { id: number; type: 'reset' }
  | { id: number; type: 'queueInput'; input: string | number | number[] }
  | { id: number; type: 'clearInputQueue' }
  | { id: number; type: 'raiseExternalInterrupt'; handlerAddress: number }
  | { id: number; type: 'resizeTerminal'; columns: number; rows: number }
  | { id: number; type: 'writeMemoryByte'; address: number; value: number }
  | { id: number; type: 'writeMemoryWord'; address: number; value: number }
  | { id: number; type: 'writeMemoryLong'; address: number; value: number }
  | { id: number; type: 'setRegisterValue'; register: number; value: number }
  | { id: number; type: 'setUndoCaptureMode'; mode: UndoCaptureMode; checkpointInterval?: number }
  | { id: number; type: 'configureExecution'; config: WorkerExecutionConfig }
  | { id: number; type: 'pulseExecution'; frameBudgetMs?: number }
  | { id: number; type: 'requestSnapshot' }
  | { id: number; type: 'readMemoryRange'; address: number; length: number }
  | { id: number; type: 'getSymbolAddress'; symbol: string }
  | {
      id: number;
      type: 'dispatchTouchPacket';
      protocol: TerminalTouchProtocolSymbols;
      packet: TerminalTouchPacket;
    };

export interface InterpreterWorkerReadyEvent {
  type: 'ready';
}

export interface InterpreterWorkerFrameEvent {
  type: 'frame';
  kind: WorkerFrameKind;
  frame: RuntimeFrameSyncPayload;
  snapshot: WorkerRuntimeSnapshot;
}

export interface InterpreterWorkerStoppedEvent {
  type: 'stopped';
  reason: string;
}

export interface InterpreterWorkerFaultEvent {
  type: 'fault';
  exception: string | null;
  errors: string[];
}

export interface InterpreterWorkerReplyEvent<T = unknown> {
  type: 'reply';
  id: number;
  ok: boolean;
  payload?: T;
  error?: string;
}

export type InterpreterWorkerEvent =
  | InterpreterWorkerReadyEvent
  | InterpreterWorkerFrameEvent
  | InterpreterWorkerStoppedEvent
  | InterpreterWorkerFaultEvent
  | InterpreterWorkerReplyEvent;

export function serializeInt32Array(values: Int32Array): SerializedInt32Array {
  return Array.from(values);
}

export function deserializeInt32Array(values: ReadonlyArray<number>): Int32Array {
  return Int32Array.from(values);
}

export function serializeUint8Array(values: Uint8Array): SerializedUint8Array {
  return Array.from(values);
}

export function deserializeUint8Array(values: ReadonlyArray<number>): Uint8Array {
  return Uint8Array.from(values);
}

export function cloneTerminalFrameBufferSnapshot(
  frameBuffer: TerminalFrameBuffer
): WorkerTerminalFrameBufferSnapshot {
  const dirtyRows: number[] = [];
  for (let row = 0; row < frameBuffer.rows; row += 1) {
    if (frameBuffer.dirtyRowFlags[row] === 1) {
      dirtyRows.push(row);
    }
  }

  return {
    columns: frameBuffer.columns,
    rows: frameBuffer.rows,
    version: frameBuffer.version,
    geometryVersion: frameBuffer.geometryVersion,
    data: new Uint8Array(frameBuffer.data),
    dirtyRows,
  };
}

export function isInterpreterWorkerReplyEvent(
  event: InterpreterWorkerEvent
): event is InterpreterWorkerReplyEvent {
  return event.type === 'reply';
}

export function isInterpreterWorkerFrameEvent(
  event: InterpreterWorkerEvent
): event is InterpreterWorkerFrameEvent {
  return event.type === 'frame';
}
