import { interpreterReduxActions } from '@m68k/interpreter-redux';
import { describe, expect, it } from 'vitest';
import { createIdeStore, resetEmulatorState, setEngineMode } from '@/store';

describe('ideStore', () => {
  it('mounts interpreter-redux state and persists engine selection in Redux', () => {
    const store = createIdeStore();

    expect(store.getState().settings.engineMode).toBe('interpreter');
    expect(store.getState().interpreterRedux.cpu.registers).toHaveLength(16);

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
});
