import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  ConditionFlags,
  ExecutionState,
  MemoryCell,
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
  memory: MemoryCell;
  flags: ConditionFlags;
  executionState: ExecutionState;
  emulatorInstance: IdeRuntimeSession | null;
  terminal: TerminalRuntimeState;
  showFlags: boolean;
  delay: number;
  speedMultiplier: number;
  runtimeMetrics: RuntimeMetrics;
  history: Array<{
    registers: Registers;
    memory: MemoryCell;
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

export function toTerminalRuntimeState(
  terminal:
    | TerminalRuntimeState
    | Pick<TerminalMeta, 'columns' | 'rows' | 'cursorRow' | 'cursorColumn' | 'version' | 'geometryVersion'>
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
  memory: {},
  flags: initialFlags,
  executionState: initialExecutionState,
  emulatorInstance: null,
  terminal: createEmptyTerminalState(),
  showFlags: false,
  delay: 0,
  speedMultiplier: 1,
  runtimeMetrics: initialRuntimeMetrics,
  history: [],
};

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
    setMemory(state, action: PayloadAction<MemoryCell>) {
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
      state.terminal = toTerminalRuntimeState(action.payload);
    },
    syncEmulatorFrame(
      state,
      action: PayloadAction<{
        registers: Registers;
        memory: MemoryCell;
        flags: ConditionFlags;
        terminal: TerminalRuntimeState | TerminalMeta;
        executionState?: Partial<ExecutionState>;
        runtimeMetrics?: Partial<RuntimeMetrics>;
      }>
    ) {
      state.registers = action.payload.registers;
      state.memory = action.payload.memory;
      state.flags = action.payload.flags;
      state.terminal = toTerminalRuntimeState(action.payload.terminal);
      if (action.payload.executionState) {
        state.executionState = { ...state.executionState, ...action.payload.executionState };
      }
      if (action.payload.runtimeMetrics) {
        state.runtimeMetrics = { ...state.runtimeMetrics, ...action.payload.runtimeMetrics };
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
    pushHistory(state) {
      state.history.push({
        registers: { ...state.registers },
        memory: { ...state.memory },
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
      state.memory = { ...lastState.memory };
      state.flags = { ...lastState.flags };
    },
    resetEmulatorState(state) {
      const preservedDelay = state.delay;
      const preservedSpeedMultiplier = state.speedMultiplier;
      state.registers = { ...initialRegisters };
      state.memory = {};
      state.flags = { ...initialFlags };
      state.executionState = { ...initialExecutionState };
      state.emulatorInstance = null;
      state.terminal = createEmptyTerminalState();
      state.showFlags = false;
      state.delay = preservedDelay;
      state.speedMultiplier = preservedSpeedMultiplier;
      state.runtimeMetrics = { ...initialRuntimeMetrics };
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
  pushHistory,
  popHistory,
  resetEmulatorState,
} = emulatorSlice.actions;

export default emulatorSlice.reducer;
