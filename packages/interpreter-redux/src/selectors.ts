import type { TerminalSnapshot } from '@m68k/interpreter';
import type { InterpreterReducerState } from './state';
import { createReducerTerminalLines, createReducerTerminalSnapshot } from './terminalRuntime';

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
  sr: number;
  usp: number;
  ssp: number;
}

export interface InterpreterReduxFlags {
  z: number;
  v: number;
  n: number;
  c: number;
  x: number;
}

export type InterpreterReduxTerminalSnapshot = TerminalSnapshot;

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
    sr: state.cpu.ccr & 0x1f,
    usp: registers[7] ?? 0,
    ssp: registers[7] ?? 0,
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
  return createReducerTerminalLines(state.terminal);
}

export function selectTerminalSnapshot(
  state: InterpreterReducerState
): InterpreterReduxTerminalSnapshot {
  return createReducerTerminalSnapshot(state.terminal);
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
