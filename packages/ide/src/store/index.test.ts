import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyMemoryState,
  createEmptyTerminalState,
  createActionSizeGuardMiddleware,
  createIdeStore,
  measureSerializedSize,
  resetEmulatorState,
  sanitizeIdeDevToolsAction,
  sanitizeIdeDevToolsState,
  syncEmulatorFrame,
  setEditorCode,
  setEmulatorInstance,
  setRegisterEditRadix,
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  toggleContextView,
} from '@/store';
import emulatorReducerForTest, { initialFlags, initialRegisters } from '@/store/emulatorSlice';

describe('ideStore', () => {
  it('mounts the single-engine store and persists general settings in Redux', () => {
    const store = createIdeStore();

    expect(store.getState().settings.registerEditRadix).toBe('hex');
    expect(store.getState().uiShell.workspaceTab).toBe('terminal');

    store.dispatch(setRegisterEditRadix('bin'));

    expect(store.getState().settings.registerEditRadix).toBe('bin');
  });

  it('preserves the measured terminal geometry when the emulator UI resets', () => {
    const store = createIdeStore();

    store.dispatch(
      syncEmulatorFrame({
        registers: initialRegisters,
        memory: createEmptyMemoryState(),
        flags: initialFlags,
        terminal: createEmptyTerminalState(64, 22),
      })
    );

    store.dispatch(resetEmulatorState());

    expect(store.getState().emulator.terminal).toMatchObject({
      columns: 64,
      rows: 22,
    });
  });

  it('keeps terminal metadata lightweight in Redux state', () => {
    const store = createIdeStore();

    store.dispatch(
      syncEmulatorFrame({
        registers: initialRegisters,
        memory: createEmptyMemoryState(),
        flags: initialFlags,
        terminal: createEmptyTerminalState(96, 30),
      })
    );

    expect(store.getState().emulator.terminal).toEqual({
      columns: 96,
      rows: 30,
      cursorRow: 0,
      cursorColumn: 0,
      version: 1,
      geometryVersion: 1,
    });
    expect(store.getState().emulator.terminal).not.toHaveProperty('output');
    expect(store.getState().emulator.terminal).not.toHaveProperty('lines');
    expect(store.getState().emulator.terminal).not.toHaveProperty('cells');
    expect(store.getState().emulator.memory).toEqual(createEmptyMemoryState());
  });

  it('reuses unchanged frame slices when sync metadata is effectively identical', () => {
    const store = createIdeStore();
    const registers = { ...initialRegisters, d0: 7 };
    const memory = createEmptyMemoryState();
    const flags = { ...initialFlags, z: 1 };
    const terminal = createEmptyTerminalState(80, 24);

    store.dispatch(
      syncEmulatorFrame({
        registers,
        memory,
        flags,
        terminal,
        executionState: {
          started: true,
        },
        runtimeMetrics: {
          lastFrameInstructions: 10,
        },
      })
    );

    const firstState = store.getState().emulator;

    store.dispatch(
      syncEmulatorFrame({
        registers,
        memory,
        flags,
        terminal,
        executionState: {
          started: true,
        },
        runtimeMetrics: {
          lastFrameInstructions: 11,
        },
      })
    );

    const nextState = store.getState().emulator;
    expect(nextState.registers).toBe(firstState.registers);
    expect(nextState.memory).toBe(firstState.memory);
    expect(nextState.flags).toBe(firstState.flags);
    expect(nextState.terminal).toBe(firstState.terminal);
    expect(nextState.executionState).toBe(firstState.executionState);
    expect(nextState.runtimeMetrics).not.toBe(firstState.runtimeMetrics);
    expect(nextState.runtimeMetrics.lastFrameInstructions).toBe(11);
  });

  it('stores compact and help-expanded shell layout sizes in Redux', () => {
    const store = createIdeStore();

    store.dispatch(setRootHorizontalLayout([57, 43]));
    store.dispatch(toggleContextView('help'));
    store.dispatch(setRootHorizontalWithContextLayout([46, 34, 20]));

    expect(store.getState().uiShell.layout.rootHorizontal).toEqual([57, 43]);
    expect(store.getState().uiShell.layout.rootHorizontalWithContext).toEqual([46, 34, 20]);
    expect(store.getState().uiShell.contextOpen).toBe(true);
  });

  it('sanitizes devtools state and actions so large traces stay compact', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createIdeStore();
    const largeSource = 'MOVE.L D0,D0\n'.repeat(5000);
    const runtime = { getLastInstruction: () => 'Ready' };

    store.dispatch(setEditorCode(largeSource));
    store.dispatch(setEmulatorInstance(runtime as never));

    const rawAction = setEditorCode(largeSource);
    const sanitizedAction = sanitizeIdeDevToolsAction(rawAction);
    const rawState = store.getState();
    const sanitizedState = sanitizeIdeDevToolsState(rawState);

    expect(measureSerializedSize(sanitizedAction)).toBeLessThan(measureSerializedSize(rawAction));
    expect(measureSerializedSize(sanitizedState)).toBeLessThan(measureSerializedSize(rawState));
    expect(sanitizedState?.emulator.emulatorInstance).toBe('<runtime>');
    expect(sanitizedState?.emulator.editorCode).toEqual(
      expect.objectContaining({
        length: largeSource.length,
      })
    );

    consoleWarn.mockRestore();
  });

  it('warns when an action exceeds the configured size guardrail', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const guardStore = configureStore({
      reducer: emulatorReducerForTest,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }).concat(createActionSizeGuardMiddleware(32)),
    });

    guardStore.dispatch({
      type: 'oversized/custom',
      payload: 'A'.repeat(256),
    });

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('[redux-size-guard] action oversized/custom serialized to')
    );

    consoleWarn.mockRestore();
  });
});
