import { Emulator, type TerminalMeta } from '@m68k/interpreter';
import { describe, expect, it } from 'vitest';
import { selectFlags } from './selectors';
import { ReducerInterpreterSession } from './session';

interface EngineSnapshot {
  registers: number[];
  memory: Record<number, number>;
  pc: number;
  flags: {
    z: number;
    v: number;
    n: number;
    c: number;
    x: number;
  };
  terminalMeta: TerminalMeta;
  terminalText: string;
  lastInstruction: string;
  errors: string[];
  exception?: string;
  halted: boolean;
  waitingForInput: boolean;
}

function snapshotClassEngine(emulator: Emulator): EngineSnapshot {
  return {
    registers: Array.from(emulator.getRegisters()),
    memory: emulator.getMemory(),
    pc: emulator.getPC(),
    flags: {
      z: emulator.getZFlag(),
      v: emulator.getVFlag(),
      n: emulator.getNFlag(),
      c: emulator.getCFlag(),
      x: emulator.getXFlag(),
    },
    terminalMeta: emulator.getTerminalMeta(),
    terminalText: emulator.getTerminalText(),
    lastInstruction: emulator.getLastInstruction(),
    errors: emulator.getErrors(),
    exception: emulator.getException(),
    halted: emulator.isHalted(),
    waitingForInput: emulator.isWaitingForInput(),
  };
}

function snapshotReducerEngine(session: ReducerInterpreterSession): EngineSnapshot {
  const state = session.getState();

  return {
    registers: Array.from(session.getRegisters()),
    memory: session.getMemory(),
    pc: session.getPC(),
    flags: selectFlags(state),
    terminalMeta: session.getTerminalMeta(),
    terminalText: session.getTerminalText(),
    lastInstruction: session.getLastInstruction(),
    errors: session.getErrors(),
    exception: session.getException(),
    halted: session.isHalted(),
    waitingForInput: session.isWaitingForInput(),
  };
}

function expectParity(emulator: Emulator, session: ReducerInterpreterSession): void {
  expect(snapshotReducerEngine(session)).toEqual(snapshotClassEngine(emulator));
}

function runLockstepProgram(
  code: string,
  maxSteps = 200
): { emulator: Emulator; session: ReducerInterpreterSession } {
  const emulator = new Emulator(code);
  const session = new ReducerInterpreterSession(code);

  expectParity(emulator, session);

  for (let step = 0; step < maxSteps; step += 1) {
    const classStop = emulator.emulationStep();
    const reducerStop = session.emulationStep();

    expect(reducerStop).toBe(classStop);
    expectParity(emulator, session);

    if (classStop && reducerStop) {
      return { emulator, session };
    }
  }

  throw new Error(`Engines did not stop within ${maxSteps} steps`);
}

describe('interpreter-redux parity', () => {
  it('stays in lockstep for the arithmetic and branch subset', () => {
    runLockstepProgram(`
RESULT DC.L 0
STATUS DC.L 0
START
  MOVE.L #5,D0
  ADDI.L #3,D0
  SUBQ.L #1,D0
  CMP.L #7,D0
  BNE FAIL
  MOVE.L D0,RESULT
  BRA DONE
FAIL
  MOVE.L #$DEADBEEF,STATUS
DONE
  MOVE.L D0,D0
  END START
`);
  });

  it('stays in lockstep for signed branch, CLR, and TST handling', () => {
    runLockstepProgram(`
LOW_PATH DC.L 0
ZERO_PATH DC.L 0
NEG_PATH DC.L 0
START
  MOVE.L #2,D0
  MOVE.L #5,D1
  CMP.L D1,D0
  BGE SKIP_LOW
  MOVE.L #1,LOW_PATH
SKIP_LOW
  CLR.L D2
  TST.L D2
  BNE SKIP_ZERO
  MOVE.L #1,ZERO_PATH
SKIP_ZERO
  MOVE.L #-1,D3
  CMP.L #1,D3
  BGE DONE
  MOVE.L #1,NEG_PATH
DONE
  MOVE.L D3,D3
  END START
`);
  });

  it('stays in lockstep for byte-sized moves and character immediates', () => {
    runLockstepProgram(`
LETTER DC.B 0
MARKER DC.L 0
START
  MOVE.B #'A',LETTER
  MOVE.B LETTER,D0
  CMP.B #'A',D0
  BNE FAIL
  MOVE.L #1,MARKER
  BRA DONE
FAIL
  MOVE.L #$DEADBEEF,MARKER
DONE
  MOVE.L D0,D0
  END START
`);
  });
});
