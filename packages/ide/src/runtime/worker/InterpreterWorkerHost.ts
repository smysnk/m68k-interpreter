import {
  clearTerminalFrameBufferDirtyRows,
  Emulator,
  type RuntimeSyncVersions,
} from '@m68k/interpreter';
import {
  cloneTerminalFrameBufferSnapshot,
  serializeInt32Array,
  type InterpreterWorkerCommand,
  type InterpreterWorkerEvent,
  type InterpreterWorkerReplyEvent,
  type WorkerExecutionConfig,
  type WorkerFrameKind,
  type WorkerRuntimeMetricsSnapshot,
  type WorkerRuntimeSnapshot,
} from '@/runtime/worker/interpreterWorkerProtocol';
import { buildRuntimeFrameSyncPayload } from '@/runtime/runtimeFramePayload';
import {
  DEFAULT_FRAME_BUDGET_MS,
  DEFAULT_TERMINAL_FLUSH_INSTRUCTION_INTERVAL,
  runEmulationFrame,
} from '@/runtime/executionLoop';

type WorkerEventSink = (event: InterpreterWorkerEvent) => void;

const DESKTOP_PROFILE_ID = 0;
const LANDSCAPE_PROFILE_ID = 1;
const PORTRAIT_PROFILE_ID = 2;
const EXECUTION_MEMORY_SNAPSHOT_INTERVAL_MS = 200;
const EXECUTION_FRAME_HEARTBEAT_INTERVAL_MS = 100;
const EXECUTION_TERMINAL_FLUSH_INSTRUCTION_INTERVAL = Math.max(
  256,
  DEFAULT_TERMINAL_FLUSH_INSTRUCTION_INTERVAL
);

interface RuntimeGeometry {
  columns: number;
  rows: number;
}

interface WorkerExecutionState {
  delayMs: number;
  speedMultiplier: number;
  frameBudgetMs: number;
  publishMemoryDuringContinuousFrames: boolean;
  terminalFocusedContinuousFrames: boolean;
}

interface WorkerSnapshotOptions {
  includeMemoryMeta?: boolean;
  includeMemoryImage?: boolean;
  includeTerminalSnapshot?: boolean;
  includeTerminalFrameBuffer?: boolean;
  includeSymbols?: boolean;
  forceFullSections?: boolean;
  includeRegisters?: boolean;
  includeRuntimeState?: boolean;
  trimTerminalOutput?: boolean;
}

interface WorkerPublicationPlan {
  syncVersions: RuntimeSyncVersions;
  registersChanged: boolean;
  executionChanged: boolean;
  diagnosticsChanged: boolean;
  memoryChanged: boolean;
  terminalChanged: boolean;
  includeSymbols: boolean;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0xff, Math.round(value)));
}

function computeLayoutProfileId(columns: number, rows: number): number {
  if (columns >= 78 && rows >= 24) {
    return DESKTOP_PROFILE_ID;
  }

  if (columns >= 52 && rows >= 11) {
    return LANDSCAPE_PROFILE_ID;
  }

  return PORTRAIT_PROFILE_ID;
}

function createReplyEvent<T>(
  id: number,
  ok: boolean,
  payload?: T,
  error?: string
): InterpreterWorkerReplyEvent<T> {
  return ok ? { type: 'reply', id, ok, payload } : { type: 'reply', id, ok, error };
}

export class InterpreterWorkerHost {
  private emulator: Emulator | null = null;
  private lastLoadedSource = '';
  private geometry: RuntimeGeometry = { columns: 80, rows: 25 };
  private readySent = false;
  private executionState: WorkerExecutionState = {
    delayMs: 0,
    speedMultiplier: 1,
    frameBudgetMs: DEFAULT_FRAME_BUDGET_MS,
    publishMemoryDuringContinuousFrames: true,
    terminalFocusedContinuousFrames: false,
  };
  private executionLoopTimer: ReturnType<typeof setTimeout> | null = null;
  private executionLoopGeneration = 0;
  private executionLoopActive = false;
  private nextFrameBudgetOverrideMs: number | undefined;
  private lastExecutionMemorySnapshotAt = Number.NEGATIVE_INFINITY;
  private lastContinuousFrameHeartbeatAt = Number.NEGATIVE_INFINITY;
  private lastPublishedSyncVersions: RuntimeSyncVersions | null = null;
  private lastPublishedRuntimeStateSignature: string | null = null;
  private publishedSymbolsForCurrentProgram = false;

  constructor(private readonly emitEvent: WorkerEventSink) {}

  async handleCommand(command: InterpreterWorkerCommand): Promise<void> {
    try {
      switch (command.type) {
        case 'init':
          if (!this.readySent) {
            this.readySent = true;
            this.emitEvent({ type: 'ready' });
          }
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'dispose':
          this.stopExecutionLoop();
          this.emulator = null;
          this.lastLoadedSource = '';
          this.resetPublishedSnapshotState();
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'loadProgram':
          this.stopExecutionLoop();
          this.resetPublishedSnapshotState();
          this.lastLoadedSource = command.source;
          this.geometry = {
            columns: command.columns,
            rows: command.rows,
          };
          this.emulator = new Emulator(command.source, {
            columns: command.columns,
            rows: command.rows,
          });
          this.applyGeometryBridge();
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'loaded',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'run':
          this.configureExecution(command.config);
          this.startExecutionLoop();
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'resume':
          this.configureExecution(command.config);
          this.startExecutionLoop();
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'pause':
          this.stopExecutionLoop('paused');
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'step':
          this.stopExecutionLoop();
          this.executeManualStep();
          this.emitEvent(
            createReplyEvent(command.id, true, {
              halted: this.requireEmulator().isHalted(),
              waitingForInput: this.requireEmulator().isWaitingForInput(),
              exception: this.requireEmulator().getException() ?? null,
            })
          );
          return;
        case 'undo':
          this.stopExecutionLoop();
          this.requireEmulator().undoFromStack();
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'undo',
          });
          this.emitEvent({ type: 'stopped', reason: 'undo' });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'reset':
          this.stopExecutionLoop();
          if (this.emulator === null && this.lastLoadedSource.trim().length > 0) {
            this.emulator = new Emulator(this.lastLoadedSource, {
              columns: this.geometry.columns,
              rows: this.geometry.rows,
            });
          } else {
            this.requireEmulator().reset();
          }
          this.applyGeometryBridge();
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'reset',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'queueInput':
          this.requireEmulator().queueInput(command.input);
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'input_queued',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'clearInputQueue':
          this.requireEmulator().clearInputQueue();
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'input_cleared',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'raiseExternalInterrupt': {
          const accepted = this.requireEmulator().raiseExternalInterrupt(command.handlerAddress);
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: accepted ? 'interrupt_queued' : 'interrupt_rejected',
          });
          this.emitEvent(createReplyEvent(command.id, true, accepted));
          return;
        }
        case 'resizeTerminal':
          this.stopExecutionLoop();
          this.geometry = {
            columns: command.columns,
            rows: command.rows,
          };
          this.requireEmulator().resizeTerminal(command.columns, command.rows);
          this.applyGeometryBridge();
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'resized',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'writeMemoryByte':
          this.requireEmulator().writeMemoryByte(command.address, command.value);
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'memory_write',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'writeMemoryWord':
          this.requireEmulator().writeMemoryWord(command.address, command.value);
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'memory_write',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'writeMemoryLong':
          this.requireEmulator().writeMemoryLong(command.address, command.value);
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'memory_write',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'setRegisterValue': {
          const emulator = this.requireEmulator();
          const registers = emulator.getRegisters();
          if (command.register >= 0 && command.register < registers.length) {
            registers[command.register] = command.value | 0;
          }
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'register_write',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        }
        case 'dispatchTouchPacket': {
          const emulator = this.requireEmulator();
          emulator.writeMemoryByte(command.protocol.touchPending, command.packet.pending);
          emulator.writeMemoryByte(command.protocol.touchPhase, command.packet.phase);
          emulator.writeMemoryByte(command.protocol.touchRow, command.packet.row);
          emulator.writeMemoryByte(command.protocol.touchCol, command.packet.col);
          emulator.writeMemoryByte(command.protocol.touchFlags, command.packet.flags);
          const accepted = emulator.raiseExternalInterrupt(command.protocol.touchIsr);
          this.emitEvent(createReplyEvent(command.id, true, accepted));
          return;
        }
        case 'setUndoCaptureMode':
          this.requireEmulator().setUndoCaptureMode(
            command.mode,
            command.checkpointInterval as number | undefined
          );
          this.publishFrame({
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'undo_mode_updated',
          });
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'configureExecution':
          this.configureExecution(command.config);
          this.emitEvent(createReplyEvent(command.id, true));
          return;
        case 'pulseExecution': {
          const accepted = this.requestExecutionPulse(command.frameBudgetMs);
          this.emitEvent(createReplyEvent(command.id, true, accepted));
          return;
        }
        case 'requestSnapshot':
          this.emitEvent(
            createReplyEvent(
              command.id,
              true,
              this.buildSnapshot(undefined, {
                includeMemoryImage: true,
                includeTerminalFrameBuffer: true,
                includeSymbols: true,
                forceFullSections: true,
              })
            )
          );
          return;
        case 'readMemoryRange': {
          const bytes = this.requireEmulator().readMemoryRange(command.address, command.length);
          this.emitEvent(createReplyEvent(command.id, true, Array.from(bytes)));
          return;
        }
        case 'getSymbolAddress': {
          const address = this.requireEmulator().getSymbolAddress(command.symbol);
          this.emitEvent(createReplyEvent(command.id, true, address ?? null));
          return;
        }
        default:
          command satisfies never;
      }
    } catch (error) {
      const runtimeError = error instanceof Error ? error.message : String(error);
      const runtime = this.emulator;
      this.emitEvent({
        type: 'fault',
        exception: runtime?.getException() ?? runtimeError,
        errors: runtime ? [...runtime.getErrors()] : [runtimeError],
      });
      this.emitEvent(createReplyEvent(command.id, false, undefined, runtimeError));
    }
  }

  private requireEmulator(): Emulator {
    if (this.emulator === null) {
      throw new Error('Interpreter worker runtime is not initialized');
    }

    return this.emulator;
  }

  private configureExecution(config: WorkerExecutionConfig): void {
    this.executionState = {
      delayMs: Math.max(0, Math.round(config.delayMs)),
      speedMultiplier: Math.max(config.speedMultiplier, 0.25),
      frameBudgetMs:
        config.frameBudgetMs !== undefined
          ? Math.max(1, Math.round(config.frameBudgetMs))
          : this.executionState.frameBudgetMs,
      publishMemoryDuringContinuousFrames:
        config.publishMemoryDuringContinuousFrames ??
        this.executionState.publishMemoryDuringContinuousFrames,
      terminalFocusedContinuousFrames:
        config.terminalFocusedContinuousFrames ??
        this.executionState.terminalFocusedContinuousFrames,
    };
  }

  private publishFrame(
    runtimeMetrics?: WorkerRuntimeMetricsSnapshot,
    snapshotOptions?: WorkerSnapshotOptions,
    frameKind: WorkerFrameKind = 'full'
  ): void {
    const runtime = this.requireEmulator();
    const publicationPlan = this.createPublicationPlan(snapshotOptions);
    const snapshot = this.buildSnapshot(runtimeMetrics, snapshotOptions, publicationPlan);
    this.emitEvent({
      type: 'frame',
      kind: frameKind,
      frame: buildRuntimeFrameSyncPayload({
        rawRegisters: snapshot.rawRegisters ?? runtime.getRegisters(),
        pc: snapshot.pc ?? runtime.getPC(),
        ccr: snapshot.ccr ?? runtime.getCCR(),
        sr: snapshot.sr ?? runtime.getSR(),
        usp: snapshot.usp ?? runtime.getUSP(),
        ssp: snapshot.ssp ?? runtime.getSSP(),
        memory: snapshot.memoryMeta,
        terminal: snapshot.terminalMeta,
        lastInstruction: snapshot.lastInstruction ?? runtime.getLastInstruction(),
        errors: snapshot.errors ?? [...runtime.getErrors()],
        exception: snapshot.exception ?? runtime.getException() ?? null,
        halted: snapshot.halted ?? runtime.isHalted(),
        waitingForInput: snapshot.waitingForInput ?? runtime.isWaitingForInput(),
        runtimeMetrics: snapshot.runtimeMetrics,
        includeRegisters:
          frameKind === 'full' &&
          (snapshotOptions?.forceFullSections === true || publicationPlan.registersChanged),
        includeFlags:
          frameKind === 'full' &&
          (snapshotOptions?.forceFullSections === true || publicationPlan.registersChanged),
        includeExecutionState:
          frameKind === 'full' &&
          (snapshotOptions?.forceFullSections === true ||
            publicationPlan.executionChanged ||
            publicationPlan.diagnosticsChanged),
      }),
      snapshot,
    });
    this.lastPublishedSyncVersions = { ...publicationPlan.syncVersions };
    this.lastPublishedRuntimeStateSignature = this.buildRuntimeStateSignature(runtime);
    this.lastContinuousFrameHeartbeatAt = this.getNow();
    this.publishedSymbolsForCurrentProgram ||= publicationPlan.includeSymbols;
  }

  private buildSnapshot(
    runtimeMetrics?: WorkerRuntimeMetricsSnapshot,
    snapshotOptions: WorkerSnapshotOptions = {},
    publicationPlan?: WorkerPublicationPlan
  ): WorkerRuntimeSnapshot {
    const runtime = this.requireEmulator();
    const {
      includeMemoryMeta = true,
      includeMemoryImage = true,
      includeTerminalSnapshot = false,
      includeTerminalFrameBuffer = true,
      includeSymbols = false,
      forceFullSections = false,
      includeRegisters = true,
      includeRuntimeState = true,
      trimTerminalOutput = false,
    } = snapshotOptions;
    const plan =
      publicationPlan ??
      this.createPublicationPlan({
        includeSymbols,
        forceFullSections,
      });
    const shouldIncludeTerminalFrameBuffer =
      includeTerminalFrameBuffer && (plan.terminalChanged || forceFullSections);
    const terminalFrameBuffer = runtime.getTerminalFrameBuffer();
    const terminalFrameBufferSnapshot = shouldIncludeTerminalFrameBuffer
      ? cloneTerminalFrameBufferSnapshot(terminalFrameBuffer)
      : undefined;

    if (terminalFrameBufferSnapshot) {
      clearTerminalFrameBufferDirtyRows(terminalFrameBuffer);
    }

    const terminalMeta =
      plan.terminalChanged || forceFullSections ? runtime.getTerminalMeta() : undefined;

    return {
      rawRegisters: includeRegisters ? serializeInt32Array(runtime.getRegisters()) : undefined,
      pc: includeRegisters ? runtime.getPC() : undefined,
      ccr: includeRegisters ? runtime.getCCR() : undefined,
      sr: includeRegisters ? runtime.getSR() : undefined,
      usp: includeRegisters ? runtime.getUSP() : undefined,
      ssp: includeRegisters ? runtime.getSSP() : undefined,
      memoryMeta:
        includeMemoryMeta && (plan.memoryChanged || forceFullSections)
          ? runtime.getMemoryMeta()
          : undefined,
      memoryImage:
        includeMemoryImage && (plan.memoryChanged || forceFullSections)
          ? runtime.getMemory()
          : undefined,
      terminalMeta:
        terminalMeta === undefined
          ? undefined
          : trimTerminalOutput
            ? { ...terminalMeta, output: '' }
            : terminalMeta,
      terminalSnapshot: includeTerminalSnapshot ? runtime.getTerminalSnapshot() : undefined,
      terminalFrameBuffer:
        plan.terminalChanged || forceFullSections ? terminalFrameBufferSnapshot : undefined,
      lastInstruction: includeRuntimeState ? runtime.getLastInstruction() : undefined,
      errors: includeRuntimeState ? [...runtime.getErrors()] : undefined,
      exception: includeRuntimeState ? runtime.getException() ?? null : undefined,
      queuedInputLength: includeRuntimeState ? runtime.getQueuedInputLength() : undefined,
      halted: includeRuntimeState ? runtime.isHalted() : undefined,
      waitingForInput: includeRuntimeState ? runtime.isWaitingForInput() : undefined,
      symbols: plan.includeSymbols ? runtime.getSymbols() : undefined,
      syncVersions: plan.syncVersions,
      runtimeMetrics,
    };
  }

  private createPublicationPlan(
    snapshotOptions: WorkerSnapshotOptions = {}
  ): WorkerPublicationPlan {
    const runtime = this.requireEmulator();
    const syncVersions = runtime.getRuntimeSyncVersions();
    const previousSyncVersions = snapshotOptions.forceFullSections
      ? null
      : this.lastPublishedSyncVersions;

    return {
      syncVersions,
      registersChanged:
        previousSyncVersions === null || previousSyncVersions.registers !== syncVersions.registers,
      executionChanged:
        previousSyncVersions === null || previousSyncVersions.execution !== syncVersions.execution,
      diagnosticsChanged:
        previousSyncVersions === null ||
        previousSyncVersions.diagnostics !== syncVersions.diagnostics,
      memoryChanged:
        previousSyncVersions === null || previousSyncVersions.memory !== syncVersions.memory,
      terminalChanged:
        previousSyncVersions === null ||
        previousSyncVersions.terminal !== syncVersions.terminal ||
        previousSyncVersions.terminalGeometry !== syncVersions.terminalGeometry,
      includeSymbols:
        snapshotOptions.includeSymbols === true || !this.publishedSymbolsForCurrentProgram,
    };
  }

  private resetPublishedSnapshotState(): void {
    this.lastPublishedSyncVersions = null;
    this.lastPublishedRuntimeStateSignature = null;
    this.lastContinuousFrameHeartbeatAt = Number.NEGATIVE_INFINITY;
    this.publishedSymbolsForCurrentProgram = false;
  }

  private buildRuntimeStateSignature(runtime: Emulator): string {
    return [
      runtime.isHalted() ? 1 : 0,
      runtime.isWaitingForInput() ? 1 : 0,
      runtime.getQueuedInputLength(),
      runtime.getException() ?? '',
    ].join(':');
  }

  private determineContinuousFrameKind(plan: WorkerPublicationPlan): WorkerFrameKind | null {
    const runtime = this.requireEmulator();
    const runtimeStateChanged =
      this.lastPublishedRuntimeStateSignature !== this.buildRuntimeStateSignature(runtime);

    if (runtimeStateChanged) {
      return 'full';
    }

    if (plan.terminalChanged) {
      return this.executionState.terminalFocusedContinuousFrames ? 'terminal' : 'full';
    }

    if (
      !this.executionState.terminalFocusedContinuousFrames &&
      (plan.registersChanged || plan.executionChanged || plan.diagnosticsChanged || plan.memoryChanged)
    ) {
      return 'full';
    }

    if (this.getNow() - this.lastContinuousFrameHeartbeatAt >= EXECUTION_FRAME_HEARTBEAT_INTERVAL_MS) {
      return 'heartbeat';
    }

    return null;
  }

  private shouldPublishExecutionMemorySections(stopReason: string): boolean {
    const now = this.getNow();
    const isContinuousFrame =
      stopReason === 'frame_budget' ||
      stopReason === 'instruction_budget' ||
      stopReason === 'terminal_changed';

    if (!isContinuousFrame) {
      this.lastExecutionMemorySnapshotAt = now;
      return true;
    }

    if (!this.executionState.publishMemoryDuringContinuousFrames) {
      return false;
    }

    if (now - this.lastExecutionMemorySnapshotAt >= EXECUTION_MEMORY_SNAPSHOT_INTERVAL_MS) {
      this.lastExecutionMemorySnapshotAt = now;
      return true;
    }

    return false;
  }

  private executeManualStep(): void {
    const emulator = this.requireEmulator();
    const startedAt = this.getNow();
    const finished = emulator.emulationStep();
    const hasException = Boolean(emulator.getException());
    const halted = emulator.isHalted() || finished;
    const waitingForInput = emulator.isWaitingForInput();
    const stopReason = waitingForInput
      ? 'waiting_for_input'
      : hasException
          ? 'exception'
          : halted
            ? 'halted'
          : 'manual_step';

    this.publishFrame({
      lastFrameInstructions: 1,
      lastFrameDurationMs: this.getNow() - startedAt,
      lastStopReason: stopReason,
    });
    this.emitEvent({ type: 'stopped', reason: stopReason });
  }

  private startExecutionLoop(): void {
    this.stopExecutionLoop();
    this.executionLoopActive = true;
    this.executionLoopGeneration += 1;
    this.lastExecutionMemorySnapshotAt = Number.NEGATIVE_INFINITY;
    this.lastContinuousFrameHeartbeatAt = this.getNow();
    this.scheduleNextExecutionFrame(this.executionLoopGeneration, 0);
  }

  private stopExecutionLoop(reason?: string): void {
    this.executionLoopActive = false;
    this.executionLoopGeneration += 1;
    this.nextFrameBudgetOverrideMs = undefined;
    if (this.executionLoopTimer !== null) {
      clearTimeout(this.executionLoopTimer);
      this.executionLoopTimer = null;
    }

    if (reason) {
      this.emitEvent({ type: 'stopped', reason });
    }
  }

  private scheduleNextExecutionFrame(generation: number, delayMs: number): void {
    this.executionLoopTimer = setTimeout(() => {
      this.executionLoopTimer = null;
      void this.executeExecutionFrame(generation);
    }, Math.max(0, delayMs));
  }

  private async executeExecutionFrame(generation: number): Promise<void> {
    if (!this.executionLoopActive || generation !== this.executionLoopGeneration) {
      return;
    }

    const frameBudgetMs = this.nextFrameBudgetOverrideMs ?? this.executionState.frameBudgetMs;
    this.nextFrameBudgetOverrideMs = undefined;
    const emulator = this.requireEmulator();
    const frameResult = runEmulationFrame(emulator, {
      frameBudgetMs,
      speedMultiplier: this.executionState.speedMultiplier,
      flushOnTerminalChange: true,
      terminalFlushInstructionInterval: EXECUTION_TERMINAL_FLUSH_INSTRUCTION_INTERVAL,
      now: () => this.getNow(),
    });
    const includeExecutionMemorySections = this.shouldPublishExecutionMemorySections(
      frameResult.stopReason
    );
    const publicationPlan = this.createPublicationPlan();
    const isContinuousFrame =
      frameResult.stopReason === 'frame_budget' ||
      frameResult.stopReason === 'instruction_budget' ||
      frameResult.stopReason === 'terminal_changed';
    const frameKind = isContinuousFrame
      ? this.determineContinuousFrameKind(publicationPlan)
      : 'full';

    if (frameKind !== null) {
      this.publishFrame(
        {
          lastFrameInstructions: frameResult.instructionsExecuted,
          lastFrameDurationMs: frameResult.frameDurationMs,
          lastStopReason: frameResult.stopReason,
        },
        {
          includeMemoryMeta: includeExecutionMemorySections,
          includeMemoryImage: includeExecutionMemorySections,
          includeTerminalFrameBuffer: frameKind !== 'heartbeat',
          includeRegisters: frameKind === 'full',
          includeRuntimeState: frameKind === 'full',
          trimTerminalOutput:
            frameKind === 'terminal' && this.executionState.terminalFocusedContinuousFrames,
        },
        frameKind
      );
    }

    if (!this.executionLoopActive || generation !== this.executionLoopGeneration) {
      return;
    }

    if (frameResult.shouldContinue) {
      this.scheduleNextExecutionFrame(generation, this.executionState.delayMs);
      return;
    }

    this.executionLoopActive = false;
    this.emitEvent({ type: 'stopped', reason: frameResult.stopReason });
  }

  private requestExecutionPulse(frameBudgetMs?: number): boolean {
    if (!this.executionLoopActive) {
      return false;
    }

    this.nextFrameBudgetOverrideMs =
      frameBudgetMs !== undefined
        ? Math.max(1, Math.round(frameBudgetMs))
        : this.executionState.frameBudgetMs;

    if (this.executionLoopTimer !== null) {
      clearTimeout(this.executionLoopTimer);
      this.executionLoopTimer = null;
    }

    this.scheduleNextExecutionFrame(this.executionLoopGeneration, 0);
    return true;
  }

  private getNow(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }

    return Date.now();
  }

  private applyGeometryBridge(): void {
    const runtime = this.emulator;
    if (!runtime) {
      return;
    }

    const termCols = runtime.getSymbolAddress('TERM_COLS');
    const termRows = runtime.getSymbolAddress('TERM_ROWS');
    const layoutProfile = runtime.getSymbolAddress('LAYOUT_PROFILE');

    if (termCols === undefined || termRows === undefined || layoutProfile === undefined) {
      return;
    }

    runtime.writeMemoryByte(termCols, clampByte(this.geometry.columns));
    runtime.writeMemoryByte(termRows, clampByte(this.geometry.rows));
    runtime.writeMemoryByte(
      layoutProfile,
      computeLayoutProfileId(this.geometry.columns, this.geometry.rows)
    );
  }
}
