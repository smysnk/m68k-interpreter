/**
 * Type definitions for the M68K interpreter
 */

export interface Register {
  name: string;
  value: number;
  type: 'data' | 'address' | 'control';
}

export interface Registers {
  d0: number; // Data registers
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  d5: number;
  d6: number;
  d7: number;
  a0: number; // Address registers
  a1: number;
  a2: number;
  a3: number;
  a4: number;
  a5: number;
  a6: number;
  a7: number; // Stack pointer
  pc: number; // Program counter
  ccr: number; // Condition code register
  sr: number; // Status register view
  usp: number; // User stack pointer view
  ssp: number; // Supervisor stack pointer view
  vbr?: number; // MC68010 vector base register
  sfc?: number; // MC68010 source function code
  dfc?: number; // MC68010 destination function code
  isp?: number; // MC68020 interrupt stack pointer
  msp?: number; // MC68020 master stack pointer
  cacr?: number; // MC68020 cache control register
  caar?: number; // MC68020 cache address register
}

export interface ConditionFlags {
  z: number; // Zero
  v: number; // Overflow
  n: number; // Negative
  c: number; // Carry
  x: number; // Extend
}

export interface MemoryCell {
  [address: number]: number;
}

export interface MemoryMeta {
  usedBytes: number;
  minAddress: number | null;
  maxAddress: number | null;
  version: number;
}

export interface RuntimeSyncVersions {
  registers: number;
  execution: number;
  diagnostics: number;
  debugger?: number;
  memory: number;
  terminal: number;
  terminalGeometry: number;
  hardware?: number;
  graphics?: number;
  sound?: number;
}

export interface ExecutionState {
  started: boolean;
  ended: boolean;
  stopped: boolean;
  lastInstruction: string;
  exception: string | null;
  errors: string[];
  currentLine: number;
}

export interface EmulationStep {
  registers: Partial<Registers>;
  memory: MemoryCell;
  flags: ConditionFlags;
  pc: number;
  instruction: string;
  error?: string;
}

export interface InstructionSet {
  mnemonic: string;
  operands: number;
  execute: (emulator: Emulator, operands: Operand[]) => void;
}

export interface Operand {
  type: 'register' | 'immediate' | 'memory' | 'address';
  value: number | string;
  size: 'b' | 'w' | 'l'; // byte, word, long
}

export interface EmulatorConfig {
  program: string;
  baseAddress?: number;
  memorySize?: number;
}

export interface Emulator {
  registers: Registers;
  memory: MemoryCell;
  flags: ConditionFlags;
  pc: number;
  getRegisters(): Registers;
  getRegisterSnapshot(): Int32Array;
  setRegisterValue(register: number, value: number): void;
  getCCR(): number;
  getSR(): number;
  getUSP(): number;
  getSSP(): number;
  getVBR(): number;
  getSFC(): number;
  getDFC(): number;
  getISP(): number;
  getMSP(): number;
  getCACR(): number;
  getCAAR(): number;
  setControlRegisterValue(
    register: 'vbr' | 'sfc' | 'dfc' | 'isp' | 'msp' | 'cacr' | 'caar',
    value: number
  ): void;
  getMemory(): MemoryCell;
  getMemoryMeta(): MemoryMeta;
  getRuntimeSyncVersions(): RuntimeSyncVersions;
  getCpuProfile(): import('../isa/types').CpuProfile;
  getEmulationConfig(): Readonly<import('../isa/types').EmulationConfig>;
  getMachineProfile(): import('../isa/types').MachineProfile;
  getDiagnostics(): import('../core/execution').CpuDiagnostic[];
  readMemoryRange(address: number, length: number): Uint8Array;
  getFlags(): ConditionFlags;
  getPC(): number;
  step(): boolean; // Returns true if execution ended
  stepInstruction(): import('../core/execution').StepResult;
  reset(): void;
  undo(): void;
  getLastInstruction(): string;
  getErrors(): string[];
  getException(): string | null;
  writeMemoryByte(address: number, value: number): void;
  writeMemoryWord(address: number, value: number): void;
  writeMemoryLong(address: number, value: number): void;
  getHardwareSnapshot(): import('../devices/easy68kHardware').Easy68kHardwareSnapshot;
  getGraphicsState(): import('../devices/easy68kGraphics').Easy68kGraphicsState | undefined;
  consumeGraphicsPatch(
    forceFull?: boolean
  ): import('../devices/easy68kGraphics').Easy68kGraphicsPatch | undefined;
  getSoundSnapshot(
    includeCommands?: boolean
  ): import('../devices/easy68kSound').Easy68kSoundSnapshot | undefined;
  registerSoundAssets(
    assets: readonly import('../devices/easy68kSound').Easy68kSoundAsset[]
  ): import('../devices/easy68kSound').Easy68kSoundAsset[];
  completeSoundVoice(voiceId: number): void;
  stopAllSounds(): void;
  stopSoundReference(player: 'standard' | 'polyphonic', reference: number): boolean;
  configureHardware(
    config: import('../devices/easy68kHardware').Easy68kHardwareConfig
  ): import('../devices/easy68kHardware').Easy68kHardwareValidationResult;
  configureHardwareDevices(
    configs: readonly import('../devices/easy68kHardware').Easy68kHardwareDeviceConfig[]
  ): import('../devices/easy68kHardware').Easy68kHardwareValidationResult;
  configureHardwareDevice(
    deviceId: string,
    config: import('../devices/easy68kHardware').Easy68kHardwareConfig
  ): import('../devices/easy68kHardware').Easy68kHardwareValidationResult;
  setHardwareToggle(bit: number, enabled: boolean, deviceId?: string): void;
  setHardwareButton(bit: number, pressed: boolean, deviceId?: string): void;
  requestInterruptLevel(level: number): import('../core/emulator').InterruptRequestResult;
  getPendingInterruptLevels(): number[];
  raiseExternalInterrupt(handlerAddress: number): boolean;
}
