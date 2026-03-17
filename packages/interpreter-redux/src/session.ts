import type { Emulator, ProgramSource, TerminalSnapshot } from '@m68k/interpreter';
import { interpreterReduxActions, type InterpreterReduxAction } from './actions';
import { createInterpreterReduxStateForProgram } from './instructionReducer';
import { interpreterReducer } from './reducer';
import {
  selectErrors,
  selectException,
  selectIsHalted,
  selectIsWaitingForInput,
  selectLastInstruction,
  selectTerminalSnapshot,
} from './selectors';
import type { InterpreterReducerState } from './state';

type EmulatorCompatibleContract = Pick<
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
  | 'getTerminalSnapshot'
  | 'getVFlag'
  | 'getXFlag'
  | 'getZFlag'
  | 'isHalted'
  | 'isWaitingForInput'
  | 'queueInput'
  | 'reset'
  | 'undoFromStack'
>;

export interface ReducerInterpreterAdapter extends EmulatorCompatibleContract {
  dispatch(action: InterpreterReduxAction): InterpreterReducerState;
  getCCR(): number;
  getState(): InterpreterReducerState;
  loadProgram(program: ProgramSource): void;
  resizeTerminal(columns: number, rows: number): void;
}

function shouldStopBeforeStep(state: InterpreterReducerState): boolean {
  return (
    state.diagnostics.exception !== undefined ||
    state.execution.halted ||
    state.cpu.pc / 4 >= state.program.instructions.length
  );
}

function normalizeQueuedInput(input: string | number | number[] | Uint8Array): number[] {
  if (typeof input === 'string') {
    return [...input].map((char) => char.charCodeAt(0) & 0xff);
  }

  if (typeof input === 'number') {
    return [input & 0xff];
  }

  return Array.from(input, (value) => value & 0xff);
}

export class ReducerInterpreterSession implements ReducerInterpreterAdapter {
  private state: InterpreterReducerState;

  constructor(program: ProgramSource = '') {
    this.state = createInterpreterReduxStateForProgram(program);
  }

  dispatch(action: InterpreterReduxAction): InterpreterReducerState {
    if (action.type === 'stepRequested') {
      this.state = interpreterReducer(this.state, action);
      return this.state;
    }

    this.state = interpreterReducer(this.state, action);
    return this.state;
  }

  loadProgram(program: ProgramSource): void {
    this.state = createInterpreterReduxStateForProgram(program, {
      columns: this.state.terminal.columns,
      rows: this.state.terminal.rows,
    });
  }

  resizeTerminal(columns: number, rows: number): void {
    this.state = interpreterReducer(
      this.state,
      interpreterReduxActions.terminalResized({ columns, rows })
    );
  }

  emulationStep(): boolean {
    if (this.state.cpu.pc / 4 >= this.state.program.instructions.length) {
      const lastInstruction = this.state.program.instructions[this.state.program.instructions.length - 1]?.[0];
      if (lastInstruction !== undefined) {
        this.state = {
          ...this.state,
          execution: {
            ...this.state.execution,
            lastInstruction,
          },
        };
      }

      return true;
    }

    if (shouldStopBeforeStep(this.state)) {
      return true;
    }

    this.state = interpreterReducer(this.state, interpreterReduxActions.stepRequested());
    return this.state.execution.halted || this.state.diagnostics.exception !== undefined;
  }

  queueInput(input: string | number | number[] | Uint8Array): void {
    this.state = interpreterReducer(
      this.state,
      interpreterReduxActions.inputQueued(normalizeQueuedInput(input))
    );
  }

  clearInputQueue(): void {
    this.state = {
      ...this.state,
      input: {
        ...this.state.input,
        queue: [],
      },
    };
  }

  getQueuedInputLength(): number {
    return this.state.input.queue.length;
  }

  reset(): void {
    this.state = interpreterReducer(this.state, interpreterReduxActions.resetRequested());
  }

  undoFromStack(): void {
    this.state = interpreterReducer(this.state, interpreterReduxActions.undoRequested());
  }

  getState(): InterpreterReducerState {
    return this.state;
  }

  getRegisters(): Int32Array {
    return Int32Array.from(this.state.cpu.registers);
  }

  getMemory(): Record<number, number> {
    return { ...this.state.memory.bytes };
  }

  getPC(): number {
    return this.state.cpu.pc;
  }

  getCCR(): number {
    return this.state.cpu.ccr;
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return selectTerminalSnapshot(this.state);
  }

  getException(): string | undefined {
    return selectException(this.state);
  }

  getErrors(): string[] {
    return selectErrors(this.state);
  }

  getLastInstruction(): string {
    return selectLastInstruction(this.state);
  }

  isHalted(): boolean {
    return selectIsHalted(this.state);
  }

  isWaitingForInput(): boolean {
    return selectIsWaitingForInput(this.state);
  }

  getSymbols(): Record<string, number> {
    return { ...this.state.program.symbols };
  }

  getSymbolAddress(symbol: string): number | undefined {
    return this.state.program.symbolLookup[symbol.trim().toLowerCase()];
  }

  getZFlag(): number {
    return (this.state.cpu.ccr & 0x04) >>> 2;
  }

  getVFlag(): number {
    return (this.state.cpu.ccr & 0x02) >>> 1;
  }

  getNFlag(): number {
    return (this.state.cpu.ccr & 0x08) >>> 3;
  }

  getCFlag(): number {
    return this.state.cpu.ccr & 0x01;
  }

  getXFlag(): number {
    return (this.state.cpu.ccr & 0x10) >>> 4;
  }
}

export function createReducerInterpreterSession(
  program: ProgramSource = ''
): ReducerInterpreterAdapter {
  return new ReducerInterpreterSession(program);
}
