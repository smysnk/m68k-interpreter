import type {
  ProgramSource,
  TerminalFrameBuffer,
  TerminalMeta,
  TerminalSnapshot,
} from '@m68k/interpreter';
import { interpreterReduxActions, type InterpreterReduxAction } from './actions';
import {
  selectErrors,
  selectException,
  selectIsHalted,
  selectIsWaitingForInput,
  selectLastInstruction,
} from './selectors';
import type { InterpreterReducerState } from './state';
import type { ReducerInterpreterAdapter } from './session';
import { ReducerRuntimeStore } from './runtimeStore';

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
  getRuntimeStore?(): ReducerRuntimeStore;
}

export interface StoreBackedReducerInterpreterAdapter extends ReducerInterpreterAdapter {
  setRegisterValue(register: number, value: number): void;
}

class ReduxStoreInterpreterAdapter implements StoreBackedReducerInterpreterAdapter {
  private readonly runtimeStore: ReducerRuntimeStore;
  private readonly usesExternalRuntimeStore: boolean;

  constructor(private readonly store: InterpreterReduxStoreBinding) {
    const externalRuntimeStore = this.store.getRuntimeStore?.();

    if (externalRuntimeStore) {
      this.runtimeStore = externalRuntimeStore;
      this.usesExternalRuntimeStore = true;
      return;
    }

    this.runtimeStore = new ReducerRuntimeStore(this.store.getState());
    this.usesExternalRuntimeStore = false;
    this.syncBoundStore();
  }

  private syncBoundStore(): void {
    if (this.usesExternalRuntimeStore) {
      return;
    }

    this.store.dispatch(
      interpreterReduxActions.runtimeStateHydrated(this.runtimeStore.getState())
    );
  }

  private dispatchIntent(action: InterpreterReduxAction): InterpreterReducerState {
    if (this.usesExternalRuntimeStore) {
      this.store.dispatch(action);
      return this.store.getState();
    }

    const nextState = this.runtimeStore.dispatch(action);
    this.syncBoundStore();
    return nextState;
  }

  dispatch(action: InterpreterReduxAction): InterpreterReducerState {
    return this.dispatchIntent(action);
  }

  loadProgram(program: ProgramSource): void {
    this.dispatchIntent(
      interpreterReduxActions.programSourceLoaded({
        source: program,
        columns: this.getTerminalMeta().columns,
        rows: this.getTerminalMeta().rows,
      })
    );
  }

  resizeTerminal(columns: number, rows: number): void {
    this.dispatchIntent(interpreterReduxActions.terminalResized({ columns, rows }));
  }

  emulationStep(): boolean {
    const state = this.runtimeStore.getState();

    if (state.diagnostics.exception !== undefined || state.execution.halted) {
      return true;
    }

    if (this.usesExternalRuntimeStore) {
      this.store.dispatch(interpreterReduxActions.stepRequested());
      const nextState = this.runtimeStore.getState();
      return (
        nextState.diagnostics.exception !== undefined ||
        nextState.execution.halted ||
        nextState.cpu.pc / 4 >= nextState.program.instructions.length
      );
    }

    const finished = this.runtimeStore.step();
    this.syncBoundStore();
    return finished;
  }

  queueInput(input: string | number | number[] | Uint8Array): void {
    this.dispatchIntent(interpreterReduxActions.inputQueued(normalizeQueuedInput(input)));
  }

  clearInputQueue(): void {
    this.dispatchIntent(interpreterReduxActions.inputCleared());
  }

  getQueuedInputLength(): number {
    return this.runtimeStore.getState().input.queue.length;
  }

  reset(): void {
    if (this.usesExternalRuntimeStore) {
      this.store.dispatch(interpreterReduxActions.resetRequested());
      return;
    }

    this.runtimeStore.reset();
    this.syncBoundStore();
  }

  undoFromStack(): void {
    if (this.usesExternalRuntimeStore) {
      this.store.dispatch(interpreterReduxActions.undoRequested());
      return;
    }

    this.runtimeStore.undo();
    this.syncBoundStore();
  }

  getState(): InterpreterReducerState {
    return this.runtimeStore.getState();
  }

  getRegisters(): Int32Array {
    return Int32Array.from(this.runtimeStore.getState().cpu.registers);
  }

  getMemory(): Record<number, number> {
    return this.runtimeStore.getMemory();
  }

  getMemoryMeta(): InterpreterReducerState['memory'] {
    return this.runtimeStore.getMemoryMeta();
  }

  readMemoryRange(address: number, length: number): Uint8Array {
    return this.runtimeStore.readMemoryRange(address, length);
  }

  getPC(): number {
    return this.runtimeStore.getState().cpu.pc;
  }

  getCCR(): number {
    return this.runtimeStore.getState().cpu.ccr;
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return this.runtimeStore.getTerminalSnapshot();
  }

  getTerminalDebugSnapshot(): TerminalSnapshot {
    return this.runtimeStore.getTerminalSnapshot();
  }

  getTerminalFrameBuffer(): TerminalFrameBuffer {
    return this.runtimeStore.getTerminalFrameBuffer();
  }

  getTerminalMeta(): TerminalMeta {
    return this.runtimeStore.getTerminalMeta();
  }

  getTerminalLines(): string[] {
    return this.runtimeStore.getTerminalLines();
  }

  getTerminalText(): string {
    return this.runtimeStore.getTerminalText();
  }

  getException(): string | undefined {
    return selectException(this.runtimeStore.getState());
  }

  getErrors(): string[] {
    return selectErrors(this.runtimeStore.getState());
  }

  getLastInstruction(): string {
    return selectLastInstruction(this.runtimeStore.getState());
  }

  isHalted(): boolean {
    return selectIsHalted(this.runtimeStore.getState());
  }

  isWaitingForInput(): boolean {
    return selectIsWaitingForInput(this.runtimeStore.getState());
  }

  getSymbols(): Record<string, number> {
    return { ...this.runtimeStore.getState().program.symbols };
  }

  getSymbolAddress(symbol: string): number | undefined {
    return this.runtimeStore.getState().program.symbolLookup[symbol.trim().toLowerCase()];
  }

  getZFlag(): number {
    return (this.runtimeStore.getState().cpu.ccr & 0x04) >>> 2;
  }

  getVFlag(): number {
    return (this.runtimeStore.getState().cpu.ccr & 0x02) >>> 1;
  }

  getNFlag(): number {
    return (this.runtimeStore.getState().cpu.ccr & 0x08) >>> 3;
  }

  getCFlag(): number {
    return this.runtimeStore.getState().cpu.ccr & 0x01;
  }

  getXFlag(): number {
    return (this.runtimeStore.getState().cpu.ccr & 0x10) >>> 4;
  }

  setRegisterValue(register: number, value: number): void {
    this.dispatchIntent(interpreterReduxActions.registerValueSet({ register, value }));
  }
}

export function createStoreBackedReducerInterpreterAdapter(
  store: InterpreterReduxStoreBinding
): StoreBackedReducerInterpreterAdapter {
  return new ReduxStoreInterpreterAdapter(store);
}
