import { interpreterReduxActions } from '@m68k/interpreter-redux';
import { describe, expect, it } from 'vitest';
import {
  createEmptyTerminalState,
  createIdeStore,
  resetEmulatorState,
  syncEmulatorFrame,
  setEngineMode,
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  toggleContextView,
} from '@/store';
import { initialFlags, initialRegisters } from '@/store/emulatorSlice';

describe('ideStore', () => {
  it('mounts interpreter-redux state and persists engine selection in Redux', () => {
    const store = createIdeStore();

    expect(store.getState().settings.engineMode).toBe('interpreter');
    expect(store.getState().interpreterRedux.cpu.registers).toHaveLength(16);
    expect(store.getState().uiShell.workspaceTab).toBe('terminal');

    store.dispatch(setEngineMode('interpreter-redux'));

    expect(store.getState().settings.engineMode).toBe('interpreter-redux');
  });

  it('resets the mounted interpreter-redux slice when the emulator UI resets', () => {
    const store = createIdeStore();

    store.dispatch(
      interpreterReduxActions.programSourceLoaded({
        source: `START
  MOVE.L #1,D0
  END START`,
      })
    );
    store.dispatch(interpreterReduxActions.stepRequested());

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
        memory: {},
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
});
