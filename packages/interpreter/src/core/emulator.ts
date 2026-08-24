import { assembleLoadedProgram } from '../assembler/sourceAssembler';
import type { ProgramImage, ProgramSourceMapEntry } from '../assembler/programImage';
import { DebugSession } from '../debugger/debugSession';
import type { DebuggerConfiguration, DebugSnapshot, DebugStop } from '../debugger/types';
import type { BusAccess } from '../cpu/memoryBus';
import { StrictM68000Core } from '../cpu/core';
import type { CpuDiagnostic, CpuFault, StepResult } from './execution';
import {
  Easy68kHardware,
  type Easy68kHardwareConfig,
  type Easy68kHardwareDeviceConfig,
  type Easy68kHardwareSnapshot,
  type Easy68kHardwareValidationResult,
} from '../devices/easy68kHardware';
import type { TerminalDevice, TerminalMeta, TerminalSnapshot } from '../devices/terminal';
import type { TerminalFrameBuffer } from '../devices/terminalBuffer';
import type { Easy68kGraphicsPatch, Easy68kGraphicsState } from '../devices/easy68kGraphics';
import type { Easy68kSoundAsset, Easy68kSoundSnapshot } from '../devices/easy68kSound';
import { normalizeEmulationConfig, toLegacyCpuProfile } from '../isa/emulationConfig';
import type { CpuProfile, EmulationConfig, MachineProfile } from '../isa/types';
import {
  createMachineAdapter,
  type MachineAdapter,
  type MachineTrapContext,
} from '../machine/machineAdapter';
import { loadProgramSource, type ProgramSource } from '../programLoader';
import type { RuntimeSyncVersions } from '../types/emulator';
import { isInterruptLevelEligible } from './statusRegister';
import { Memory } from './memory';
import { Undo } from './undo';
import { Strings } from './strings';

const DEFAULT_STACK_POINTER = 0x00100000;
const DEFAULT_UNDO_CHECKPOINT_INTERVAL = 64;

export type UndoCaptureMode = 'full' | 'off' | 'checkpointed';
export type InterruptRequestResult = 'accepted' | 'masked' | 'rejected';

export interface EmulatorOptions {
  columns?: number;
  rows?: number;
  /** @deprecated Use emulation. */
  cpuProfile?: CpuProfile;
  emulation?: Partial<EmulationConfig>;
  undoMode?: UndoCaptureMode;
  undoCheckpointInterval?: number;
  hardwareConfig?: Easy68kHardwareConfig;
  hardwareDevices?: readonly Easy68kHardwareDeviceConfig[];
  soundAssets?: readonly Easy68kSoundAsset[];
  debugFileId?: string;
}

function normalizeUndoCheckpointInterval(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_UNDO_CHECKPOINT_INTERVAL;
  return Math.max(1, Math.floor(value ?? DEFAULT_UNDO_CHECKPOINT_INTERVAL));
}

export class Emulator {
  private readonly memory = new Memory();
  private readonly undo = new Undo();
  private readonly emulation: EmulationConfig;
  private readonly machine: MachineAdapter;
  private readonly debugSession = new DebugSession();
  private readonly terminal: TerminalDevice;
  private readonly hardware: Easy68kHardware;
  private strictCore: StrictM68000Core | undefined;
  private machineTrapContext: MachineTrapContext | undefined;
  private readonly strictProgramImage: ProgramImage | undefined;
  private readonly strictSourceByAddress = new Map<number, ProgramSourceMapEntry>();
  private readonly symbols: Record<string, number>;
  private readonly symbolLookup: Record<string, number>;
  private readonly sourceLines: string[];
  private readonly initialMemory: Record<number, number>;
  private readonly initialErrors: string[];
  private readonly initialFault: CpuFault | undefined;
  private lastStrictFault: CpuFault | undefined;
  private lastInstruction = Strings.LAST_INSTRUCTION_DEFAULT_TEXT;
  private line = 0;
  private errors: string[];
  private exception: string | undefined;
  private inputQueue: number[] = [];
  private waitingForInput = false;
  private waitingForInputTask: number | null = null;
  private halted = false;
  private pendingExternalInterruptAddress: number | undefined;
  private readonly pendingInterruptLevels = new Set<number>();
  private undoCaptureMode: UndoCaptureMode;
  private undoCheckpointInterval: number;
  private instructionsSinceUndoSnapshot = 0;
  private registerSyncVersion = 1;
  private executionSyncVersion = 1;
  private diagnosticsSyncVersion = 1;
  private loadFailureReported = false;

  constructor(program: ProgramSource = '', options: EmulatorOptions = {}) {
    this.emulation = normalizeEmulationConfig(options.emulation, options.cpuProfile);
    this.undoCaptureMode = options.undoMode ?? 'full';
    this.undoCheckpointInterval = normalizeUndoCheckpointInterval(options.undoCheckpointInterval);
    this.machine = createMachineAdapter(this.emulation.machineProfile, this.memory, {
      columns: options.columns,
      rows: options.rows,
      hardwareConfig: options.hardwareConfig,
      hardwareDevices: options.hardwareDevices,
      soundAssets: options.soundAssets,
      beforeRamWrite: (address) => this.captureUndoPageForAddress(address),
    });
    this.terminal = this.machine.terminal;
    this.hardware = this.machine.hardware;

    const loadedProgram = loadProgramSource(program);
    this.sourceLines = loadedProgram.sourceLines;
    const assembled =
      loadedProgram.exception === undefined && loadedProgram.endPointer !== undefined
        ? assembleLoadedProgram(loadedProgram)
        : undefined;
    this.errors = [
      ...loadedProgram.errors,
      ...(assembled?.diagnostics.map((diagnostic) => diagnostic.message) ?? []),
    ];
    this.symbolLookup = assembled?.symbols ?? loadedProgram.symbolLookup;
    this.symbols = Object.fromEntries(
      Object.keys(loadedProgram.symbols).map((name) => [
        name,
        this.symbolLookup[name.toLowerCase()] ?? loadedProgram.symbols[name],
      ])
    );

    if (assembled?.image !== undefined) {
      this.strictProgramImage = assembled.image;
      for (const entry of assembled.image.sourceMap) {
        this.strictSourceByAddress.set(entry.address, entry);
      }
      this.strictCore = this.createCore(assembled.image);
      this.debugSession.loadProgram(
        assembled.image,
        this.symbolLookup,
        typeof program === 'string'
          ? program
          : Array.from(program, (byte) => String.fromCharCode(byte)).join(''),
        options.debugFileId ?? 'active'
      );
      this.updateExecutionMetadata();
    } else {
      const message =
        loadedProgram.exception ??
        (loadedProgram.endPointer === undefined ? Strings.END_MISSING : undefined) ??
        this.errors[0] ??
        'No executable program image is available.';
      this.exception = message;
      this.lastStrictFault = {
        code: 'assembly-load-failure',
        message,
        source: this.line > 0 ? { line: this.line } : undefined,
      };
    }

    this.initialMemory = this.memory.getMemory();
    this.initialErrors = [...this.errors];
    this.initialFault =
      this.lastStrictFault === undefined ? undefined : { ...this.lastStrictFault };
    this.lastInstruction =
      this.strictProgramImage === undefined
        ? Strings.LAST_INSTRUCTION_DEFAULT_TEXT
        : this.lastInstruction;
    this.resetUndoHistory();
  }

  private createCore(image: ProgramImage): StrictM68000Core {
    const core = new StrictM68000Core({
      bus: this.machine.bus,
      cpuModel: this.emulation.cpuModel,
      state: { sr: 0, usp: DEFAULT_STACK_POINTER, ssp: DEFAULT_STACK_POINTER },
    });
    core.loadProgram(image);
    this.machineTrapContext = {
      core,
      inputQueue: this.inputQueue,
      setWaiting: (task) => {
        this.waitingForInput = true;
        this.waitingForInputTask = task;
      },
      clearWaiting: () => {
        this.waitingForInput = false;
        this.waitingForInputTask = null;
      },
      halt: () => {
        this.halted = true;
      },
    };
    return core;
  }

  private captureUndoPageForAddress(address: number): void {
    const frame = this.undo.peek();
    if (frame === undefined) return;
    const pageIndex = Math.floor((address & 0x00ff_ffff) / this.memory.getPageSize());
    if (!frame.memoryPages.some((entry) => entry.pageIndex === pageIndex)) {
      frame.memoryPages.push(this.memory.captureUndoPage(pageIndex));
    }
  }

  private updateExecutionMetadata(address = this.strictCore?.state.pc): void {
    const source = address === undefined ? undefined : this.strictSourceByAddress.get(address);
    if (source === undefined) return;
    this.line = source.line;
    this.lastInstruction = this.sourceLines[source.line - 1]?.trim() ?? this.lastInstruction;
  }

  private runtimeState() {
    return {
      pc: this.getPC(),
      sr: this.getSR(),
      lastInstruction: this.lastInstruction,
      line: this.line,
      halted: this.halted,
      waiting: this.waitingForInput,
      exception: this.exception,
      errorsLength: this.errors.length,
      lastError: this.errors.at(-1),
    };
  }

  private reconcileRuntimeSyncVersions(
    before: ReturnType<Emulator['runtimeState']>,
    registersMayHaveChanged = false
  ): void {
    const after = this.runtimeState();
    if (registersMayHaveChanged || before.pc !== after.pc || before.sr !== after.sr) {
      this.registerSyncVersion += 1;
    }
    if (
      before.pc !== after.pc ||
      before.lastInstruction !== after.lastInstruction ||
      before.line !== after.line ||
      before.halted !== after.halted ||
      before.waiting !== after.waiting
    ) {
      this.executionSyncVersion += 1;
    }
    if (
      before.exception !== after.exception ||
      before.errorsLength !== after.errorsLength ||
      before.lastError !== after.lastError
    ) {
      this.diagnosticsSyncVersion += 1;
    }
  }

  private pushUndoSnapshot(lastInstruction = this.lastInstruction, line = this.line): void {
    const core = this.strictCore;
    if (core === undefined) return;
    this.undo.push({
      cpu: {
        pc: core.state.pc,
        sr: core.state.sr,
        usp: this.getUSP(),
        ssp: this.getSSP(),
        vbr: this.getVBR(),
        sfc: this.getSFC(),
        dfc: this.getDFC(),
        registers: this.getRegisterSnapshot(),
      },
      memoryPages: [],
      machine: this.machine.snapshot(),
      diagnostics: { errors: this.errors },
      execution: { lastInstruction, line },
    });
    this.instructionsSinceUndoSnapshot = 0;
  }

  private resetUndoHistory(): void {
    this.undo.clear();
    this.instructionsSinceUndoSnapshot = 0;
    if (this.undoCaptureMode !== 'off') {
      this.pushUndoSnapshot(Strings.LAST_INSTRUCTION_DEFAULT_TEXT, 0);
    }
  }

  private maybeCaptureUndoSnapshot(force = false): void {
    if (this.undoCaptureMode === 'off' || this.strictCore === undefined) return;
    if (
      !force &&
      this.undoCaptureMode === 'checkpointed' &&
      this.instructionsSinceUndoSnapshot < this.undoCheckpointInterval
    ) {
      return;
    }
    this.pushUndoSnapshot();
  }

  private markUndoProgress(): void {
    if (this.undoCaptureMode === 'checkpointed') this.instructionsSinceUndoSnapshot += 1;
  }

  private stepStrictCore(): StepResult {
    const core = this.strictCore;
    if (core === undefined) return this.unavailableStepResult();
    const beforePc = this.getPC();
    const beforeLastInstruction = this.lastInstruction;
    const beforeLine = this.line;
    const beforeHalted = this.halted;
    const beforeWaiting = this.waitingForInput;
    const beforeException = this.exception;
    const beforeErrorsLength = this.errors.length;
    const beforeLastError = this.errors.at(-1);
    const pcBefore = core.state.pc;
    try {
      if (this.halted) return { kind: 'halted', pc: core.state.pc };
      if (core.isProgramComplete()) return core.step();

      if (this.machine.id === 'easy68k' && this.pendingExternalInterruptAddress !== undefined) {
        const handlerAddress = this.pendingExternalInterruptAddress;
        this.pendingExternalInterruptAddress = undefined;
        core.state.a[7] = (core.state.a[7] - 4) | 0;
        this.machine.bus.write32(core.state.a[7] >>> 0, pcBefore);
        core.state.pc = handlerAddress;
        this.waitingForInput = false;
        this.updateExecutionMetadata(pcBefore);
        return {
          kind: 'executed',
          pcBefore,
          pcAfter: handlerAddress,
          cycles: 44,
          transition: 'interrupt',
        };
      }

      if (this.machine.id === 'easy68k' && this.waitingForInput) {
        if (this.inputQueue.length === 0) return { kind: 'waiting', pc: core.state.pc };
        const byte = this.inputQueue.shift() ?? 0;
        if (this.waitingForInputTask === 5) {
          core.state.d[1] = (core.state.d[1] & 0xffff_ff00) | (byte & 0xff);
        }
        this.waitingForInput = false;
        this.waitingForInputTask = null;
        return { kind: 'executed', pcBefore, pcAfter: core.state.pc };
      }

      this.maybeCaptureUndoSnapshot();
      const interruptVectorBase = this.emulation.cpuModel === 'm68010' ? core.state.vbr : 0;
      const missingLevel = [...this.pendingInterruptLevels]
        .sort((left, right) => right - left)
        .find(
          (level) => this.machine.validateInterruptVector(level, interruptVectorBase) !== undefined
        );
      if (missingLevel !== undefined) {
        this.pendingInterruptLevels.delete(missingLevel);
        const message =
          this.machine.validateInterruptVector(missingLevel, interruptVectorBase) ??
          `Invalid or missing IRQ ${missingLevel} autovector`;
        const fault: CpuFault = { code: 'missing-autovector', message };
        this.exception = message;
        this.lastStrictFault = fault;
        return { kind: 'exception', pc: pcBefore, fault };
      }
      for (const level of this.pendingInterruptLevels) core.requestInterrupt(level);
      this.pendingInterruptLevels.clear();

      const rawResult =
        (this.machineTrapContext === undefined
          ? undefined
          : this.machine.handleTrap(this.machineTrapContext)) ?? core.step();
      const result: StepResult =
        rawResult.kind === 'exception' && rawResult.fault.code === 'interrupt'
          ? {
              kind: 'executed',
              pcBefore,
              pcAfter: rawResult.pc,
              cycles: 44,
              transition: 'interrupt',
            }
          : rawResult;
      this.lastStrictFault = result.kind === 'exception' ? result.fault : undefined;
      this.exception = result.kind === 'exception' ? result.fault.message : undefined;
      this.halted = result.kind === 'halted';
      this.updateExecutionMetadata(pcBefore);
      this.markUndoProgress();
      return result;
    } finally {
      this.registerSyncVersion += 1;
      if (
        beforePc !== this.getPC() ||
        beforeLastInstruction !== this.lastInstruction ||
        beforeLine !== this.line ||
        beforeHalted !== this.halted ||
        beforeWaiting !== this.waitingForInput
      ) {
        this.executionSyncVersion += 1;
      }
      if (
        beforeException !== this.exception ||
        beforeErrorsLength !== this.errors.length ||
        beforeLastError !== this.errors.at(-1)
      ) {
        this.diagnosticsSyncVersion += 1;
      }
    }
  }

  private unavailableStepResult(): StepResult {
    const fault = this.lastStrictFault ?? {
      code: 'program-image-unavailable',
      message: this.exception ?? 'No executable program image is loaded.',
    };
    this.lastStrictFault = fault;
    this.exception = fault.message;
    if (!this.loadFailureReported) {
      this.loadFailureReported = true;
      this.diagnosticsSyncVersion += 1;
    }
    return { kind: 'exception', pc: 0, fault };
  }

  emulationStep(): boolean {
    if (this.debugSession.beforeInstruction(this)) return false;
    const pcBefore = this.getPC();
    const accesses: BusAccess[] = [];
    this.machine.setBusAccessObserver(
      this.debugSession.hasWatchpoints() ? (access) => accesses.push(access) : undefined
    );
    let result: StepResult;
    try {
      result = this.stepInstruction();
    } finally {
      this.machine.setBusAccessObserver(undefined);
    }
    this.debugSession.afterInstruction(this, pcBefore, result, accesses);
    return result.kind === 'halted' || result.kind === 'completed' || result.kind === 'exception';
  }

  stepInstruction(): StepResult {
    return this.strictCore === undefined ? this.unavailableStepResult() : this.stepStrictCore();
  }

  getPC(): number {
    return this.strictCore?.state.pc ?? 0;
  }

  configureDebugger(configuration: DebuggerConfiguration): void {
    this.debugSession.configure(configuration);
  }

  beginDebugContinue(): void {
    this.debugSession.beginContinue();
  }

  beginDebugStepInto(): void {
    this.debugSession.beginStepInto(this);
  }

  beginDebugStepOver(): boolean {
    return this.debugSession.beginStepOver(this);
  }

  beginDebugStepOut(): boolean {
    return this.debugSession.beginStepOut();
  }

  beginDebugRunTo(address: number): void {
    this.debugSession.beginRunTo(address);
  }

  pauseDebugger(): DebugStop {
    return this.debugSession.pause(this);
  }

  getDebugStop(): DebugStop | undefined {
    return this.debugSession.getStop();
  }

  getDebugSnapshot(): DebugSnapshot {
    return this.debugSession.getSnapshot(this);
  }

  getRegisters(): Int32Array {
    return this.getRegisterSnapshot();
  }

  getRegisterSnapshot(): Int32Array {
    const state = this.strictCore?.state;
    return state === undefined ? new Int32Array(16) : Int32Array.from([...state.a, ...state.d]);
  }

  setRegisterValue(register: number, value: number): void {
    if (!Number.isInteger(register) || register < 0 || register >= 16) {
      throw new RangeError(`Register index must be an integer from 0 through 15: ${register}`);
    }
    const core = this.strictCore;
    if (core === undefined) throw new Error('No executable program image is loaded.');
    const before = this.runtimeState();
    if (register < 8) core.state.a[register] = value | 0;
    else core.state.d[register - 8] = value | 0;
    this.reconcileRuntimeSyncVersions(before, true);
    this.debugSession.invalidateCallStack();
  }

  getCCR(): number {
    return this.strictCore?.state.ccr ?? 0;
  }

  getSR(): number {
    return this.strictCore?.state.sr ?? 0;
  }

  getUSP(): number {
    const state = this.strictCore?.state;
    if (state === undefined) return DEFAULT_STACK_POINTER;
    return state.isSupervisor() ? state.usp : state.a[7] >>> 0;
  }

  getSSP(): number {
    const state = this.strictCore?.state;
    if (state === undefined) return DEFAULT_STACK_POINTER;
    return state.isSupervisor() ? state.a[7] >>> 0 : state.ssp;
  }

  getVBR(): number {
    return this.emulation.cpuModel === 'm68010' ? (this.strictCore?.state.vbr ?? 0) : 0;
  }

  getSFC(): number {
    return this.emulation.cpuModel === 'm68010' ? (this.strictCore?.state.sfc ?? 0) : 0;
  }

  getDFC(): number {
    return this.emulation.cpuModel === 'm68010' ? (this.strictCore?.state.dfc ?? 0) : 0;
  }

  setControlRegisterValue(register: 'vbr' | 'sfc' | 'dfc', value: number): void {
    if (this.emulation.cpuModel !== 'm68010') {
      throw new Error(`${register.toUpperCase()} is unavailable on the MC68000 CPU model`);
    }
    const core = this.strictCore;
    if (core === undefined) throw new Error('No executable program image is loaded.');
    const before = this.runtimeState();
    if (register === 'vbr') core.state.vbr = value >>> 0;
    else if (register === 'sfc') core.state.sfc = value & 0x7;
    else core.state.dfc = value & 0x7;
    this.reconcileRuntimeSyncVersions(before, true);
    this.debugSession.invalidateCallStack();
  }

  getMemory(): Record<number, number> {
    return this.memory.getMemory();
  }

  getMemoryMeta() {
    const range = this.memory.getAddressRange();
    return {
      usedBytes: this.memory.getUsedBytes(),
      minAddress: range.minAddress,
      maxAddress: range.maxAddress,
      version: this.memory.getMemoryVersion(),
    };
  }

  getRuntimeSyncVersions(): RuntimeSyncVersions {
    const terminalMeta = this.terminal.getTerminalMeta();
    return {
      registers: this.registerSyncVersion,
      execution: this.executionSyncVersion,
      diagnostics: this.diagnosticsSyncVersion,
      debugger: this.debugSession.getRevision(),
      memory: this.memory.getMemoryVersion(),
      terminal: terminalMeta.version,
      terminalGeometry: terminalMeta.geometryVersion,
      hardware: this.hardware.getSnapshot().version,
      graphics: this.machine.graphics?.getVersion(),
      sound: this.machine.sound?.getVersion(),
    };
  }

  readMemoryRange(address: number, length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`Memory range length must be a non-negative integer: ${length}`);
    }
    return Uint8Array.from({ length }, (_, index) => this.machine.bus.read8(address + index));
  }

  getHardwareSnapshot(): Easy68kHardwareSnapshot {
    return this.hardware.getSnapshot();
  }

  getGraphicsState(): Easy68kGraphicsState | undefined {
    return this.machine.graphics?.getState();
  }

  consumeGraphicsPatch(forceFull = false): Easy68kGraphicsPatch | undefined {
    return this.machine.graphics?.consumePatch(forceFull);
  }

  getSoundSnapshot(includeCommands = false): Easy68kSoundSnapshot | undefined {
    return this.machine.sound?.getSnapshot(includeCommands);
  }

  getSoundAssets(): Easy68kSoundAsset[] {
    return this.machine.sound?.getAssets() ?? [];
  }

  registerSoundAssets(assets: readonly Easy68kSoundAsset[]): Easy68kSoundAsset[] {
    return this.machine.sound?.registerAssets(assets) ?? [];
  }

  completeSoundVoice(voiceId: number): void {
    this.machine.sound?.completeVoice(voiceId);
  }

  stopAllSounds(): void {
    this.machine.sound?.stopAll();
  }

  stopSoundReference(player: 'standard' | 'polyphonic', reference: number): boolean {
    return this.machine.sound?.stopReference(player, reference) ?? false;
  }

  configureHardware(config: Easy68kHardwareConfig): Easy68kHardwareValidationResult {
    return this.hardware.configure(config);
  }

  configureHardwareDevices(
    configs: readonly Easy68kHardwareDeviceConfig[]
  ): Easy68kHardwareValidationResult {
    return this.hardware.configureDevices(configs);
  }

  configureHardwareDevice(
    deviceId: string,
    config: Easy68kHardwareConfig
  ): Easy68kHardwareValidationResult {
    return this.hardware.configureDevice(deviceId, config);
  }

  setHardwareToggle(bit: number, enabled: boolean, deviceId?: string): void {
    this.hardware.setToggle(bit, enabled, deviceId);
  }

  setHardwareButton(bit: number, pressed: boolean, deviceId?: string): void {
    this.hardware.setButton(bit, pressed, deviceId);
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return this.terminal.getDebugSnapshot();
  }

  getTerminalDebugSnapshot(): TerminalSnapshot {
    return this.terminal.getDebugSnapshot();
  }

  getTerminalFrameBuffer(): TerminalFrameBuffer {
    return this.terminal.getFrameBuffer();
  }

  getTerminalMeta(): TerminalMeta {
    return this.terminal.getTerminalMeta();
  }

  resizeTerminal(columns: number, rows: number): void {
    this.terminal.resize(columns, rows);
  }

  getTerminalLines(): string[] {
    return this.terminal.getLines();
  }

  getTerminalText(): string {
    return this.terminal.getText();
  }

  writeMemoryByte(address: number, value: number): void {
    this.machine.bus.write8(address, value);
    this.debugSession.invalidateCallStack();
  }

  writeMemoryWord(address: number, value: number): void {
    this.machine.bus.write16(address, value);
    this.debugSession.invalidateCallStack();
  }

  writeMemoryLong(address: number, value: number): void {
    this.machine.bus.write32(address, value);
    this.debugSession.invalidateCallStack();
  }

  private resolveExternalInterruptAddress(address: number): number | undefined {
    const normalized = address & 0x00ff_ffff;
    return this.strictProgramImage?.sourceMap.some((entry) => entry.address === normalized)
      ? normalized
      : undefined;
  }

  raiseExternalInterrupt(handlerAddress: number): boolean {
    if (this.machine.id !== 'easy68k') return false;
    const resolved = this.resolveExternalInterruptAddress(handlerAddress);
    if (resolved === undefined) return false;
    this.pendingExternalInterruptAddress = resolved;
    this.debugSession.resumeMachineWait();
    return true;
  }

  requestInterruptLevel(level: number): InterruptRequestResult {
    if (!Number.isInteger(level) || level < 1 || level > 7) return 'rejected';
    this.pendingInterruptLevels.add(level);
    this.debugSession.resumeMachineWait();
    return isInterruptLevelEligible(this.getSR(), level) ? 'accepted' : 'masked';
  }

  getPendingInterruptLevels(): number[] {
    return [...this.pendingInterruptLevels].sort((left, right) => right - left);
  }

  queueInput(input: string | number | number[] | Uint8Array): void {
    this.debugSession.resumeMachineWait();
    if (typeof input === 'string') {
      for (let index = 0; index < input.length; index += 1) {
        this.inputQueue.push(input.charCodeAt(index) & 0xff);
      }
      return;
    }
    if (typeof input === 'number') {
      this.inputQueue.push(input & 0xff);
      return;
    }
    for (const byte of input) this.inputQueue.push(byte & 0xff);
  }

  clearInputQueue(): void {
    this.inputQueue = [];
    if (this.machineTrapContext !== undefined) this.machineTrapContext.inputQueue = this.inputQueue;
  }

  getQueuedInputLength(): number {
    return this.inputQueue.length;
  }

  isWaitingForInput(): boolean {
    return this.waitingForInput;
  }

  isHalted(): boolean {
    return this.halted;
  }

  getSymbols(): Record<string, number> {
    return { ...this.symbols };
  }

  getSymbolAddress(symbol: string): number | undefined {
    return this.symbolLookup[symbol.trim().toLowerCase()];
  }

  getZFlag(): number {
    return (this.getCCR() & 0x04) >>> 2;
  }

  getVFlag(): number {
    return (this.getCCR() & 0x02) >>> 1;
  }

  getNFlag(): number {
    return (this.getCCR() & 0x08) >>> 3;
  }

  getCFlag(): number {
    return this.getCCR() & 0x01;
  }

  getXFlag(): number {
    return (this.getCCR() & 0x10) >>> 4;
  }

  getLastInstruction(): string {
    return this.lastInstruction;
  }

  getErrors(): string[] {
    return [...this.errors];
  }

  getDiagnostics(): CpuDiagnostic[] {
    if (this.lastStrictFault !== undefined) {
      return [
        {
          code: this.lastStrictFault.code,
          severity: 'error',
          message: this.lastStrictFault.message,
          source: this.lastStrictFault.source ?? (this.line > 0 ? { line: this.line } : undefined),
          instructionAddress: this.getPC(),
        },
      ];
    }
    return this.errors.map((message) => ({
      code: 'assembly-load-error',
      severity: 'error' as const,
      message,
      instructionAddress: this.getPC(),
    }));
  }

  getException(): string | undefined {
    return this.exception ?? this.lastStrictFault?.message;
  }

  getCpuProfile(): CpuProfile {
    return toLegacyCpuProfile(this.emulation) ?? this.emulation.cpuModel;
  }

  getEmulationConfig(): Readonly<EmulationConfig> {
    return { ...this.emulation };
  }

  getMachineProfile(): MachineProfile {
    return this.machine.id;
  }

  isHardwareConnected(): boolean {
    return this.machine.mappedHardwareConnected;
  }

  getUndoCaptureMode(): UndoCaptureMode {
    return this.undoCaptureMode;
  }

  setUndoCaptureMode(mode: UndoCaptureMode, checkpointInterval?: number): void {
    this.undoCaptureMode = mode;
    if (checkpointInterval !== undefined) {
      this.undoCheckpointInterval = normalizeUndoCheckpointInterval(checkpointInterval);
    }
    this.instructionsSinceUndoSnapshot = 0;
    if (mode !== 'off' && this.undo.size() === 0) this.pushUndoSnapshot();
  }

  forceUndoCheckpoint(): void {
    if (this.undoCaptureMode !== 'off') this.pushUndoSnapshot();
  }

  undoFromStack(): void {
    const core = this.strictCore;
    if (core === undefined) return;
    const before = this.runtimeState();
    const frame = this.undo.pop();
    if (frame === undefined) return;
    core.state.sr = frame.cpu.sr;
    core.state.usp = frame.cpu.usp;
    core.state.ssp = frame.cpu.ssp;
    core.state.vbr = frame.cpu.vbr ?? 0;
    core.state.sfc = frame.cpu.sfc ?? 0;
    core.state.dfc = frame.cpu.dfc ?? 0;
    core.state.a.set(frame.cpu.registers.slice(0, 8));
    core.state.d.set(frame.cpu.registers.slice(8, 16));
    core.state.pc = frame.cpu.pc;
    this.memory.restoreUndoPages(frame.memoryPages);
    this.machine.restore(frame.machine);
    this.errors = [...frame.diagnostics.errors];
    this.lastInstruction = frame.execution.lastInstruction;
    this.line = frame.execution.line;
    this.waitingForInput = false;
    this.waitingForInputTask = null;
    this.halted = false;
    this.lastStrictFault = undefined;
    this.exception = undefined;
    this.instructionsSinceUndoSnapshot = 0;
    this.reconcileRuntimeSyncVersions(before, true);
    this.debugSession.clearStop();
    this.debugSession.invalidateCallStack();
  }

  reset(): void {
    const before = this.runtimeState();
    this.memory.setMemory(this.initialMemory);
    this.machine.reset();
    this.inputQueue = [];
    if (this.machineTrapContext !== undefined) this.machineTrapContext.inputQueue = this.inputQueue;
    this.waitingForInput = false;
    this.waitingForInputTask = null;
    this.halted = false;
    this.pendingExternalInterruptAddress = undefined;
    this.pendingInterruptLevels.clear();
    this.lastInstruction = Strings.LAST_INSTRUCTION_DEFAULT_TEXT;
    this.line = 0;
    this.errors = [...this.initialErrors];
    this.lastStrictFault = this.initialFault === undefined ? undefined : { ...this.initialFault };
    this.exception = this.lastStrictFault?.message;
    this.loadFailureReported = false;
    if (this.strictProgramImage !== undefined) {
      this.strictCore = this.createCore(this.strictProgramImage);
      this.updateExecutionMetadata();
    }
    this.resetUndoHistory();
    this.debugSession.clearStop();
    this.debugSession.invalidateCallStack();
    this.reconcileRuntimeSyncVersions(before, true);
  }
}
