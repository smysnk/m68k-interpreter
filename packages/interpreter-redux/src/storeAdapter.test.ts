import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { createInterpreterReduxIoMiddleware } from './ioMiddleware';
import { interpreterReducer } from './reducer';
import { createStoreBackedReducerInterpreterAdapter } from './storeAdapter';
import { createInitialInterpreterReducerState } from './state';

describe('createStoreBackedReducerInterpreterAdapter', () => {
  it('drives the mounted reducer state through load, step, queue, and register updates', () => {
    const controller = createInterpreterReduxIoMiddleware();
    const store = configureStore({
      reducer: interpreterReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }).concat(controller.middleware),
    });

    const adapter = createStoreBackedReducerInterpreterAdapter({
      dispatch(action) {
        return store.dispatch(action);
      },
      getState() {
        return store.getState();
      },
      getRuntimeStore() {
        return controller.getRuntimeStore();
      },
    });

    adapter.resizeTerminal(90, 30);
    adapter.loadProgram(`
VALUE DC.L 0
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  MOVE.L D0,VALUE
  END START
`);

    expect(adapter.getTerminalMeta().columns).toBe(90);
    expect(adapter.getTerminalMeta().rows).toBe(30);

    adapter.queueInput('ws');
    expect(adapter.getQueuedInputLength()).toBe(2);
    adapter.clearInputQueue();
    expect(adapter.getQueuedInputLength()).toBe(0);

    adapter.setRegisterValue(9, 0x1234);
    expect(adapter.getRegisters()[9]).toBe(0x1234);

    for (let step = 0; step < 8; step += 1) {
      if (adapter.emulationStep()) {
        break;
      }
    }

    const valueAddress = adapter.getSymbolAddress('VALUE') ?? 0;
    const memory = adapter.getMemory();
    expect(adapter.getException()).toBeUndefined();
    expect(adapter.getErrors()).toEqual([]);
    expect(memory[valueAddress + 3]).toBe(0x02);
  });

  it('still supports plain reducer bindings without middleware through the local runtime store', () => {
    let state = createInitialInterpreterReducerState();

    const adapter = createStoreBackedReducerInterpreterAdapter({
      dispatch(action) {
        state = interpreterReducer(state, action);
      },
      getState() {
        return state;
      },
    });

    adapter.resizeTerminal(90, 30);
    adapter.loadProgram(`
VALUE DC.L 0
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  MOVE.L D0,VALUE
  END START
`);

    expect(adapter.getTerminalMeta().columns).toBe(90);
    expect(adapter.getTerminalMeta().rows).toBe(30);

    adapter.queueInput('ws');
    expect(adapter.getQueuedInputLength()).toBe(2);
    adapter.clearInputQueue();
    expect(adapter.getQueuedInputLength()).toBe(0);

    adapter.setRegisterValue(9, 0x1234);
    expect(adapter.getRegisters()[9]).toBe(0x1234);

    for (let step = 0; step < 8; step += 1) {
      if (adapter.emulationStep()) {
        break;
      }
    }

    const valueAddress = adapter.getSymbolAddress('VALUE') ?? 0;
    const memory = adapter.getMemory();
    expect(adapter.getException()).toBeUndefined();
    expect(adapter.getErrors()).toEqual([]);
    expect(memory[valueAddress + 3]).toBe(0x02);
  });
});
