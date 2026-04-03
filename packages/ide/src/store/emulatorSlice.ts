import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  ConditionFlags,
  ExecutionState,
  MemoryMeta,
  Registers,
  TerminalMeta,
  TerminalSnapshot,
} from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';

export interface RuntimeMetrics {
  lastFrameInstructions: number;
  lastFrameDurationMs: number;
  lastStopReason: string;
}

export interface RuntimeIntentState {
  run: number;
  resume: number;
  pulseResume: number;
  step: number;
  undo: number;
  reset: number;
  focusTerminal: number;
}

export interface TerminalRuntimeState {
  columns: number;
  rows: number;
  cursorRow: number;
  cursorColumn: number;
  version: number;
  geometryVersion: number;
}

export interface EmulatorState {
  editorCode: string;
  registers: Registers;
  memory: MemoryMeta;
  flags: ConditionFlags;
  executionState: ExecutionState;
  emulatorInstance: IdeRuntimeSession | null;
  terminal: TerminalRuntimeState;
  showFlags: boolean;
  delay: number;
  speedMultiplier: number;
  runtimeMetrics: RuntimeMetrics;
  runtimeIntents: RuntimeIntentState;
  history: Array<{
    registers: Registers;
    flags: ConditionFlags;
    pc: number;
  }>;
}

export const initialRegisters: Registers = {
  d0: 0,
  d1: 0,
  d2: 0,
  d3: 0,
  d4: 0,
  d5: 0,
  d6: 0,
  d7: 0,
  a0: 0,
  a1: 0,
  a2: 0,
  a3: 0,
  a4: 0,
  a5: 0,
  a6: 0,
  a7: 0,
  pc: 0x01000,
  ccr: 0,
  sr: 0,
  usp: 0,
  ssp: 0,
};

export const initialFlags: ConditionFlags = {
  z: 0,
  v: 0,
  n: 0,
  c: 0,
  x: 0,
};

export const initialExecutionState: ExecutionState = {
  started: false,
  ended: false,
  stopped: false,
  lastInstruction: 'Ready',
  exception: null,
  errors: [],
  currentLine: 0,
};

export const initialRuntimeMetrics: RuntimeMetrics = {
  lastFrameInstructions: 0,
  lastFrameDurationMs: 0,
  lastStopReason: 'idle',
};

export const initialRuntimeIntents: RuntimeIntentState = {
  run: 0,
  resume: 0,
  pulseResume: 0,
  step: 0,
  undo: 0,
  reset: 0,
  focusTerminal: 0,
};

export function createEmptyMemoryState(): MemoryMeta {
  return {
    usedBytes: 0,
    minAddress: null,
    maxAddress: null,
    version: 1,
  };
}

export function toTerminalRuntimeState(
  terminal:
    | TerminalRuntimeState
    | Pick<
        TerminalMeta,
        'columns' | 'rows' | 'cursorRow' | 'cursorColumn' | 'version' | 'geometryVersion'
      >
    | Pick<TerminalSnapshot, 'columns' | 'rows' | 'cursorRow' | 'cursorColumn'>
): TerminalRuntimeState {
  return {
    columns: terminal.columns,
    rows: terminal.rows,
    cursorRow: terminal.cursorRow,
    cursorColumn: terminal.cursorColumn,
    version: 'version' in terminal ? terminal.version : 1,
    geometryVersion: 'geometryVersion' in terminal ? terminal.geometryVersion : 1,
  };
}

export function createEmptyTerminalState(columns = 80, rows = 25): TerminalRuntimeState {
  return {
    columns,
    rows,
    cursorRow: 0,
    cursorColumn: 0,
    version: 1,
    geometryVersion: 1,
  };
}

export const initialEditorCode = `ORG $1000
  * Write your M68K assembly code here
  * Your code goes here
END`;

const initialState: EmulatorState = {
  editorCode: initialEditorCode,
  registers: initialRegisters,
  memory: createEmptyMemoryState(),
  flags: initialFlags,
  executionState: initialExecutionState,
  emulatorInstance: null,
  terminal: createEmptyTerminalState(),
  showFlags: false,
  delay: 0,
  speedMultiplier: 1,
  runtimeMetrics: initialRuntimeMetrics,
  runtimeIntents: initialRuntimeIntents,
  history: [],
};

function registersEqual(left: Registers, right: Registers): boolean {
  return (
    left.d0 === right.d0 &&
    left.d1 === right.d1 &&
    left.d2 === right.d2 &&
    left.d3 === right.d3 &&
    left.d4 === right.d4 &&
    left.d5 === right.d5 &&
    left.d6 === right.d6 &&
    left.d7 === right.d7 &&
    left.a0 === right.a0 &&
    left.a1 === right.a1 &&
    left.a2 === right.a2 &&
    left.a3 === right.a3 &&
    left.a4 === right.a4 &&
    left.a5 === right.a5 &&
    left.a6 === right.a6 &&
    left.a7 === right.a7 &&
    left.pc === right.pc &&
    left.ccr === right.ccr &&
    left.sr === right.sr &&
    left.usp === right.usp &&
    left.ssp === right.ssp
  );
}

function flagsEqual(left: ConditionFlags, right: ConditionFlags): boolean {
  return (
    left.z === right.z &&
    left.v === right.v &&
    left.n === right.n &&
    left.c === right.c &&
    left.x === right.x
  );
}

function memoryMetaEqual(left: MemoryMeta, right: MemoryMeta): boolean {
  return (
    left.usedBytes === right.usedBytes &&
    left.minAddress === right.minAddress &&
    left.maxAddress === right.maxAddress &&
    left.version === right.version
  );
}

function terminalStateEqual(left: TerminalRuntimeState, right: TerminalRuntimeState): boolean {
  return (
    left.columns === right.columns &&
    left.rows === right.rows &&
    left.cursorRow === right.cursorRow &&
    left.cursorColumn === right.cursorColumn &&
    left.version === right.version &&
    left.geometryVersion === right.geometryVersion
  );
}

function executionStateEqual(left: ExecutionState, right: ExecutionState): boolean {
  return (
    left.started === right.started &&
    left.ended === right.ended &&
    left.stopped === right.stopped &&
    left.lastInstruction === right.lastInstruction &&
    left.exception === right.exception &&
    left.currentLine === right.currentLine &&
    left.errors === right.errors
  );
}

function runtimeMetricsEqual(left: RuntimeMetrics, right: RuntimeMetrics): boolean {
  return (
    left.lastFrameInstructions === right.lastFrameInstructions &&
    left.lastFrameDurationMs === right.lastFrameDurationMs &&
    left.lastStopReason === right.lastStopReason
  );
}

const emulatorSlice = createSlice({
  name: 'emulator',
  initialState,
  reducers: {
    setEditorCode(state, action: PayloadAction<string>) {
      state.editorCode = action.payload;
    },
    setRegisters(state, action: PayloadAction<Partial<Registers>>) {
      state.registers = { ...state.registers, ...action.payload };
    },
    setMemory(state, action: PayloadAction<MemoryMeta>) {
      state.memory = action.payload;
    },
    setFlags(state, action: PayloadAction<Partial<ConditionFlags>>) {
      state.flags = { ...state.flags, ...action.payload };
    },
    setExecutionState(state, action: PayloadAction<Partial<ExecutionState>>) {
      state.executionState = { ...state.executionState, ...action.payload };
    },
    setEmulatorInstance(state, action: PayloadAction<IdeRuntimeSession | null>) {
      state.emulatorInstance = action.payload;
    },
    setTerminalState(
      state,
      action: PayloadAction<TerminalRuntimeState | TerminalMeta | TerminalSnapshot>
    ) {
      const nextTerminal = toTerminalRuntimeState(action.payload);
      if (!terminalStateEqual(state.terminal, nextTerminal)) {
        state.terminal = nextTerminal;
      }
    },
    syncEmulatorFrame(
      state,
      action: PayloadAction<{
        registers?: Registers;
        memory?: MemoryMeta;
        flags?: ConditionFlags;
        terminal?: TerminalRuntimeState | TerminalMeta;
        executionState?: Partial<ExecutionState>;
        runtimeMetrics?: Partial<RuntimeMetrics>;
      }>
    ) {
      if (action.payload.registers && !registersEqual(state.registers, action.payload.registers)) {
        state.registers = action.payload.registers;
      }
      if (action.payload.memory && !memoryMetaEqual(state.memory, action.payload.memory)) {
        state.memory = action.payload.memory;
      }
      if (action.payload.flags && !flagsEqual(state.flags, action.payload.flags)) {
        state.flags = action.payload.flags;
      }
      if (action.payload.terminal) {
        const nextTerminal = toTerminalRuntimeState(action.payload.terminal);
        if (!terminalStateEqual(state.terminal, nextTerminal)) {
          state.terminal = nextTerminal;
        }
      }
      if (action.payload.executionState) {
        const nextExecutionState = {
          ...state.executionState,
          ...action.payload.executionState,
        };
        if (!executionStateEqual(state.executionState, nextExecutionState)) {
          state.executionState = nextExecutionState;
        }
      }
      if (action.payload.runtimeMetrics) {
        const nextRuntimeMetrics = {
          ...state.runtimeMetrics,
          ...action.payload.runtimeMetrics,
        };
        if (!runtimeMetricsEqual(state.runtimeMetrics, nextRuntimeMetrics)) {
          state.runtimeMetrics = nextRuntimeMetrics;
        }
      }
    },
    toggleShowFlags(state) {
      state.showFlags = !state.showFlags;
    },
    setDelay(state, action: PayloadAction<number>) {
      state.delay = action.payload;
    },
    setSpeedMultiplier(state, action: PayloadAction<number>) {
      state.speedMultiplier = action.payload;
    },
    setRuntimeMetrics(state, action: PayloadAction<Partial<RuntimeMetrics>>) {
      state.runtimeMetrics = { ...state.runtimeMetrics, ...action.payload };
    },
    requestRun(state) {
      state.runtimeIntents.run += 1;
    },
    requestResume(state) {
      state.runtimeIntents.resume += 1;
    },
    requestPulseResume(state) {
      state.runtimeIntents.pulseResume += 1;
    },
    requestStep(state) {
      state.runtimeIntents.step += 1;
    },
    requestUndo(state) {
      state.runtimeIntents.undo += 1;
    },
    requestReset(state) {
      state.runtimeIntents.reset += 1;
    },
    requestFocusTerminal(state) {
      state.runtimeIntents.focusTerminal += 1;
    },
    pushHistory(state) {
      state.history.push({
        registers: { ...state.registers },
        flags: { ...state.flags },
        pc: state.registers.pc,
      });
    },
    popHistory(state) {
      const lastState = state.history.pop();
      if (!lastState) {
        return;
      }
      state.registers = { ...lastState.registers };
      state.flags = { ...lastState.flags };
    },
    resetEmulatorState(state) {
      const preservedDelay = state.delay;
      const preservedSpeedMultiplier = state.speedMultiplier;
      const preservedTerminalColumns = state.terminal.columns;
      const preservedTerminalRows = state.terminal.rows;
      state.registers = { ...initialRegisters };
      state.memory = createEmptyMemoryState();
      state.flags = { ...initialFlags };
      state.executionState = { ...initialExecutionState };
      state.emulatorInstance = null;
      state.terminal = createEmptyTerminalState(preservedTerminalColumns, preservedTerminalRows);
      state.showFlags = false;
      state.delay = preservedDelay;
      state.speedMultiplier = preservedSpeedMultiplier;
      state.runtimeMetrics = { ...initialRuntimeMetrics };
      state.runtimeIntents = { ...state.runtimeIntents };
      state.history = [];
    },
  },
});

export const {
  setEditorCode,
  setRegisters,
  setMemory,
  setFlags,
  setExecutionState,
  setEmulatorInstance,
  setTerminalState,
  syncEmulatorFrame,
  toggleShowFlags,
  setDelay,
  setSpeedMultiplier,
  setRuntimeMetrics,
  requestRun,
  requestResume,
  requestPulseResume,
  requestStep,
  requestUndo,
  requestReset,
  requestFocusTerminal,
  pushHistory,
  popHistory,
  resetEmulatorState,
} = emulatorSlice.actions;

export default emulatorSlice.reducer;
