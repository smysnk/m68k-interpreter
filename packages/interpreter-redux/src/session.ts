import type {
  Emulator,
  ProgramSource,
  TerminalFrameBuffer,
  TerminalMeta,
  TerminalSnapshot,
} from '@m68k/interpreter';
import { interpreterReduxActions, type InterpreterReduxAction } from './actions';
import { createInterpreterReduxStateForProgram } from './instructionReducer';
import { selectErrors, selectException, selectIsHalted, selectIsWaitingForInput, selectLastInstruction } from './selectors';
import type { InterpreterReducerState } from './state';
import { ReducerRuntimeStore } from './runtimeStore';

type EmulatorCompatibleContract = Pick<
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
  | 'getTerminalLines'
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
>;

export interface ReducerInterpreterAdapter extends EmulatorCompatibleContract {
  dispatch(action: InterpreterReduxAction): InterpreterReducerState;
  getCCR(): number;
  getTerminalFrameBuffer(): TerminalFrameBuffer;
  getTerminalMeta(): TerminalMeta;
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
  private readonly runtimeStore: ReducerRuntimeStore;

  constructor(program: ProgramSource = '') {
    this.runtimeStore = new ReducerRuntimeStore(createInterpreterReduxStateForProgram(program));
  }

  dispatch(action: InterpreterReduxAction): InterpreterReducerState {
    return this.runtimeStore.dispatch(action);
  }

  loadProgram(program: ProgramSource): void {
    this.runtimeStore.loadProgram(program);
  }

  resizeTerminal(columns: number, rows: number): void {
    this.runtimeStore.resizeTerminal(columns, rows);
  }

  emulationStep(): boolean {
    const state = this.runtimeStore.getState();

    if (state.cpu.pc / 4 >= state.program.instructions.length) {
      const lastInstruction = state.program.instructions[state.program.instructions.length - 1]?.[0];
      if (lastInstruction !== undefined) {
        this.runtimeStore.dispatch(
          interpreterReduxActions.runtimeStateHydrated({
            ...state,
            execution: {
              ...state.execution,
              lastInstruction,
            },
          })
        );
      }

      return true;
    }

    if (shouldStopBeforeStep(state)) {
      return true;
    }

    return this.runtimeStore.step();
  }

  queueInput(input: string | number | number[] | Uint8Array): void {
    this.runtimeStore.queueInput(normalizeQueuedInput(input));
  }

  clearInputQueue(): void {
    this.runtimeStore.clearInputQueue();
  }

  getQueuedInputLength(): number {
    return this.runtimeStore.getState().input.queue.length;
  }

  reset(): void {
    this.runtimeStore.reset();
  }

  undoFromStack(): void {
    this.runtimeStore.undo();
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

  getSR(): number {
    return this.runtimeStore.getState().cpu.ccr & 0x1f;
  }

  getUSP(): number {
    return this.runtimeStore.getState().cpu.registers[7] >>> 0;
  }

  getSSP(): number {
    return this.runtimeStore.getState().cpu.registers[7] >>> 0;
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
}

export function createReducerInterpreterSession(
  program: ProgramSource = ''
): ReducerInterpreterAdapter {
  return new ReducerInterpreterSession(program);
}
