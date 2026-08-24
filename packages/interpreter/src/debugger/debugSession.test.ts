import { describe, expect, it } from 'vitest';
import { Emulator } from '../core/emulator';

function lineOf(source: string, text: string): number {
  return source.split('\n').findIndex((line) => line.includes(text)) + 1;
}

const WAIT_FOR_INPUT_SOURCE = `RESULT DC.B 0
START
  MOVEQ #5,D0
  TRAP #15
AFTER_INPUT
  MOVE.B D1,RESULT
LOOP
  BRA LOOP
  END START`;

function createWaitingDebugger(): Emulator {
  const emulator = new Emulator(WAIT_FOR_INPUT_SOURCE, {
    debugFileId: 'waiting.asm',
    emulation: { cpuModel: 'm68000', machineProfile: 'easy68k' },
    undoMode: 'full',
  });
  emulator.configureDebugger({ breakpoints: [] });
  emulator.beginDebugContinue();
  for (let count = 0; count < 20 && !emulator.isWaitingForInput(); count += 1) {
    emulator.emulationStep();
  }
  return emulator;
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

  it('pauses on the current source boundary without replacing an existing debug stop', () => {
    const source = `ORG $1000
START NOP
      BRA START
      END START`;
    const emulator = new Emulator(source, { debugFileId: 'pause.asm' });
    emulator.configureDebugger({ breakpoints: [] });
    emulator.beginDebugContinue();
    emulator.emulationStep();

    expect(emulator.pauseDebugger()).toMatchObject({
      reason: 'manual-pause',
      pc: 0x1002,
      source: { fileId: 'pause.asm', line: 3 },
    });
    const revision = emulator.getRuntimeSyncVersions().debugger;
    expect(emulator.pauseDebugger()).toMatchObject({ reason: 'manual-pause', pc: 0x1002 });
    expect(emulator.getRuntimeSyncVersions().debugger).toBe(revision);
  });

  it('preserves a breakpoint stop when a manual pause races the same boundary', () => {
    const source = `ORG $1000
START NOP
      BRA START
      END START`;
    const emulator = new Emulator(source, { debugFileId: 'pause-race.asm' });
    emulator.configureDebugger({
      breakpoints: [{ id: 'start', enabled: true, kind: 'source', line: 2 }],
    });
    emulator.beginDebugContinue();
    expect(emulator.emulationStep()).toBe(false);

    const breakpointStop = emulator.getDebugStop();
    const revision = emulator.getRuntimeSyncVersions().debugger;
    expect(emulator.pauseDebugger()).toEqual(breakpointStop);
    expect(emulator.getRuntimeSyncVersions().debugger).toBe(revision);
  });

  it('preserves the machine-owned waiting stop when a debugger attaches', () => {
    const emulator = createWaitingDebugger();
    const waitingStop = emulator.getDebugStop();
    const revision = emulator.getRuntimeSyncVersions().debugger;

    expect(waitingStop).toMatchObject({
      reason: 'waiting-for-input',
      source: { fileId: 'waiting.asm', line: lineOf(WAIT_FOR_INPUT_SOURCE, 'MOVE.B D1,RESULT') },
    });
    expect(emulator.pauseDebugger()).toEqual(waitingStop);
    expect(emulator.isWaitingForInput()).toBe(true);
    expect(emulator.getRuntimeSyncVersions().debugger).toBe(revision);
  });

  it('consumes queued input exactly once when stepping out of a machine wait', () => {
    const emulator = createWaitingDebugger();
    emulator.queueInput('w');
    emulator.beginDebugStepInto();
    emulator.emulationStep();

    expect(emulator.isWaitingForInput()).toBe(false);
    expect(emulator.getQueuedInputLength()).toBe(0);
    expect(emulator.getRegisters()[9] & 0xff).toBe('w'.charCodeAt(0));
    expect(emulator.getDebugStop()).toMatchObject({
      reason: 'step-complete',
      source: { fileId: 'waiting.asm', line: lineOf(WAIT_FOR_INPUT_SOURCE, 'MOVE.B D1,RESULT') },
    });
  });

  it.fails('stops after completing input when waiting inspection armed a debug session', () => {
    const emulator = createWaitingDebugger();
    emulator.pauseDebugger();
    emulator.queueInput('w');
    emulator.beginDebugContinue();

    for (let count = 0; count < 20 && !emulator.getDebugStop(); count += 1) {
      emulator.emulationStep();
    }

    expect(emulator.getDebugStop()).toMatchObject({
      reason: 'step-complete',
      source: { fileId: 'waiting.asm', line: lineOf(WAIT_FOR_INPUT_SOURCE, 'MOVE.B D1,RESULT') },
    });
    expect(emulator.getQueuedInputLength()).toBe(0);
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
