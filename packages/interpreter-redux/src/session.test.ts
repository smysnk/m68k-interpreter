import type { Emulator } from '@m68k/interpreter';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAST_INSTRUCTION } from './state';
import {
  createReducerInterpreterSession,
  ReducerInterpreterSession,
  type ReducerInterpreterAdapter,
} from './session';

type IdeCompatibleSession = Pick<
  Emulator,
  | 'clearInputQueue'
  | 'emulationStep'
  | 'getCFlag'
  | 'getErrors'
  | 'getException'
  | 'getLastInstruction'
  | 'getMemory'
  | 'getNFlag'
  | 'getPC'
  | 'getQueuedInputLength'
  | 'getRegisters'
  | 'getSymbolAddress'
  | 'getSymbols'
  | 'getTerminalSnapshot'
  | 'getVFlag'
  | 'getXFlag'
  | 'getZFlag'
  | 'isHalted'
  | 'isWaitingForInput'
  | 'queueInput'
  | 'reset'
  | 'undoFromStack'
>;

describe('ReducerInterpreterSession', () => {
  it('loads a small fixture program and executes it to completion', () => {
    const session = new ReducerInterpreterSession(`
VALUE DC.L 0
START
  MOVE.L #$12345678,D0
  MOVE.L D0,VALUE
  END START
`);

    for (let step = 0; step < 20; step += 1) {
      if (session.emulationStep()) {
        break;
      }
    }

    const valueAddress = session.getSymbolAddress('VALUE') ?? 0;
    const memory = session.getMemory();

    expect(session.getException()).toBeUndefined();
    expect(session.getErrors()).toEqual([]);
    expect(memory[valueAddress]).toBe(0x12);
    expect(memory[valueAddress + 1]).toBe(0x34);
    expect(memory[valueAddress + 2]).toBe(0x56);
    expect(memory[valueAddress + 3]).toBe(0x78);
  });

  it('supports undo and reset around stepped reducer state', () => {
    const session = new ReducerInterpreterSession(`
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  END START
`);

    expect(session.emulationStep()).toBe(false);
    expect(session.getRegisters()[8]).toBe(1);

    session.undoFromStack();
    expect(session.getRegisters()[8]).toBe(0);

    session.emulationStep();
    session.reset();
    expect(session.getRegisters()[8]).toBe(0);
    expect(session.getPC()).toBe(0);
  });

  it('implements the emulator-compatible adapter contract used by the IDE hooks', () => {
    const session: ReducerInterpreterAdapter = createReducerInterpreterSession(`
VALUE DC.L 0
START
  MOVE.L #1,D0
  SUBQ.L #1,D0
  TST.L D0
  END START
`);
    const ideCompatibleSession: IdeCompatibleSession = session;

    ideCompatibleSession.queueInput('ws');
    expect(ideCompatibleSession.getQueuedInputLength()).toBe(2);

    ideCompatibleSession.clearInputQueue();
    expect(ideCompatibleSession.getQueuedInputLength()).toBe(0);

    for (let step = 0; step < 8; step += 1) {
      if (ideCompatibleSession.emulationStep()) {
        break;
      }
    }

    expect(ideCompatibleSession.getZFlag()).toBe(1);
    expect(ideCompatibleSession.getNFlag()).toBe(0);
    expect(ideCompatibleSession.getVFlag()).toBe(0);
    expect(ideCompatibleSession.getCFlag()).toBe(0);
    expect(ideCompatibleSession.getXFlag()).toBe(0);
    expect(ideCompatibleSession.getSymbols()).toMatchObject({
      VALUE: expect.any(Number),
    });
    expect(ideCompatibleSession.getSymbolAddress('VALUE')).toBe(
      ideCompatibleSession.getSymbols().VALUE
    );
  });

  it('preserves terminal geometry across load/reset and clears runtime queues', () => {
    const session = new ReducerInterpreterSession(`
START
  MOVE.L #1,D0
  END START
`);

    session.resizeTerminal(96, 28);
    session.queueInput([0x77, 0x73]);
    session.loadProgram(`
BUFFER DC.B 0
START
  MOVE.B #'A',BUFFER
  END START
`);

    expect(session.getTerminalSnapshot().columns).toBe(96);
    expect(session.getTerminalSnapshot().rows).toBe(28);
    expect(session.getQueuedInputLength()).toBe(0);

    session.queueInput('a');
    expect(session.getQueuedInputLength()).toBe(1);

    session.reset();
    expect(session.getQueuedInputLength()).toBe(0);
    expect(session.getPC()).toBe(0);
    expect(session.getLastInstruction()).toBe(DEFAULT_LAST_INSTRUCTION);
    expect(session.getTerminalSnapshot().columns).toBe(96);
    expect(session.getTerminalSnapshot().rows).toBe(28);
  });
});
