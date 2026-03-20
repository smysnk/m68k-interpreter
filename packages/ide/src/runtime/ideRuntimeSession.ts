import type { Emulator } from '@m68k/interpreter';

export type IdeRuntimeSession = Pick<
  Emulator,
  | 'clearInputQueue'
  | 'emulationStep'
  | 'getCFlag'
  | 'getErrors'
  | 'getException'
  | 'getLastInstruction'
  | 'getMemory'
  | 'getNFlag'
  | 'getPC'
  | 'getQueuedInputLength'
  | 'getRegisters'
  | 'getSymbolAddress'
  | 'getSymbols'
  | 'getTerminalFrameBuffer'
  | 'getTerminalLines'
  | 'getTerminalMeta'
  | 'getTerminalText'
  | 'getTerminalSnapshot'
  | 'getVFlag'
  | 'getXFlag'
  | 'getZFlag'
  | 'isHalted'
  | 'isWaitingForInput'
  | 'queueInput'
  | 'reset'
  | 'undoFromStack'
> & {
  setRegisterValue?: (register: number, value: number) => void;
  resizeTerminal?: (columns: number, rows: number) => void;
};
