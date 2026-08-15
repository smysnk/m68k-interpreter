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
export { evaluateBranchCondition } from './cpu/conditions';
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
export { BusFault, RamBus } from './cpu/memoryBus';
export { M68000State } from './cpu/state';
export type {
  ProgramImage,
  ProgramImageChunk,
  ProgramSourceMapEntry,
} from './assembler/programImage';
export type { BranchCondition } from './assembler/encoder';
export type { DecodedBinaryInstruction } from './cpu/decoder';
export type { StrictM68000CoreOptions } from './cpu/core';
export type { BusAccess, BusAccessSize, BusAccessType, MemoryBus } from './cpu/memoryBus';
export type { M68000StateOptions } from './cpu/state';
export { M68000_ISA_MANIFEST, summarizeIsaCoverage, validateIsaManifest } from './isa/manifest';
export type {
  CpuProfile,
  EffectiveAddressClass,
  FlagEffect,
  InstructionEncoding,
  InstructionForm,
  InstructionSize,
  InstructionSupport,
  IsaCoverageSummary,
  IsaManifestValidationIssue,
  StatusFlag,
} from './isa/types';
export * from './devices/deviceAddressMap';
export * from './devices/easy68kHardware';
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
