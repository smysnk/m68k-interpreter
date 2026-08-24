export { Emulator } from './core/emulator';
export type { InterruptRequestResult } from './core/emulator';
export { Memory } from './core/memory';
export {
  DEFAULT_MEMORY_BUFFER_PAGE_SIZE,
  MAX_MEMORY_BUFFER_ADDRESS,
  clearMemoryBuffer,
  clearMemoryBufferDirtyPages,
  cloneMemoryBuffer,
  createMemoryBuffer,
  exportMemoryBufferMap,
  getMemoryBufferAddressRange,
  getMemoryBufferDirtyPageIndices,
  getMemoryBufferPageCount,
  getMemoryBufferUsedByteCount,
  loadMemoryBufferBaseImage,
  readMemoryBufferByte,
  readMemoryBufferRange,
  resetMemoryBuffer,
  replaceMemoryBufferState,
  writeMemoryBufferByte,
  writeMemoryBufferRange,
} from './core/memoryBuffer';
export {
  BYTE_MASK,
  CODE_BYTE,
  CODE_LONG,
  CODE_WORD,
  WORD_MASK,
  addOP,
  clrOP,
  cmpOP,
  moveOP,
  tstOP,
} from './core/operations';
export { Strings } from './core/strings';
export type {
  CpuDiagnostic,
  CpuFault,
  DiagnosticSeverity,
  SourceSpan,
  StepResult,
} from './core/execution';
export * from './core/statusRegister';
export { TerminalDevice } from './devices/terminal';
export {
  DEFAULT_TERMINAL_BUFFER_COLUMNS,
  DEFAULT_TERMINAL_BUFFER_ROWS,
  TERMINAL_BUFFER_COLOR_DEFAULT,
  TERMINAL_BUFFER_FLAG_BOLD,
  TERMINAL_BUFFER_FLAG_INVERSE,
  TERMINAL_BUFFER_SPACE_BYTE,
  clearTerminalFrameBufferDirtyRows,
  createTerminalFrameBuffer,
  markTerminalFrameBufferRowDirty,
  readTerminalFrameBufferCell,
  readTerminalFrameBufferLine,
  readTerminalFrameBufferText,
  resetTerminalFrameBuffer,
  resizeTerminalFrameBuffer,
  writeTerminalFrameBufferCell,
} from './devices/terminalBuffer';
export { decodeTerminalByte, encodeTerminalByte } from './devices/terminalCharset';
export {
  cloneDecodedInstruction,
  decodeLoadedInstructions,
  resolveDecodedInstruction,
} from './instructionDecoder';
export { loadProgramSource } from './programLoader';
export { createProgramImage, findProgramSource } from './assembler/programImage';
export { assembleProgramSource } from './assembler/sourceAssembler';
export type { SourceAssemblyResult } from './assembler/sourceAssembler';
export {
  encodeSourceInstruction,
  estimateSourceInstructionLength,
} from './assembler/sourceEncoder';
export {
  encodeBranch,
  encodeIllegal,
  encodeMoveq,
  encodeNop,
  encodeReset,
  encodeRte,
  encodeRts,
  encodeStop,
  encodeTrap,
} from './assembler/encoder';
export { decodeBinaryInstruction } from './cpu/decoder';
export { classifyOpcodeWord } from './cpu/opcodeClassifier';
export { evaluateBranchCondition, evaluateConditionCode } from './cpu/conditions';
export {
  classifyEffectiveAddress,
  isEffectiveAddressAllowed,
  resolveEffectiveAddress,
} from './cpu/effectiveAddress';
export {
  CCR_MASK,
  FLAG_C,
  FLAG_N,
  FLAG_V,
  FLAG_X,
  FLAG_Z,
  addResult,
  compareResult,
  logicResult,
  signBit,
  signExtend,
  sizeMask,
  subResult,
  truncate,
} from './cpu/alu';
export { InstructionStream, signExtend8, signExtend16 } from './cpu/instructionStream';
export { StrictM68000Core } from './cpu/core';
export { BusFault, RamBus, SparseRamBus } from './cpu/memoryBus';
export { createAddressSpacePolicy } from './cpu/addressSpace';
export { TranslatingMemoryBus, AddressTranslationFault } from './cpu/addressTranslation';
export { CoprocessorRegistry } from './cpu/coprocessor';
export { MappedMemoryBus } from './machine/mappedMemoryBus';
export {
  BareMachineAdapter,
  Easy68kMachineAdapter,
  createMachineAdapter,
} from './machine/machineAdapter';
export { M68000State, M68kCpuState } from './cpu/state';
export type {
  ProgramImage,
  ProgramImageChunk,
  ProgramImageSegment,
  ProgramSourceMapEntry,
} from './assembler/programImage';
export type { BranchCondition } from './assembler/encoder';
export type { DecodedBinaryInstruction } from './cpu/decoder';
export type { OpcodeClassification } from './cpu/opcodeClassifier';
export type { M68kSystemSnapshot, StrictM68000CoreOptions } from './cpu/core';
export type {
  AddressRange,
  BusAccess,
  BusAccessContext,
  BusAccessInput,
  BusAccessSize,
  BusAccessType,
  BusFunctionCode,
  BusTraceEvent,
  BreakpointAcknowledgeEvent,
  MemoryBus,
  MemoryMappedDevice,
} from './cpu/memoryBus';
export type { MachineAdapter, MachineSnapshot, MachineTrapContext } from './machine/machineAdapter';
export type { CpuStateSnapshot, M68000StateOptions, M68kCpuStateOptions } from './cpu/state';
export {
  M68K_CONTROL_REGISTER,
  MC68010_CONTROL_REGISTER,
  controlRegistersForModel,
  controlRegisterFromSelector,
  maskControlRegisterValue,
} from './cpu/controlRegisters';
export type { Mc68010ControlRegister, M68kControlRegister } from './cpu/controlRegisters';
export { CPU_CAPABILITIES, cpuSupports, getCpuCapabilities } from './isa/cpuCapabilities';
export type { CpuCapabilities, CpuInstructionFeature } from './isa/cpuCapabilities';
export type { AddressSpacePolicy } from './cpu/addressSpace';
export {
  MC68020_EFFECTIVE_ADDRESS_MODES,
  decodeIndexedExtension,
  encodeIndexedExtension,
} from './cpu/effectiveAddressCodec';
export { decodeExceptionFrame, encodeExceptionFrame } from './cpu/exceptionFrames';
export type { DecodedExceptionFrame, ExceptionFrameInput } from './cpu/exceptionFrames';
export type {
  BriefIndexedExtension,
  Displacement,
  FullIndexedExtension,
  IndexedExtension,
  IndexRegister,
} from './cpu/effectiveAddressCodec';
export type {
  AddressTranslationPort,
  AddressTranslationRequest,
  AddressTranslationResult,
  AddressTranslationStateSnapshot,
} from './cpu/addressTranslation';
export type {
  CoprocessorDevice,
  CoprocessorOperation,
  CoprocessorRequest,
  CoprocessorResult,
  CoprocessorStateSnapshot,
} from './cpu/coprocessor';
export type {
  ModuleAccessPort,
  ModuleAccessResult,
  ModuleCallRequest,
  ModuleReturnRequest,
} from './cpu/moduleAccess';
export { NO_MODULE_ACCESS } from './cpu/moduleAccess';
export {
  MC68010_ARCHITECTURAL_DIFFERENCES,
  MC68010_DEFERRED_PHYSICAL_BUS_SCOPE,
  MC68010_INSTRUCTION_INVENTORY,
} from './isa/mc68010Inventory';
export type { Mc68010InstructionInventoryEntry } from './isa/mc68010Inventory';
export { MC68020_EXTENSION_LEGALITY, isMc68020ExtensionLegal } from './isa/mc68020Inventory';
export type { Mc68020ExtensionLegalityRule } from './isa/mc68020Inventory';
export {
  M68000_ISA_MANIFEST,
  MACHINE_COMPATIBILITY_EVIDENCE,
  summarizeIsaCoverage,
  validateIsaManifest,
} from './isa/manifest';
export {
  CPU_MODEL_REGISTRY,
  DEFAULT_EMULATION_CONFIG,
  LEGACY_CPU_PROFILE_CONFIG,
  MACHINE_PROFILE_REGISTRY,
  isCpuModel,
  isMachineProfile,
  normalizeEmulationConfig,
  toLegacyCpuProfile,
} from './isa/emulationConfig';
export type { CpuModelDefinition, MachineProfileDefinition } from './isa/emulationConfig';
export type {
  CpuModel,
  CpuProfile,
  CoprocessorAttachment,
  CoprocessorConfiguration,
  CoprocessorId,
  EmulationConfig,
  ExecutionAccuracy,
  EffectiveAddressClass,
  FlagEffect,
  InstructionEncoding,
  InstructionForm,
  InstructionSize,
  InstructionSupport,
  IsaCoverageSummary,
  IsaManifestValidationIssue,
  MachineCompatibilityEvidence,
  MachineProfile,
  M68kSystemConfiguration,
  StatusFlag,
} from './isa/types';
export * from './devices/deviceAddressMap';
export * from './devices/easy68kHardware';
export * from './devices/easy68kGraphics';
export * from './devices/easy68kSound';
export type { MemorySnapshot, MemoryUndoPageEntry } from './core/memory';
export type {
  MemoryBuffer,
  MemoryBufferAddressRange,
  MemoryBufferPage,
  MemoryBufferUndoPageEntry,
} from './core/memoryBuffer';
export type {
  ConditionFlags,
  EmulationStep,
  ExecutionState,
  InstructionSet,
  MemoryCell,
  MemoryMeta,
  RuntimeSyncVersions,
  Operand,
  Register,
  Registers,
  EmulatorConfig,
} from './types/emulator';
export type { EmulatorOptions, UndoCaptureMode } from './core/emulator';
export { DebugSession } from './debugger/debugSession';
export { evaluateDebuggerExpression } from './debugger/expression';
export type {
  DebugBreakpointKind,
  DebugBreakpointSpec,
  DebugCallFrame,
  DebugFrameKind,
  DebuggerConfiguration,
  DebuggerExpressionContext,
  DebugHitCondition,
  DebugProgramDescriptor,
  DebugRunMode,
  DebugSnapshot,
  DebugSourceLocation,
  DebugStop,
  DebugStopReason,
  DebugWatchExpression,
  DebugWatchValue,
  DebugWatchpointAccess,
  DebugWatchpointSpec,
  ResolvedDebugBreakpoint,
} from './debugger/types';
export type {
  TerminalCell,
  TerminalDeviceConfig,
  TerminalMeta,
  TerminalSnapshot,
  TerminalStyle,
} from './devices/terminal';
export type {
  TerminalFrameBuffer,
  TerminalFrameBufferCellSnapshot,
  TerminalFrameBufferCellWrite,
} from './devices/terminalBuffer';
export type { ProgramLoadResult, ProgramSource } from './programLoader';
export type { DecodedInstruction, DecodedOperand } from './instructionDecoder';
