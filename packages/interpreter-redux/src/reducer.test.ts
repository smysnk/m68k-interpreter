import { describe, expect, it } from 'vitest';
import { interpreterReduxActions } from './actions';
import { interpreterReducer } from './reducer';
import {
  DEFAULT_STACK_POINTER,
  createInitialInterpreterReducerState,
  createLoadedProgramState,
} from './state';
import { selectFlags, selectRegisters, selectTerminalLines } from './selectors';

describe('interpreter-redux reducer contracts', () => {
  it('creates an initial reducer state with serializable cpu, terminal, and memory metadata', () => {
    const state = createInitialInterpreterReducerState();
    const registers = selectRegisters(state);
    const flags = selectFlags(state);
    const terminalLines = selectTerminalLines(state);

    expect(state.cpu.registers).toHaveLength(16);
    expect(registers.a7).toBe(DEFAULT_STACK_POINTER);
    expect(flags).toEqual({
      z: 0,
      v: 0,
      n: 0,
      c: 0,
      x: 0,
    });
    expect(state.terminal.columns).toBe(80);
    expect(state.terminal.rows).toBe(25);
    expect(terminalLines).toHaveLength(25);
    expect(state.memory).toEqual({
      usedBytes: 0,
      minAddress: null,
      maxAddress: null,
      version: 1,
    });
  });

  it('loads a program definition and resets memory metadata around it', () => {
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
    expect(nextState.memory).toEqual({
      usedBytes: 2,
      minAddress: 0x1000,
      maxAddress: 0x1001,
      version: 1,
    });
    expect(nextState.execution.endPointer).toEqual([2, 2]);
    expect(nextState.cpu.registers[7]).toBe(DEFAULT_STACK_POINTER);
  });

  it('queues input while preserving a pending blocking-read trap', () => {
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
    expect(nextState.input.waitingForInput).toBe(true);
    expect(nextState.input.pendingInputTask).toBe(3);
  });

  it('applies compact committed runtime payloads for middleware-driven stepping', () => {
    const initialState = createInitialInterpreterReducerState();
    const committedState = {
      ...initialState,
      cpu: {
        ...initialState.cpu,
        pc: 4,
        registers: initialState.cpu.registers.map((value, index) => (index === 8 ? 1 : value)),
      },
      memory: {
        usedBytes: 4,
        minAddress: 0,
        maxAddress: 3,
        version: 2,
      },
      history: {
        undoDepth: 1,
      },
    };

    const nextState = interpreterReducer(
      initialState,
      interpreterReduxActions.stepCommitted({
        state: committedState,
      })
    );

    expect(nextState.cpu.pc).toBe(4);
    expect(nextState.cpu.registers[8]).toBe(1);
    expect(nextState.memory.version).toBe(2);
    expect(nextState.history.undoDepth).toBe(1);
  });

  it('resets back to the loaded program metadata image', () => {
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
        usedBytes: 3,
        minAddress: 0x2000,
        maxAddress: 0x2002,
        version: 4,
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

    expect(resetState.memory).toEqual({
      usedBytes: 2,
      minAddress: 0x2000,
      maxAddress: 0x2001,
      version: 1,
    });
    expect(resetState.cpu.pc).toBe(0);
  });
});
