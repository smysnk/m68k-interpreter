import {
  createTerminalFrameBuffer,
  encodeTerminalByte,
  readTerminalFrameBufferCell,
  readTerminalFrameBufferLine,
  readTerminalFrameBufferText,
  resetTerminalFrameBuffer,
  resizeTerminalFrameBuffer,
  TERMINAL_BUFFER_COLOR_DEFAULT,
  TERMINAL_BUFFER_FLAG_BOLD,
  TERMINAL_BUFFER_FLAG_INVERSE,
  type MemoryMeta,
  type RuntimeSyncVersions,
  type TerminalFrameBuffer,
  type TerminalMeta,
  type TerminalSnapshot,
  type UndoCaptureMode,
} from '@m68k/interpreter';
import type { IdeRuntimeCachedReadApi, IdeRuntimeController } from '@/runtime/ideRuntimeSession';
import {
  deserializeInt32Array,
  deserializeUint8Array,
  isInterpreterWorkerFrameEvent,
  isInterpreterWorkerReplyEvent,
  type InterpreterWorkerCommand,
  type InterpreterWorkerEvent,
  type WorkerTerminalFrameBufferSnapshot,
  type WorkerExecutionConfig,
  type WorkerStepResult,
  type WorkerRuntimeSnapshot,
} from '@/runtime/worker/interpreterWorkerProtocol';
import {
  recordWorkerCommandSent,
  recordWorkerEventReceived,
} from '@/runtime/idePerformanceTelemetry';
import type {
  TerminalTouchPacket,
  TerminalTouchProtocolSymbols,
} from '@/runtime/terminalTouchProtocol';

interface WorkerMessageEventLike<T> {
  data: T;
}

export interface InterpreterWorkerLike {
  addEventListener(
    type: 'message',
    listener: (event: WorkerMessageEventLike<InterpreterWorkerEvent>) => void
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: WorkerMessageEventLike<InterpreterWorkerEvent>) => void
  ): void;
  postMessage(message: InterpreterWorkerCommand): void;
  terminate(): void;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

type InterpreterWorkerCommandInput = InterpreterWorkerCommand extends infer T
  ? T extends { id: number }
    ? Omit<T, 'id'>
    : never
  : never;

interface WorkerClientCache {
  rawRegisters: Int32Array;
  pc: number;
  ccr: number;
  sr: number;
  usp: number;
  ssp: number;
  memoryMeta: MemoryMeta;
  memoryImage: Record<number, number>;
  terminalMeta: TerminalMeta;
  terminalFrameBuffer: TerminalFrameBuffer;
  lastInstruction: string;
  errors: string[];
  exception?: string;
  queuedInputLength: number;
  halted: boolean;
  waitingForInput: boolean;
  symbols: Record<string, number>;
  syncVersions?: RuntimeSyncVersions;
}

type InterpreterWorkerClientEvent = Exclude<InterpreterWorkerEvent, { type: 'ready' } | { type: 'reply' }>;

function createTerminalMeta(
  columns = 80,
  rows = 25,
  overrides: Partial<TerminalMeta> = {}
): TerminalMeta {
  return {
    columns,
    rows,
    cursorRow: 0,
    cursorColumn: 0,
    output: '',
    version: 1,
    geometryVersion: 1,
    ...overrides,
  };
}

function createEmptyMemoryMeta(): MemoryMeta {
  return {
    usedBytes: 0,
    minAddress: null,
    maxAddress: null,
    version: 1,
  };
}

function createEmptyWorkerClientCache(): WorkerClientCache {
  const terminalFrameBuffer = createTerminalFrameBuffer();

  return {
    rawRegisters: new Int32Array(16),
    pc: 0,
    ccr: 0,
    sr: 0,
    usp: 0,
    ssp: 0,
    memoryMeta: createEmptyMemoryMeta(),
    memoryImage: {},
    terminalMeta: createTerminalMeta(terminalFrameBuffer.columns, terminalFrameBuffer.rows),
    terminalFrameBuffer,
    lastInstruction: 'Ready',
    errors: [],
    exception: undefined,
    queuedInputLength: 0,
    halted: false,
    waitingForInput: false,
    symbols: {},
    syncVersions: undefined,
  };
}

function copyTerminalSnapshotIntoFrameBuffer(
  frameBuffer: TerminalFrameBuffer,
  snapshot: TerminalSnapshot
): TerminalFrameBuffer {
  if (frameBuffer.columns !== snapshot.columns || frameBuffer.rows !== snapshot.rows) {
    resizeTerminalFrameBuffer(frameBuffer, snapshot.columns, snapshot.rows);
  } else {
    resetTerminalFrameBuffer(frameBuffer);
  }

  for (let row = 0; row < snapshot.rows; row += 1) {
    const line = snapshot.lines[row] ?? '';
    const cells = snapshot.cells[row] ?? [];

    for (let column = 0; column < snapshot.columns; column += 1) {
      const offset = row * snapshot.columns + column;
      const cell = cells[column];
      frameBuffer.charBytes[offset] = encodeTerminalByte(cell?.char ?? line[column]);
      frameBuffer.foregroundBytes[offset] =
        cell?.foreground === null || cell?.foreground === undefined
          ? TERMINAL_BUFFER_COLOR_DEFAULT
          : cell.foreground & 0xff;
      frameBuffer.backgroundBytes[offset] =
        cell?.background === null || cell?.background === undefined
          ? TERMINAL_BUFFER_COLOR_DEFAULT
          : cell.background & 0xff;

      let flags = 0;
      if (cell?.bold) {
        flags |= TERMINAL_BUFFER_FLAG_BOLD;
      }
      if (cell?.inverse) {
        flags |= TERMINAL_BUFFER_FLAG_INVERSE;
      }
      frameBuffer.flagBytes[offset] = flags;
    }

    frameBuffer.dirtyRowFlags[row] = 1;
  }

  frameBuffer.version += 1;
  return frameBuffer;
}

function copyFrameBufferSnapshotIntoFrameBuffer(
  frameBuffer: TerminalFrameBuffer,
  snapshot: WorkerTerminalFrameBufferSnapshot
): TerminalFrameBuffer {
  if (frameBuffer.columns !== snapshot.columns || frameBuffer.rows !== snapshot.rows) {
    resizeTerminalFrameBuffer(frameBuffer, snapshot.columns, snapshot.rows);
  }

  if (frameBuffer.data.length !== snapshot.data.length) {
    resizeTerminalFrameBuffer(frameBuffer, snapshot.columns, snapshot.rows);
  }

  frameBuffer.data.set(snapshot.data);
  frameBuffer.version = snapshot.version;
  frameBuffer.geometryVersion = snapshot.geometryVersion;
  frameBuffer.dirtyRowFlags.fill(0);
  for (const row of snapshot.dirtyRows) {
    if (row >= 0 && row < frameBuffer.rows) {
      frameBuffer.dirtyRowFlags[row] = 1;
    }
  }
  return frameBuffer;
}

function buildTerminalSnapshotFromFrameBuffer(
  frameBuffer: TerminalFrameBuffer,
  meta: TerminalMeta
): TerminalSnapshot {
  return {
    columns: meta.columns,
    rows: meta.rows,
    cursorRow: meta.cursorRow,
    cursorColumn: meta.cursorColumn,
    output: meta.output,
    lines: Array.from({ length: meta.rows }, (_, row) =>
      readTerminalFrameBufferLine(frameBuffer, row)
    ),
    cells: Array.from({ length: meta.rows }, (_, row) =>
      Array.from({ length: meta.columns }, (_, column) => {
        const cell = readTerminalFrameBufferCell(frameBuffer, row, column);
        return {
          char: cell.char,
          foreground: cell.foreground,
          background: cell.background,
          bold: cell.bold,
          inverse: cell.inverse,
        };
      })
    ),
  };
}

function readMemoryRangeFromCache(
  memoryImage: Record<number, number>,
  address: number,
  length: number
): Uint8Array {
  if (length <= 0) {
    return new Uint8Array(0);
  }

  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = memoryImage[address + index] ?? 0;
  }
  return bytes;
}

export class InterpreterWorkerClient implements IdeRuntimeCachedReadApi, IdeRuntimeController {
  private readonly pendingCommands = new Map<number, PendingCommand>();
  private readonly eventListeners = new Set<(event: InterpreterWorkerClientEvent) => void>();
  private readonly cache = createEmptyWorkerClientCache();
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private nextCommandId = 1;
  private disposed = false;

  constructor(private readonly worker: InterpreterWorkerLike) {
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    this.worker.addEventListener('message', this.handleMessage);
  }

  getRuntimeTransport(): 'worker' {
    return 'worker';
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async initialize(): Promise<void> {
    await Promise.all([this.postCommand<void>({ type: 'init' }), this.whenReady()]);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    recordWorkerCommandSent();
    this.worker.postMessage({
      id: this.nextCommandId,
      type: 'dispose',
    });
    this.nextCommandId += 1;

    this.worker.removeEventListener('message', this.handleMessage);
    this.rejectPendingCommands(new Error('Interpreter worker client disposed'));
    this.worker.terminate();
  }

  requestLoadProgram(source: string, columns: number, rows: number): Promise<void> {
    return this.postCommand<void>({ type: 'loadProgram', source, columns, rows });
  }

  requestRun(config?: WorkerExecutionConfig): Promise<void> {
    return this.postCommand<void>({
      type: 'run',
      config: config ?? { delayMs: 0, speedMultiplier: 1 },
    });
  }

  requestResume(config?: WorkerExecutionConfig): Promise<void> {
    return this.postCommand<void>({
      type: 'resume',
      config: config ?? { delayMs: 0, speedMultiplier: 1 },
    });
  }

  requestPause(): Promise<void> {
    return this.postCommand<void>({ type: 'pause' });
  }

  requestStep(): Promise<WorkerStepResult | undefined> {
    return this.postCommand<WorkerStepResult>({ type: 'step' });
  }

  requestUndo(): Promise<void> {
    return this.postCommand<void>({ type: 'undo' });
  }

  requestReset(): Promise<void> {
    return this.postCommand<void>({ type: 'reset' });
  }

  requestQueueInput(input: string | number | number[]): Promise<void> {
    return this.postCommand<void>({ type: 'queueInput', input });
  }

  requestClearInputQueue(): Promise<void> {
    return this.postCommand<void>({ type: 'clearInputQueue' });
  }

  async requestRaiseExternalInterrupt(handlerAddress: number): Promise<boolean> {
    const payload = await this.postCommand<boolean>({
      type: 'raiseExternalInterrupt',
      handlerAddress,
    });
    return payload ?? false;
  }

  requestResizeTerminal(columns: number, rows: number): Promise<void> {
    return this.postCommand<void>({ type: 'resizeTerminal', columns, rows });
  }

  requestWriteMemoryByte(address: number, value: number): Promise<void> {
    return this.postCommand<void>({ type: 'writeMemoryByte', address, value });
  }

  requestWriteMemoryWord(address: number, value: number): Promise<void> {
    return this.postCommand<void>({ type: 'writeMemoryWord', address, value });
  }

  requestWriteMemoryLong(address: number, value: number): Promise<void> {
    return this.postCommand<void>({ type: 'writeMemoryLong', address, value });
  }

  requestSetRegisterValue(register: number, value: number): Promise<void> {
    return this.postCommand<void>({ type: 'setRegisterValue', register, value });
  }

  async requestDispatchTouchPacket(
    protocol: TerminalTouchProtocolSymbols,
    packet: TerminalTouchPacket
  ): Promise<boolean> {
    const payload = await this.postCommand<boolean>({
      type: 'dispatchTouchPacket',
      protocol,
      packet,
    });
    return payload ?? false;
  }

  requestSetUndoCaptureMode(mode: UndoCaptureMode, checkpointInterval?: number): Promise<void> {
    return this.postCommand<void>({
      type: 'setUndoCaptureMode',
      mode,
      checkpointInterval,
    });
  }

  requestConfigureExecution(config: WorkerExecutionConfig): Promise<void> {
    return this.postCommand<void>({
      type: 'configureExecution',
      config,
    });
  }

  async requestPulseExecution(frameBudgetMs?: number): Promise<boolean> {
    const payload = await this.postCommand<boolean>({
      type: 'pulseExecution',
      frameBudgetMs,
    });
    return payload ?? false;
  }

  async requestSnapshot(): Promise<void> {
    const snapshot = await this.postCommand<WorkerRuntimeSnapshot>({ type: 'requestSnapshot' });
    if (snapshot) {
      this.applySnapshot(snapshot);
    }
  }

  async requestReadMemoryRange(address: number, length: number): Promise<Uint8Array> {
    const payload = await this.postCommand<number[]>({
      type: 'readMemoryRange',
      address,
      length,
    });
    return deserializeUint8Array(payload ?? []);
  }

  async requestSymbolAddress(symbol: string): Promise<number | undefined> {
    const payload = await this.postCommand<number | null>({ type: 'getSymbolAddress', symbol });
    return payload === null || payload === undefined ? undefined : payload;
  }

  getCFlag(): number {
    return this.cache.ccr & 0x1;
  }

  getCCR(): number {
    return this.cache.ccr;
  }

  getErrors(): string[] {
    return [...this.cache.errors];
  }

  getException(): string | undefined {
    return this.cache.exception;
  }

  getLastInstruction(): string {
    return this.cache.lastInstruction;
  }

  getMemory(): Record<number, number> {
    return { ...this.cache.memoryImage };
  }

  getMemoryMeta(): MemoryMeta {
    return { ...this.cache.memoryMeta };
  }

  getNFlag(): number {
    return (this.cache.ccr >>> 3) & 0x1;
  }

  getPC(): number {
    return this.cache.pc;
  }

  getQueuedInputLength(): number {
    return this.cache.queuedInputLength;
  }

  getRegisters(): Int32Array {
    return Int32Array.from(this.cache.rawRegisters);
  }

  getSR(): number {
    return this.cache.sr;
  }

  getSSP(): number {
    return this.cache.ssp;
  }

  readMemoryRange(address: number, length: number): Uint8Array {
    return readMemoryRangeFromCache(this.cache.memoryImage, address, length);
  }

  getSymbolAddress(symbol: string): number | undefined {
    return this.cache.symbols[symbol];
  }

  getSymbols(): Record<string, number> {
    return { ...this.cache.symbols };
  }

  getTerminalFrameBuffer(): TerminalFrameBuffer {
    return this.cache.terminalFrameBuffer;
  }

  getTerminalLines(): string[] {
    return Array.from({ length: this.cache.terminalMeta.rows }, (_, row) =>
      readTerminalFrameBufferLine(this.cache.terminalFrameBuffer, row)
    );
  }

  getTerminalMeta(): TerminalMeta {
    return { ...this.cache.terminalMeta };
  }

  getTerminalText(): string {
    return readTerminalFrameBufferText(this.cache.terminalFrameBuffer);
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return buildTerminalSnapshotFromFrameBuffer(
      this.cache.terminalFrameBuffer,
      this.cache.terminalMeta
    );
  }

  getUSP(): number {
    return this.cache.usp;
  }

  getVFlag(): number {
    return (this.cache.ccr >>> 1) & 0x1;
  }

  getXFlag(): number {
    return (this.cache.ccr >>> 4) & 0x1;
  }

  getZFlag(): number {
    return (this.cache.ccr >>> 2) & 0x1;
  }

  isHalted(): boolean {
    return this.cache.halted;
  }

  isWaitingForInput(): boolean {
    return this.cache.waitingForInput;
  }

  getRuntimeSyncVersions(): RuntimeSyncVersions | undefined {
    return this.cache.syncVersions ? { ...this.cache.syncVersions } : undefined;
  }

  subscribeEvents(
    listener: (event: InterpreterWorkerClientEvent) => void
  ): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private readonly handleMessage = (
    event: WorkerMessageEventLike<InterpreterWorkerEvent>
  ): void => {
    const payload = event.data;

    if (payload.type === 'ready') {
      recordWorkerEventReceived({ type: 'ready' });
      this.resolveReady();
      return;
    }

    if (isInterpreterWorkerFrameEvent(payload)) {
      recordWorkerEventReceived({
        type: 'frame',
        includesMemoryImage: payload.snapshot.memoryImage !== undefined,
        includesTerminalFrameBuffer: payload.snapshot.terminalFrameBuffer !== undefined,
        includesTerminalSnapshot: payload.snapshot.terminalSnapshot !== undefined,
      });
      this.applySnapshot(payload.snapshot);
      this.emitRuntimeEvent(payload);
      return;
    }

    if (payload.type === 'fault') {
      recordWorkerEventReceived({ type: 'fault' });
      this.cache.exception = payload.exception ?? undefined;
      this.cache.errors = [...payload.errors];
      this.emitRuntimeEvent(payload);
      return;
    }

    if (payload.type === 'stopped') {
      recordWorkerEventReceived({ type: 'stopped' });
      this.emitRuntimeEvent(payload);
      return;
    }

    if (!isInterpreterWorkerReplyEvent(payload)) {
      return;
    }

    recordWorkerEventReceived({ type: 'reply' });

    const pendingCommand = this.pendingCommands.get(payload.id);
    if (!pendingCommand) {
      return;
    }

    this.pendingCommands.delete(payload.id);

    if (!payload.ok) {
      pendingCommand.reject(new Error(payload.error ?? 'Worker command failed'));
      return;
    }

    pendingCommand.resolve(payload.payload);
  };

  private applySnapshot(snapshot: WorkerRuntimeSnapshot): void {
    if (snapshot.rawRegisters) {
      this.cache.rawRegisters = deserializeInt32Array(snapshot.rawRegisters);
    }
    if (snapshot.pc !== undefined) {
      this.cache.pc = snapshot.pc;
    }
    if (snapshot.ccr !== undefined) {
      this.cache.ccr = snapshot.ccr;
    }
    if (snapshot.sr !== undefined) {
      this.cache.sr = snapshot.sr;
    }
    if (snapshot.usp !== undefined) {
      this.cache.usp = snapshot.usp;
    }
    if (snapshot.ssp !== undefined) {
      this.cache.ssp = snapshot.ssp;
    }
    if (snapshot.memoryMeta) {
      this.cache.memoryMeta = { ...snapshot.memoryMeta };
    }
    if (snapshot.memoryImage) {
      this.cache.memoryImage = { ...snapshot.memoryImage };
    }
    const nextTerminalMeta = snapshot.terminalMeta
      ? { ...snapshot.terminalMeta }
      : this.cache.terminalMeta;
    this.cache.terminalMeta = nextTerminalMeta;
    if (snapshot.terminalFrameBuffer) {
      copyFrameBufferSnapshotIntoFrameBuffer(
        this.cache.terminalFrameBuffer,
        snapshot.terminalFrameBuffer
      );
    } else if (snapshot.terminalSnapshot) {
      copyTerminalSnapshotIntoFrameBuffer(this.cache.terminalFrameBuffer, snapshot.terminalSnapshot);
    } else if (
      this.cache.terminalFrameBuffer.columns !== nextTerminalMeta.columns ||
      this.cache.terminalFrameBuffer.rows !== nextTerminalMeta.rows
    ) {
      resetTerminalFrameBuffer(this.cache.terminalFrameBuffer);
      resizeTerminalFrameBuffer(
        this.cache.terminalFrameBuffer,
        nextTerminalMeta.columns,
        nextTerminalMeta.rows
      );
    }
    if (snapshot.lastInstruction !== undefined) {
      this.cache.lastInstruction = snapshot.lastInstruction;
    }
    if (snapshot.errors !== undefined) {
      this.cache.errors = [...snapshot.errors];
    }
    if (snapshot.exception !== undefined) {
      this.cache.exception = snapshot.exception ?? undefined;
    }
    if (snapshot.queuedInputLength !== undefined) {
      this.cache.queuedInputLength = snapshot.queuedInputLength;
    }
    if (snapshot.halted !== undefined) {
      this.cache.halted = snapshot.halted;
    }
    if (snapshot.waitingForInput !== undefined) {
      this.cache.waitingForInput = snapshot.waitingForInput;
    }
    if (snapshot.symbols) {
      this.cache.symbols = { ...snapshot.symbols };
    }
    if (snapshot.syncVersions) {
      this.cache.syncVersions = { ...snapshot.syncVersions };
    }
  }

  private postCommand<T>(command: InterpreterWorkerCommandInput): Promise<T | undefined> {
    if (this.disposed) {
      return Promise.reject(new Error('Interpreter worker client disposed'));
    }

    const id = this.nextCommandId;
    this.nextCommandId += 1;

    return new Promise<T | undefined>((resolve, reject) => {
      this.pendingCommands.set(id, {
        resolve: (value) => resolve(value as T | undefined),
        reject,
      });
      recordWorkerCommandSent();
      this.worker.postMessage({ id, ...command } as InterpreterWorkerCommand);
    });
  }

  private rejectPendingCommands(error: Error): void {
    for (const pendingCommand of this.pendingCommands.values()) {
      pendingCommand.reject(error);
    }

    this.pendingCommands.clear();
  }

  private emitRuntimeEvent(event: InterpreterWorkerClientEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}
