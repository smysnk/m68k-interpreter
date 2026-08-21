import type {
  Emulator,
  RuntimeSyncVersions,
  TerminalFrameBuffer,
  TerminalMeta,
  TerminalSnapshot,
  UndoCaptureMode,
  Easy68kHardwareConfig,
  Easy68kHardwareDeviceConfig,
  Easy68kHardwareSnapshot,
  Easy68kHardwareValidationResult,
  InterruptRequestResult,
  DebuggerConfiguration,
  DebugSnapshot,
  DebugStop,
} from '@m68k/interpreter';
import type {
  InterpreterWorkerEvent,
  WorkerExecutionConfig,
  RuntimeLoadRequest,
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
  getVBR?(): number;
  getSFC?(): number;
  getDFC?(): number;
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
  getHardwareSnapshot?(): Easy68kHardwareSnapshot;
  getGraphicsState?(): import('@m68k/interpreter').Easy68kGraphicsState | undefined;
  consumeGraphicsPatch?(
    forceFull?: boolean
  ): import('@m68k/interpreter').Easy68kGraphicsPatch | undefined;
  getSoundSnapshot?(
    includeCommands?: boolean
  ): import('@m68k/interpreter').Easy68kSoundSnapshot | undefined;
  getRuntimeTransport?(): IdeRuntimeTransport;
  getDebugSnapshot?(): DebugSnapshot | undefined;
  getDebugStop?(): DebugStop | undefined;
}

export interface IdeRuntimeController {
  initialize?(): Promise<void>;
  whenReady(): Promise<void>;
  dispose(): Promise<void>;
  requestLoadProgram(request: RuntimeLoadRequest): Promise<void>;
  requestRun(config?: WorkerExecutionConfig): Promise<void>;
  requestResume(config?: WorkerExecutionConfig): Promise<void>;
  requestPause(): Promise<void>;
  requestStep(): Promise<WorkerStepResult | undefined>;
  requestStepOver(): Promise<WorkerStepResult | undefined>;
  requestStepOut(): Promise<boolean>;
  requestRunToAddress(address: number, config?: WorkerExecutionConfig): Promise<void>;
  requestConfigureDebugger(configuration: DebuggerConfiguration): Promise<void>;
  requestUndo(): Promise<void>;
  requestReset(): Promise<void>;
  requestQueueInput(input: string | number | number[]): Promise<void>;
  requestClearInputQueue(): Promise<void>;
  requestConfigureHardware(config: Easy68kHardwareConfig): Promise<Easy68kHardwareValidationResult>;
  requestConfigureHardwareDevices(
    devices: readonly Easy68kHardwareDeviceConfig[]
  ): Promise<Easy68kHardwareValidationResult>;
  requestSetHardwareToggle(bit: number, enabled: boolean, deviceId?: string): Promise<void>;
  requestSetHardwareButton(bit: number, pressed: boolean, deviceId?: string): Promise<void>;
  requestInterruptLevel(level: number): Promise<InterruptRequestResult>;
  requestConfigureAutomaticInterrupts(levels: number[], intervalMs: number): Promise<void>;
  requestCancelAutomaticInterrupts(): Promise<void>;
  requestRaiseExternalInterrupt(handlerAddress: number): Promise<boolean>;
  requestResizeTerminal(columns: number, rows: number): Promise<void>;
  requestWriteMemoryByte(address: number, value: number): Promise<void>;
  requestWriteMemoryWord(address: number, value: number): Promise<void>;
  requestWriteMemoryLong(address: number, value: number): Promise<void>;
  requestSetRegisterValue(register: number, value: number): Promise<void>;
  requestSetControlRegisterValue(register: 'vbr' | 'sfc' | 'dfc', value: number): Promise<void>;
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
  requestCompleteSoundVoice?(voiceId: number): Promise<void>;
  requestStopAllSounds?(): Promise<void>;
  requestStopSoundReference?(
    player: 'standard' | 'polyphonic',
    reference: number
  ): Promise<boolean>;
  requestRegisterSoundAssets?(
    assets: readonly import('@m68k/interpreter').Easy68kSoundAsset[]
  ): Promise<import('@m68k/interpreter').Easy68kSoundAsset[]>;
  subscribeEvents?(
    listener: (
      event: Exclude<InterpreterWorkerEvent, { type: 'ready' } | { type: 'reply' }>
    ) => void
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
  setControlRegisterValue?: (register: 'vbr' | 'sfc' | 'dfc', value: number) => void;
  resizeTerminal?: (columns: number, rows: number) => void;
  setUndoCaptureMode?: (mode: UndoCaptureMode, checkpointInterval?: number) => void;
  getUndoCaptureMode?: () => UndoCaptureMode;
  forceUndoCheckpoint?: () => void;
  configureHardware?(config: Easy68kHardwareConfig): Easy68kHardwareValidationResult;
  configureHardwareDevices?(
    devices: readonly Easy68kHardwareDeviceConfig[]
  ): Easy68kHardwareValidationResult;
  setHardwareToggle?(bit: number, enabled: boolean, deviceId?: string): void;
  setHardwareButton?(bit: number, pressed: boolean, deviceId?: string): void;
  stopAllSounds?(): void;
  stopSoundReference?(player: 'standard' | 'polyphonic', reference: number): boolean;
  completeSoundVoice?(voiceId: number): void;
  registerSoundAssets?(
    assets: readonly import('@m68k/interpreter').Easy68kSoundAsset[]
  ): import('@m68k/interpreter').Easy68kSoundAsset[];
  requestInterruptLevel?(level: number): InterruptRequestResult;
  configureDebugger?(configuration: DebuggerConfiguration): void;
  beginDebugContinue?(): void;
  beginDebugStepInto?(): void;
  beginDebugStepOver?(): boolean;
  beginDebugStepOut?(): boolean;
  beginDebugRunTo?(address: number): void;
  pauseDebugger?(): DebugStop;
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
