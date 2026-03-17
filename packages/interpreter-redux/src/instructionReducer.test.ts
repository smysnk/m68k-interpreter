import { Emulator } from '@m68k/interpreter';
import { describe, expect, it } from 'vitest';
import { createInterpreterReduxStateForProgram, reduceInstructionStep } from './instructionReducer';
import { ReducerInterpreterSession } from './session';

function runClassEmulator(code: string, maxSteps = 200): Emulator {
  const emulator = new Emulator(code);

  for (let step = 0; step < maxSteps; step += 1) {
    if (emulator.emulationStep()) {
      return emulator;
    }
  }

  throw new Error('Class emulator did not finish within the step budget');
}

function runReducerSession(code: string, maxSteps = 200): ReducerInterpreterSession {
  const session = new ReducerInterpreterSession(code);

  for (let step = 0; step < maxSteps; step += 1) {
    if (session.emulationStep()) {
      return session;
    }
  }

  throw new Error('Reducer session did not finish within the step budget');
}

describe('instructionReducer', () => {
  it('steps through directive lines and simple MOVE/ADD/CMP/branch execution', () => {
    const code = `
RESULT DC.L 0
START
  MOVE.L #1,D0
  ADDQ.L #1,D0
  CMP.L #2,D0
  BNE FAIL
  MOVE.L D0,RESULT
  BRA DONE
FAIL
  MOVE.L #$DEADBEEF,RESULT
DONE
  MOVE.L D0,D0
  END START
`;

    let state = createInterpreterReduxStateForProgram(code);

    for (let step = 0; step < 8; step += 1) {
      state = reduceInstructionStep(state);
      expect(state.diagnostics.exception).toBeUndefined();
      expect(state.diagnostics.errors).toEqual([]);
    }

    const resultAddress = state.program.symbolLookup.result;
    expect(resultAddress).toBeDefined();
    expect(state.memory.bytes[resultAddress ?? 0]).toBe(0x00);
    expect(state.memory.bytes[(resultAddress ?? 0) + 3]).toBe(0x02);
  });

  it('matches the class emulator on a direct-memory arithmetic and branch fixture', () => {
    const code = `
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
`;

    const classEmulator = runClassEmulator(code);
    const reducerSession = runReducerSession(code);

    expect(reducerSession.getException()).toBe(classEmulator.getException() ?? undefined);
    expect(reducerSession.getErrors()).toEqual(classEmulator.getErrors());
    expect(Array.from(reducerSession.getRegisters())).toEqual(Array.from(classEmulator.getRegisters()));

    const resultAddress = classEmulator.getSymbolAddress('RESULT') ?? 0;
    const statusAddress = classEmulator.getSymbolAddress('STATUS') ?? 0;
    const classMemory = classEmulator.getMemory();
    const reducerMemory = reducerSession.getMemory();

    expect(reducerMemory[resultAddress]).toBe(classMemory[resultAddress]);
    expect(reducerMemory[resultAddress + 1]).toBe(classMemory[resultAddress + 1]);
    expect(reducerMemory[resultAddress + 2]).toBe(classMemory[resultAddress + 2]);
    expect(reducerMemory[resultAddress + 3]).toBe(classMemory[resultAddress + 3]);
    expect(reducerMemory[statusAddress] ?? 0).toBe(classMemory[statusAddress] ?? 0);
    expect(reducerSession.getLastInstruction()).toBe(classEmulator.getLastInstruction());
  });
});
