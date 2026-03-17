import { describe, expect, it } from 'vitest';
import { interpreterReduxActions } from './actions';
import { interpreterReducer } from './reducer';
import {
  DEFAULT_STACK_POINTER,
  createInitialInterpreterReducerState,
  createLoadedProgramState,
} from './state';
import { selectFlags, selectRegisters, selectTerminalSnapshot } from './selectors';

describe('interpreter-redux phase 1 reducer contracts', () => {
  it('creates an initial reducer state with a serializable cpu and terminal model', () => {
    const state = createInitialInterpreterReducerState();
    const registers = selectRegisters(state);
    const flags = selectFlags(state);
    const terminal = selectTerminalSnapshot(state);

    expect(state.cpu.registers).toHaveLength(16);
    expect(registers.a7).toBe(DEFAULT_STACK_POINTER);
    expect(flags).toEqual({
      z: 0,
      v: 0,
      n: 0,
      c: 0,
      x: 0,
    });
    expect(terminal.columns).toBe(80);
    expect(terminal.rows).toBe(25);
    expect(terminal.lines).toHaveLength(25);
  });

  it('loads a program definition and resets memory/execution state around it', () => {
    const initialState = createInitialInterpreterReducerState();
    const program = createLoadedProgramState({
      source: 'ORG $1000\nEND',
      instructions: [['ORG $1000', 1, true], ['END', 2, true]],
      sourceLines: ['ORG $1000', 'END'],
      codeLabels: { START: 0 },
      symbols: { BUFFER: 0x1000 },
      symbolLookup: { buffer: 0x1000 },
      memoryImage: { 0x1000: 0xaa, 0x1001: 0xbb },
      endPointer: [2, 2],
      orgAddress: 0x1000,
    });

    const nextState = interpreterReducer(
      initialState,
      interpreterReduxActions.programLoaded(program)
    );

    expect(nextState.program.source).toBe('ORG $1000\nEND');
    expect(nextState.memory.bytes[0x1000]).toBe(0xaa);
    expect(nextState.memory.bytes[0x1001]).toBe(0xbb);
    expect(nextState.execution.endPointer).toEqual([2, 2]);
    expect(nextState.cpu.registers[7]).toBe(DEFAULT_STACK_POINTER);
  });

  it('queues input and clears waiting-for-input state', () => {
    const initialState = createInitialInterpreterReducerState();
    const waitingState = {
      ...initialState,
      input: {
        ...initialState.input,
        waitingForInput: true,
        pendingInputTask: 3,
      },
    };

    const nextState = interpreterReducer(
      waitingState,
      interpreterReduxActions.inputQueued([0x77, 0x0d])
    );

    expect(nextState.input.queue).toEqual([0x77, 0x0d]);
    expect(nextState.input.waitingForInput).toBe(false);
    expect(nextState.input.pendingInputTask).toBeUndefined();
  });

  it('resets back to the loaded program memory image', () => {
    const loadedState = interpreterReducer(
      createInitialInterpreterReducerState(),
      interpreterReduxActions.programLoaded(
        createLoadedProgramState({
          memoryImage: {
            0x2000: 0x11,
            0x2001: 0x22,
          },
        })
      )
    );

    const mutatedState = {
      ...loadedState,
      memory: {
        bytes: {
          ...loadedState.memory.bytes,
          0x2000: 0xff,
        },
      },
      cpu: {
        ...loadedState.cpu,
        pc: 0x40,
      },
    };

    const resetState = interpreterReducer(
      mutatedState,
      interpreterReduxActions.resetRequested()
    );

    expect(resetState.memory.bytes[0x2000]).toBe(0x11);
    expect(resetState.memory.bytes[0x2001]).toBe(0x22);
    expect(resetState.cpu.pc).toBe(0);
  });
});
