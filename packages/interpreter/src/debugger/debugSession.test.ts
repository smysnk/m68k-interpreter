import { describe, expect, it } from 'vitest';
import { Emulator } from '../core/emulator';

function lineOf(source: string, text: string): number {
  return source.split('\n').findIndex((line) => line.includes(text)) + 1;
}

describe('machine-owned debug session', () => {
  it('stops before execution and suppresses exactly one looping breakpoint boundary', () => {
    const source = `
      ORG $1000
LOOP  ADDQ.L #1,D0
      BRA LOOP
      END LOOP
`;
    const emulator = new Emulator(source, { undoMode: 'full' });
    emulator.configureDebugger({
      breakpoints: [
        { id: 'loop', enabled: true, kind: 'source', line: lineOf(source, 'LOOP  ADDQ') },
      ],
    });
    emulator.beginDebugContinue();

    expect(emulator.emulationStep()).toBe(false);
    expect(emulator.getPC()).toBe(0x1000);
    expect(emulator.getRegisters()[8]).toBe(0);
    expect(emulator.getDebugStop()).toMatchObject({
      reason: 'breakpoint',
      breakpointId: 'loop',
      pc: 0x1000,
    });

    emulator.beginDebugContinue();
    emulator.emulationStep();
    expect(emulator.getRegisters()[8]).toBe(1);
    emulator.emulationStep();
    expect(emulator.getPC()).toBe(0x1000);
    emulator.emulationStep();
    expect(emulator.getDebugStop()).toMatchObject({ reason: 'breakpoint', pc: 0x1000 });
    expect(emulator.getRegisters()[8]).toBe(1);
  });

  it('steps into and over subroutines with logical call frames', () => {
    const source = `
      ORG $1000
START BSR WORK
      MOVEQ #7,D1
WORK  MOVEQ #3,D0
      RTS
      END START
`;
    const emulator = new Emulator(source);
    emulator.configureDebugger({ breakpoints: [] });

    expect(emulator.beginDebugStepOver()).toBe(true);
    for (let count = 0; count < 10 && !emulator.getDebugStop(); count += 1)
      emulator.emulationStep();
    expect(emulator.getDebugStop()).toMatchObject({ reason: 'step-complete', pc: 0x1004 });
    expect(emulator.getRegisters()[8]).toBe(3);
    expect(emulator.getDebugSnapshot().callStack).toEqual([]);

    emulator.beginDebugStepInto();
    emulator.emulationStep();
    expect(emulator.getDebugStop()).toMatchObject({ reason: 'step-complete', pc: 0x1006 });
    expect(emulator.getRegisters()[9]).toBe(7);
  });

  it('supports conditions, hit counts, logpoints, watches, and write watchpoints', () => {
    const source = `
      ORG $1000
START MOVEQ #2,D0
      MOVE.B D0,$2000
      ADDQ.L #1,D0
      END START
`;
    const emulator = new Emulator(source);
    emulator.configureDebugger({
      breakpoints: [
        {
          id: 'conditional',
          enabled: true,
          kind: 'source',
          line: lineOf(source, 'ADDQ.L'),
          condition: 'D0 == 2',
          hitCondition: { operator: '>=', value: 1 },
          logMessage: 'D0={D0}',
        },
      ],
      watchpoints: [{ id: 'write', enabled: true, address: 0x2000, size: 1, access: 'write' }],
      watches: [
        { id: 'd0', expression: 'D0' },
        { id: 'memory', expression: '($2000).B' },
      ],
    });
    emulator.beginDebugContinue();
    emulator.emulationStep();
    emulator.emulationStep();

    expect(emulator.getDebugStop()).toMatchObject({
      reason: 'watchpoint',
      watchpointId: 'write',
      access: { type: 'write', address: 0x2000, size: 1, value: 2 },
    });
    const snapshot = emulator.getDebugSnapshot();
    expect(snapshot.watches).toEqual([
      { id: 'd0', expression: 'D0', value: 2 },
      { id: 'memory', expression: '($2000).B', value: 2 },
    ]);

    emulator.beginDebugContinue();
    emulator.emulationStep();
    expect(emulator.getDebugStop()).toBeUndefined();
    expect(emulator.getDebugSnapshot().logs).toEqual(['D0=2']);
  });

  it('keeps data directives unbound and resolves labels to executable addresses', () => {
    const source = `
      ORG $1000
START NOP
DATA  DC.W $1234
      END START
`;
    const emulator = new Emulator(source);
    emulator.configureDebugger({
      breakpoints: [
        { id: 'data', enabled: true, kind: 'source', line: lineOf(source, 'DATA  DC.W') },
        { id: 'start', enabled: true, kind: 'label', label: 'START' },
      ],
    });

    expect(emulator.getDebugSnapshot().breakpoints).toMatchObject([
      { id: 'data', bound: false, addresses: [] },
      { id: 'start', bound: true, addresses: [0x1000] },
    ]);
  });
});
