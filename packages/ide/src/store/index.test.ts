import { interpreterReduxActions, ReducerInterpreterSession } from '@m68k/interpreter-redux';
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
  setEngineMode,
  setEditorCode,
  setEmulatorInstance,
  setRegisterEditRadix,
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  toggleContextView,
} from '@/store';
import emulatorReducerForTest, { initialFlags, initialRegisters } from '@/store/emulatorSlice';

describe('ideStore', () => {
  it('mounts interpreter-redux state and persists engine selection in Redux', () => {
    const store = createIdeStore();

    expect(store.getState().settings.engineMode).toBe('interpreter');
    expect(store.getState().settings.registerEditRadix).toBe('hex');
    expect(store.getState().interpreterRedux.cpu.registers).toHaveLength(16);
    expect(store.getState().uiShell.workspaceTab).toBe('terminal');

    store.dispatch(setEngineMode('interpreter-redux'));
    store.dispatch(setRegisterEditRadix('bin'));

    expect(store.getState().settings.engineMode).toBe('interpreter-redux');
    expect(store.getState().settings.registerEditRadix).toBe('bin');
  });

  it('resets the mounted interpreter-redux slice when the emulator UI resets', () => {
    const store = createIdeStore();
    const session = new ReducerInterpreterSession(`START
  MOVE.L #1,D0
  END START`);

    session.emulationStep();
    store.dispatch(interpreterReduxActions.runtimeStateHydrated(session.getState()));

    expect(store.getState().interpreterRedux.cpu.registers[8]).toBe(1);

    store.dispatch(resetEmulatorState());

    expect(store.getState().interpreterRedux.cpu.registers[8]).toBe(0);
    expect(store.getState().interpreterRedux.execution.lastInstruction).toBe('Ready');
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
    const session = new ReducerInterpreterSession(largeSource);

    store.dispatch(setEditorCode(largeSource));
    store.dispatch(setEmulatorInstance(session));
    store.dispatch(interpreterReduxActions.runtimeStateHydrated(session.getState()));

    const rawAction = interpreterReduxActions.runtimeStateHydrated(session.getState());
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
