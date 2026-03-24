import type { Emulator } from '@m68k/interpreter';

export type IdeRuntimeSession = Pick<
  Emulator,
  | 'clearInputQueue'
  | 'emulationStep'
  | 'getCFlag'
  | 'getCCR'
  | 'getErrors'
  | 'getException'
  | 'getLastInstruction'
  | 'getMemory'
  | 'getMemoryMeta'
  | 'getNFlag'
  | 'getPC'
  | 'getQueuedInputLength'
  | 'getRegisters'
  | 'getSR'
  | 'getSSP'
  | 'readMemoryRange'
  | 'getSymbolAddress'
  | 'getSymbols'
  | 'getTerminalFrameBuffer'
  | 'getTerminalLines'
  | 'getTerminalMeta'
  | 'getTerminalText'
  | 'getTerminalSnapshot'
  | 'getUSP'
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
