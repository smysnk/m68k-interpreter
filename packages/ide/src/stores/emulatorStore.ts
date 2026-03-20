import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type {
  ConditionFlags,
  ExecutionState,
  MemoryMeta,
  Registers,
  TerminalMeta,
  TerminalSnapshot,
} from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import {
  ideStore,
  setEditorCode as setEditorCodeAction,
  setRegisters as setRegistersAction,
  setMemory as setMemoryAction,
  setFlags as setFlagsAction,
  setExecutionState as setExecutionStateAction,
  setEmulatorInstance as setEmulatorInstanceAction,
  setTerminalState as setTerminalStateAction,
  syncEmulatorFrame as syncEmulatorFrameAction,
  toggleShowFlags as toggleShowFlagsAction,
  setDelay as setDelayAction,
  setSpeedMultiplier as setSpeedMultiplierAction,
  setRuntimeMetrics as setRuntimeMetricsAction,
  pushHistory as pushHistoryAction,
  popHistory as popHistoryAction,
  resetEmulatorState,
  createEmptyTerminalState,
  toTerminalRuntimeState,
  type RootState,
  type AppDispatch,
  type RuntimeMetrics,
  type TerminalRuntimeState,
} from '@/store';

type EmulatorStoreFacade = RootState['emulator'] & {
  setEditorCode: (code: string) => void;
  setRegisters: (registers: Partial<Registers>) => void;
  setMemory: (memory: MemoryMeta) => void;
  setFlags: (flags: Partial<ConditionFlags>) => void;
  setExecutionState: (state: Partial<ExecutionState>) => void;
  setEmulatorInstance: (emulator: IdeRuntimeSession | null) => void;
  setTerminalSnapshot: (snapshot: TerminalSnapshot) => void;
    setTerminalMeta: (terminalMeta: TerminalRuntimeState | TerminalMeta) => void;
    syncEmulatorFrame: (frame: {
      registers: Registers;
      memory: MemoryMeta;
      flags: ConditionFlags;
      terminal: TerminalRuntimeState | TerminalMeta;
      executionState?: Partial<ExecutionState>;
    runtimeMetrics?: Partial<RuntimeMetrics>;
  }) => void;
  toggleShowFlags: () => void;
  setDelay: (delay: number) => void;
  setSpeedMultiplier: (speedMultiplier: number) => void;
  setRuntimeMetrics: (runtimeMetrics: Partial<RuntimeMetrics>) => void;
  pushHistory: () => void;
  popHistory: () => void;
  reset: () => void;
  getRegister: (name: keyof Registers) => number;
  setRegister: (name: keyof Registers, value: number) => void;
  setRegisterInEmulator: (name: keyof Registers, value: number) => void;
};

const registerMap: Record<string, number> = {
  d0: 8,
  d1: 9,
  d2: 10,
  d3: 11,
  d4: 12,
  d5: 13,
  d6: 14,
  d7: 15,
  a0: 0,
  a1: 1,
  a2: 2,
  a3: 3,
  a4: 4,
  a5: 5,
  a6: 6,
  a7: 7,
};

function createActions(dispatch: AppDispatch) {
  const setRegister = (name: keyof Registers, value: number): void => {
    dispatch(
      setRegistersAction({
        [name]: value,
      } as Partial<Registers>)
    );
  };

  return {
    setEditorCode: (code: string) => dispatch(setEditorCodeAction(code)),
    setRegisters: (registers: Partial<Registers>) => dispatch(setRegistersAction(registers)),
    setMemory: (memory: MemoryMeta) => dispatch(setMemoryAction(memory)),
    setFlags: (flags: Partial<ConditionFlags>) => dispatch(setFlagsAction(flags)),
    setExecutionState: (nextState: Partial<ExecutionState>) => dispatch(setExecutionStateAction(nextState)),
    setEmulatorInstance: (emulator: IdeRuntimeSession | null) =>
      dispatch(setEmulatorInstanceAction(emulator)),
    setTerminalSnapshot: (snapshot: TerminalSnapshot) => {
      terminalSurfaceStore.replaceFromSnapshot(snapshot);
      dispatch(setTerminalStateAction(toTerminalRuntimeState(snapshot)));
    },
    setTerminalMeta: (terminalMeta: TerminalRuntimeState | TerminalMeta) =>
      dispatch(setTerminalStateAction(toTerminalRuntimeState(terminalMeta))),
    syncEmulatorFrame: (frame: {
      registers: Registers;
      memory: MemoryMeta;
      flags: ConditionFlags;
      terminal: TerminalRuntimeState | TerminalMeta;
      executionState?: Partial<ExecutionState>;
      runtimeMetrics?: Partial<RuntimeMetrics>;
    }) => dispatch(syncEmulatorFrameAction(frame)),
    toggleShowFlags: () => dispatch(toggleShowFlagsAction()),
    setDelay: (delay: number) => dispatch(setDelayAction(delay)),
    setSpeedMultiplier: (speedMultiplier: number) => dispatch(setSpeedMultiplierAction(speedMultiplier)),
    setRuntimeMetrics: (runtimeMetrics: Partial<RuntimeMetrics>) => dispatch(setRuntimeMetricsAction(runtimeMetrics)),
    pushHistory: () => dispatch(pushHistoryAction()),
    popHistory: () => dispatch(popHistoryAction()),
    reset: () => {
      memorySurfaceStore.reset();
      terminalSurfaceStore.reset();
      dispatch(resetEmulatorState());
    },
    setRegister,
    setRegisterInEmulator: (name: keyof Registers, value: number) => {
      const emulator = ideStore.getState().emulator.emulatorInstance;
      if (emulator && name in registerMap) {
        if (typeof emulator.setRegisterValue === 'function') {
          emulator.setRegisterValue(registerMap[name], value);
        } else {
          const registers = emulator.getRegisters();
          registers[registerMap[name]] = value;
        }
      }
      setRegister(name, value);
    },
  };
}

function buildFacade(
  emulatorState: RootState['emulator'],
  actions: ReturnType<typeof createActions>
): EmulatorStoreFacade {
  return {
    ...emulatorState,
    ...actions,
    getRegister: (name) => emulatorState.registers[name],
  };
}

function useEmulatorStoreImpl(): EmulatorStoreFacade {
  const emulatorState = useSelector((rootState: RootState) => rootState.emulator);
  const dispatch = useDispatch<AppDispatch>();
  const actions = React.useMemo(() => createActions(dispatch), [dispatch]);

  return React.useMemo(() => buildFacade(emulatorState, actions), [actions, emulatorState]);
}

type UseEmulatorStoreHook = typeof useEmulatorStoreImpl & {
  getState: () => EmulatorStoreFacade;
  subscribe: typeof ideStore.subscribe;
  dispatch: typeof ideStore.dispatch;
};

export const useEmulatorStore = Object.assign(useEmulatorStoreImpl, {
  getState: () => buildFacade(ideStore.getState().emulator, createActions(ideStore.dispatch)),
  subscribe: ideStore.subscribe,
  dispatch: ideStore.dispatch,
}) as UseEmulatorStoreHook;

export type { RuntimeMetrics };
export { createEmptyTerminalState };
