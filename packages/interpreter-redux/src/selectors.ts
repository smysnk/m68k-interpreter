import type {
  InterpreterReducerState,
  TerminalCellState,
} from './state';

export interface InterpreterReduxRegisters {
  d0: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  d5: number;
  d6: number;
  d7: number;
  a0: number;
  a1: number;
  a2: number;
  a3: number;
  a4: number;
  a5: number;
  a6: number;
  a7: number;
  pc: number;
  ccr: number;
}

export interface InterpreterReduxFlags {
  z: number;
  v: number;
  n: number;
  c: number;
  x: number;
}

export interface InterpreterReduxTerminalSnapshot {
  columns: number;
  rows: number;
  cursorRow: number;
  cursorColumn: number;
  output: string;
  lines: string[];
  cells: TerminalCellState[][];
}

export function selectRegisters(state: InterpreterReducerState): InterpreterReduxRegisters {
  const registers = state.cpu.registers;

  return {
    d0: registers[8] ?? 0,
    d1: registers[9] ?? 0,
    d2: registers[10] ?? 0,
    d3: registers[11] ?? 0,
    d4: registers[12] ?? 0,
    d5: registers[13] ?? 0,
    d6: registers[14] ?? 0,
    d7: registers[15] ?? 0,
    a0: registers[0] ?? 0,
    a1: registers[1] ?? 0,
    a2: registers[2] ?? 0,
    a3: registers[3] ?? 0,
    a4: registers[4] ?? 0,
    a5: registers[5] ?? 0,
    a6: registers[6] ?? 0,
    a7: registers[7] ?? 0,
    pc: state.cpu.pc,
    ccr: state.cpu.ccr,
  };
}

export function selectFlags(state: InterpreterReducerState): InterpreterReduxFlags {
  const ccr = state.cpu.ccr;
  return {
    z: (ccr & 0x04) >>> 2,
    v: (ccr & 0x02) >>> 1,
    n: (ccr & 0x08) >>> 3,
    c: (ccr & 0x01) >>> 0,
    x: (ccr & 0x10) >>> 4,
  };
}

export function selectTerminalLines(state: InterpreterReducerState): string[] {
  return state.terminal.cells.map((row) => row.map((cell) => cell.char).join(''));
}

export function selectTerminalSnapshot(
  state: InterpreterReducerState
): InterpreterReduxTerminalSnapshot {
  return {
    columns: state.terminal.columns,
    rows: state.terminal.rows,
    cursorRow: state.terminal.cursorRow,
    cursorColumn: state.terminal.cursorColumn,
    output: state.terminal.output,
    lines: selectTerminalLines(state),
    cells: state.terminal.cells.map((row) => row.map((cell) => ({ ...cell }))),
  };
}

export function selectLastInstruction(state: InterpreterReducerState): string {
  return state.execution.lastInstruction;
}

export function selectErrors(state: InterpreterReducerState): string[] {
  return [...state.diagnostics.errors];
}

export function selectException(state: InterpreterReducerState): string | undefined {
  return state.diagnostics.exception;
}

export function selectIsHalted(state: InterpreterReducerState): boolean {
  return state.execution.halted;
}

export function selectIsWaitingForInput(state: InterpreterReducerState): boolean {
  return state.input.waitingForInput;
}
