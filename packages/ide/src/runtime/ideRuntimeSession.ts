import type {
  Emulator,
  RuntimeSyncVersions,
  TerminalFrameBuffer,
  TerminalMeta,
  TerminalSnapshot,
  UndoCaptureMode,
} from '@m68k/interpreter';
import type {
  InterpreterWorkerEvent,
  WorkerExecutionConfig,
  WorkerStepResult,
} from '@/runtime/worker/interpreterWorkerProtocol';
import type {
  TerminalTouchPacket,
  TerminalTouchProtocolSymbols,
} from '@/runtime/terminalTouchProtocol';

export type IdeRuntimeTransport = 'in-process' | 'worker';

export interface IdeRuntimeCachedReadApi {
  getCFlag(): number;
  getCCR(): number;
  getErrors(): string[];
  getException(): string | undefined;
  getLastInstruction(): string;
  getMemory(): Record<number, number>;
  getMemoryMeta(): ReturnType<Emulator['getMemoryMeta']>;
  getNFlag(): number;
  getPC(): number;
  getQueuedInputLength(): number;
  getRegisters(): Int32Array;
  getSR(): number;
  getSSP(): number;
  readMemoryRange(address: number, length: number): Uint8Array;
  getSymbolAddress(symbol: string): number | undefined;
  getSymbols(): Record<string, number>;
  getTerminalFrameBuffer(): TerminalFrameBuffer;
  getTerminalLines(): string[];
  getTerminalMeta(): TerminalMeta;
  getTerminalText(): string;
  getTerminalSnapshot(): TerminalSnapshot;
  getUSP(): number;
  getVFlag(): number;
  getXFlag(): number;
  getZFlag(): number;
  isHalted(): boolean;
  isWaitingForInput(): boolean;
  getRuntimeSyncVersions?(): RuntimeSyncVersions | undefined;
  getRuntimeTransport?(): IdeRuntimeTransport;
}

export interface IdeRuntimeController {
  initialize?(): Promise<void>;
  whenReady(): Promise<void>;
  dispose(): Promise<void>;
  requestLoadProgram(source: string, columns: number, rows: number): Promise<void>;
  requestRun(config?: WorkerExecutionConfig): Promise<void>;
  requestResume(config?: WorkerExecutionConfig): Promise<void>;
  requestPause(): Promise<void>;
  requestStep(): Promise<WorkerStepResult | undefined>;
  requestUndo(): Promise<void>;
  requestReset(): Promise<void>;
  requestQueueInput(input: string | number | number[]): Promise<void>;
  requestClearInputQueue(): Promise<void>;
  requestRaiseExternalInterrupt(handlerAddress: number): Promise<boolean>;
  requestResizeTerminal(columns: number, rows: number): Promise<void>;
  requestWriteMemoryByte(address: number, value: number): Promise<void>;
  requestWriteMemoryWord(address: number, value: number): Promise<void>;
  requestWriteMemoryLong(address: number, value: number): Promise<void>;
  requestSetRegisterValue(register: number, value: number): Promise<void>;
  requestDispatchTouchPacket(
    protocol: TerminalTouchProtocolSymbols,
    packet: TerminalTouchPacket
  ): Promise<boolean>;
  requestSetUndoCaptureMode(mode: UndoCaptureMode, checkpointInterval?: number): Promise<void>;
  requestConfigureExecution?(config: WorkerExecutionConfig): Promise<void>;
  requestPulseExecution?(frameBudgetMs?: number): Promise<boolean>;
  requestSnapshot(): Promise<void>;
  requestReadMemoryRange(address: number, length: number): Promise<Uint8Array>;
  requestSymbolAddress(symbol: string): Promise<number | undefined>;
  subscribeEvents?(
    listener: (event: Exclude<InterpreterWorkerEvent, { type: 'ready' } | { type: 'reply' }>) => void
  ): () => void;
}

export interface IdeRuntimeSession extends IdeRuntimeCachedReadApi {
  clearInputQueue(): void;
  emulationStep(): boolean;
  queueInput(input: string | number | number[]): void;
  raiseExternalInterrupt(handlerAddress: number): boolean;
  reset(): void;
  undoFromStack(): void;
  writeMemoryByte(address: number, value: number): void;
  writeMemoryLong(address: number, value: number): void;
  writeMemoryWord(address: number, value: number): void;
  setRegisterValue?: (register: number, value: number) => void;
  resizeTerminal?: (columns: number, rows: number) => void;
  setUndoCaptureMode?: (mode: UndoCaptureMode, checkpointInterval?: number) => void;
  getUndoCaptureMode?: () => UndoCaptureMode;
  forceUndoCheckpoint?: () => void;
  controller?: IdeRuntimeController;
}

export function createInProcessIdeRuntimeSession(emulator: IdeRuntimeSession): IdeRuntimeSession {
  if (emulator.getRuntimeTransport) {
    return emulator;
  }

  return Object.assign(emulator, {
    getRuntimeTransport: () => 'in-process' as const,
  });
}
