import type { ProgramSource, TerminalSnapshot } from '@m68k/interpreter';
import {
  interpreterReduxActions,
  type InterpreterReduxAction,
} from './actions';
import {
  selectErrors,
  selectException,
  selectIsHalted,
  selectIsWaitingForInput,
  selectLastInstruction,
  selectTerminalSnapshot,
} from './selectors';
import type { InterpreterReducerState } from './state';
import type { ReducerInterpreterAdapter } from './session';

function normalizeQueuedInput(input: string | number | number[] | Uint8Array): number[] {
  if (typeof input === 'string') {
    return [...input].map((char) => char.charCodeAt(0) & 0xff);
  }

  if (typeof input === 'number') {
    return [input & 0xff];
  }

  return Array.from(input, (value) => value & 0xff);
}

export interface InterpreterReduxStoreBinding {
  dispatch(action: InterpreterReduxAction): unknown;
  getState(): InterpreterReducerState;
}

export interface StoreBackedReducerInterpreterAdapter extends ReducerInterpreterAdapter {
  setRegisterValue(register: number, value: number): void;
}

class ReduxStoreInterpreterAdapter implements StoreBackedReducerInterpreterAdapter {
  constructor(private readonly store: InterpreterReduxStoreBinding) {}

  dispatch(action: InterpreterReduxAction): InterpreterReducerState {
    this.store.dispatch(action);
    return this.store.getState();
  }

  loadProgram(program: ProgramSource): void {
    const state = this.store.getState();
    this.dispatch(
      interpreterReduxActions.programSourceLoaded({
        source: program,
        columns: state.terminal.columns,
        rows: state.terminal.rows,
      })
    );
  }

  resizeTerminal(columns: number, rows: number): void {
    this.dispatch(interpreterReduxActions.terminalResized({ columns, rows }));
  }

  emulationStep(): boolean {
    const state = this.store.getState();

    if (state.diagnostics.exception !== undefined || state.execution.halted) {
      return true;
    }

    this.dispatch(interpreterReduxActions.stepRequested());

    const nextState = this.store.getState();
    return (
      nextState.execution.halted ||
      nextState.diagnostics.exception !== undefined ||
      nextState.cpu.pc / 4 >= nextState.program.instructions.length
    );
  }

  queueInput(input: string | number | number[] | Uint8Array): void {
    this.dispatch(interpreterReduxActions.inputQueued(normalizeQueuedInput(input)));
  }

  clearInputQueue(): void {
    this.dispatch(interpreterReduxActions.inputCleared());
  }

  getQueuedInputLength(): number {
    return this.store.getState().input.queue.length;
  }

  reset(): void {
    this.dispatch(interpreterReduxActions.resetRequested());
  }

  undoFromStack(): void {
    this.dispatch(interpreterReduxActions.undoRequested());
  }

  getState(): InterpreterReducerState {
    return this.store.getState();
  }

  getRegisters(): Int32Array {
    return Int32Array.from(this.store.getState().cpu.registers);
  }

  getMemory(): Record<number, number> {
    const memory = this.store.getState().memory;
    return {
      ...memory.baseBytes,
      ...memory.overrides,
    };
  }

  getPC(): number {
    return this.store.getState().cpu.pc;
  }

  getCCR(): number {
    return this.store.getState().cpu.ccr;
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return selectTerminalSnapshot(this.store.getState());
  }

  getException(): string | undefined {
    return selectException(this.store.getState());
  }

  getErrors(): string[] {
    return selectErrors(this.store.getState());
  }

  getLastInstruction(): string {
    return selectLastInstruction(this.store.getState());
  }

  isHalted(): boolean {
    return selectIsHalted(this.store.getState());
  }

  isWaitingForInput(): boolean {
    return selectIsWaitingForInput(this.store.getState());
  }

  getSymbols(): Record<string, number> {
    return { ...this.store.getState().program.symbols };
  }

  getSymbolAddress(symbol: string): number | undefined {
    return this.store.getState().program.symbolLookup[symbol.trim().toLowerCase()];
  }

  getZFlag(): number {
    return (this.store.getState().cpu.ccr & 0x04) >>> 2;
  }

  getVFlag(): number {
    return (this.store.getState().cpu.ccr & 0x02) >>> 1;
  }

  getNFlag(): number {
    return (this.store.getState().cpu.ccr & 0x08) >>> 3;
  }

  getCFlag(): number {
    return this.store.getState().cpu.ccr & 0x01;
  }

  getXFlag(): number {
    return (this.store.getState().cpu.ccr & 0x10) >>> 4;
  }

  setRegisterValue(register: number, value: number): void {
    this.dispatch(interpreterReduxActions.registerValueSet({ register, value }));
  }
}

export function createStoreBackedReducerInterpreterAdapter(
  store: InterpreterReduxStoreBinding
): StoreBackedReducerInterpreterAdapter {
  return new ReduxStoreInterpreterAdapter(store);
}
