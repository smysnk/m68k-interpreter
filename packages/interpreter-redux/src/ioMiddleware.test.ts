import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { interpreterReduxActions } from './actions';
import { createInterpreterReduxIoMiddleware } from './ioMiddleware';
import { interpreterReducer } from './reducer';

describe('interpreter-redux io middleware', () => {
  it('executes step intents through committed actions and restores undo correctly', () => {
    const controller = createInterpreterReduxIoMiddleware();
    const store = configureStore({
      reducer: interpreterReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }).concat(controller.middleware),
    });

    store.dispatch(
      interpreterReduxActions.programSourceLoaded({
        source: `
VALUE DC.L 0
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  MOVE.L D0,VALUE
  END START
`,
      })
    );

    store.dispatch(interpreterReduxActions.stepRequested());
    store.dispatch(interpreterReduxActions.stepRequested());
    store.dispatch(interpreterReduxActions.stepRequested());
    store.dispatch(interpreterReduxActions.stepRequested());

    const steppedState = store.getState();
    expect(steppedState.cpu.registers[8]).toBe(2);
    expect(steppedState.history.undoDepth).toBe(4);

    const valueAddress = steppedState.program.symbolLookup.value ?? 0;
    const memoryAfterWrite = controller.getRuntimeStore().getMemory();
    expect(memoryAfterWrite[valueAddress + 3]).toBe(0x02);

    store.dispatch(interpreterReduxActions.undoRequested());

    const undoneState = store.getState();
    expect(undoneState.cpu.registers[8]).toBe(2);
    expect(undoneState.history.undoDepth).toBe(3);

    const memoryAfterUndo = controller.getRuntimeStore().getMemory();
    expect(memoryAfterUndo[valueAddress + 3] ?? 0).toBe(0x00);
  });

  it('restores trap-driven terminal output when undoing a committed step', () => {
    const controller = createInterpreterReduxIoMiddleware();
    const store = configureStore({
      reducer: interpreterReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }).concat(controller.middleware),
    });

    store.dispatch(
      interpreterReduxActions.programSourceLoaded({
        source: `
START
  MOVE.B #'A',D0
  TRAP #15
  DC.W 1
  END START
`,
      })
    );

    while (!controller.getRuntimeStore().getTerminalText().includes('A')) {
      store.dispatch(interpreterReduxActions.stepRequested());
    }

    expect(controller.getRuntimeStore().getTerminalText()).toContain('A');

    store.dispatch(interpreterReduxActions.undoRequested());

    expect(controller.getRuntimeStore().getTerminalText()).not.toContain('A');
  });
});
