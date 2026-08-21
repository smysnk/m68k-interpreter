import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  DebugBreakpointSpec,
  DebuggerConfiguration,
  DebugSnapshot,
  DebugWatchExpression,
  DebugWatchpointSpec,
  DebugStop,
  Registers,
} from '@m68k/interpreter';

export interface DebuggerState {
  configuration: DebuggerConfiguration;
  snapshot: DebugSnapshot;
  sourceStale: boolean;
  previousStopRegisters?: Registers;
  lastStopRegisters?: Registers;
  lastStopKey?: string;
}

export const initialDebuggerState: DebuggerState = {
  configuration: {
    breakpoints: [],
    watchpoints: [],
    watches: [],
    breakOnException: false,
    breakOnInterrupt: false,
  },
  snapshot: {
    status: 'idle',
    breakpoints: [],
    watchpoints: [],
    watches: [],
    callStack: [],
    logs: [],
  },
  sourceStale: false,
};

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const debuggerSlice = createSlice({
  name: 'debugger',
  initialState: initialDebuggerState,
  reducers: {
    replaceDebuggerConfiguration(state, action: PayloadAction<DebuggerConfiguration>) {
      state.configuration = structuredClone(action.payload);
    },
    addSourceBreakpoint(
      state,
      action: PayloadAction<{ fileId: string; line: number; id?: string }>
    ) {
      const existing = state.configuration.breakpoints.find(
        (item) =>
          item.kind === 'source' &&
          item.fileId === action.payload.fileId &&
          item.line === action.payload.line
      );
      if (existing) {
        state.configuration.breakpoints = state.configuration.breakpoints.filter(
          (item) => item.id !== existing.id
        );
        return;
      }
      state.configuration.breakpoints.push({
        id: action.payload.id ?? nextId('breakpoint'),
        enabled: true,
        kind: 'source',
        fileId: action.payload.fileId,
        line: action.payload.line,
      });
    },
    upsertBreakpoint(state, action: PayloadAction<DebugBreakpointSpec>) {
      const index = state.configuration.breakpoints.findIndex(
        (item) => item.id === action.payload.id
      );
      if (index >= 0) state.configuration.breakpoints[index] = { ...action.payload };
      else state.configuration.breakpoints.push({ ...action.payload });
    },
    removeBreakpoint(state, action: PayloadAction<string>) {
      state.configuration.breakpoints = state.configuration.breakpoints.filter(
        (item) => item.id !== action.payload
      );
    },
    clearBreakpoints(state) {
      state.configuration.breakpoints = [];
    },
    toggleBreakpointEnabled(state, action: PayloadAction<string>) {
      const breakpoint = state.configuration.breakpoints.find((item) => item.id === action.payload);
      if (breakpoint) breakpoint.enabled = !breakpoint.enabled;
    },
    upsertWatchpoint(state, action: PayloadAction<DebugWatchpointSpec>) {
      const watchpoints = state.configuration.watchpoints ?? (state.configuration.watchpoints = []);
      const index = watchpoints.findIndex((item) => item.id === action.payload.id);
      if (index >= 0) watchpoints[index] = { ...action.payload };
      else watchpoints.push({ ...action.payload });
    },
    removeWatchpoint(state, action: PayloadAction<string>) {
      state.configuration.watchpoints = (state.configuration.watchpoints ?? []).filter(
        (item) => item.id !== action.payload
      );
    },
    upsertWatch(state, action: PayloadAction<DebugWatchExpression>) {
      const watches = state.configuration.watches ?? (state.configuration.watches = []);
      const index = watches.findIndex((item) => item.id === action.payload.id);
      if (index >= 0) watches[index] = { ...action.payload };
      else watches.push({ ...action.payload });
    },
    removeWatch(state, action: PayloadAction<string>) {
      state.configuration.watches = (state.configuration.watches ?? []).filter(
        (item) => item.id !== action.payload
      );
    },
    setBreakOnException(state, action: PayloadAction<boolean>) {
      state.configuration.breakOnException = action.payload;
    },
    setBreakOnInterrupt(state, action: PayloadAction<boolean>) {
      state.configuration.breakOnInterrupt = action.payload;
    },
    syncDebugSnapshot(state, action: PayloadAction<DebugSnapshot>) {
      state.snapshot = structuredClone(action.payload);
    },
    markDebugSourceStale(state) {
      state.sourceStale = true;
    },
    markDebugSourceSynchronized(state) {
      state.sourceStale = false;
    },
    resetDebugSession(state) {
      state.snapshot = structuredClone(initialDebuggerState.snapshot);
      state.sourceStale = false;
      state.previousStopRegisters = undefined;
      state.lastStopRegisters = undefined;
      state.lastStopKey = undefined;
    },
    captureDebuggerStopRegisters(
      state,
      action: PayloadAction<{ stop: DebugStop; registers: Registers }>
    ) {
      const registerKey = Object.values(action.payload.registers).join(',');
      const key = `${action.payload.stop.reason}:${action.payload.stop.pc}:${action.payload.stop.breakpointId ?? ''}:${action.payload.stop.watchpointId ?? ''}:${registerKey}`;
      if (key === state.lastStopKey) return;
      state.previousStopRegisters = state.lastStopRegisters
        ? { ...state.lastStopRegisters }
        : undefined;
      state.lastStopRegisters = { ...action.payload.registers };
      state.lastStopKey = key;
    },
  },
});

export const {
  captureDebuggerStopRegisters,
  addSourceBreakpoint,
  clearBreakpoints,
  markDebugSourceStale,
  markDebugSourceSynchronized,
  removeBreakpoint,
  removeWatch,
  removeWatchpoint,
  replaceDebuggerConfiguration,
  resetDebugSession,
  setBreakOnException,
  setBreakOnInterrupt,
  syncDebugSnapshot,
  toggleBreakpointEnabled,
  upsertBreakpoint,
  upsertWatch,
  upsertWatchpoint,
} = debuggerSlice.actions;

export default debuggerSlice.reducer;
