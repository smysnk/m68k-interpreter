import { describe, expect, it } from 'vitest';
import { Emulator } from '../core/emulator';
import type { CpuModel, MachineProfile } from '../isa/types';

const models: CpuModel[] = ['m68000', 'm68010'];
const machines: MachineProfile[] = ['bare', 'easy68k'];

describe.each(
  models.flatMap((cpuModel) =>
    machines.map((machineProfile) => [cpuModel, machineProfile] as const)
  )
)('Emulator debugger %s + %s', (cpuModel, machineProfile) => {
  it('stops before a source instruction and suppresses one boundary on Continue', () => {
    const emulator = new Emulator(
      `START
  MOVEQ #0,D0
LOOP
  ADDQ.L #1,D0
  BRA LOOP
  END START`,
      { emulation: { cpuModel, machineProfile }, debugFileId: 'matrix.asm' }
    );
    emulator.configureDebugger({
      breakpoints: [{ id: 'loop', enabled: true, kind: 'source', fileId: 'matrix.asm', line: 4 }],
    });
    emulator.beginDebugContinue();
    for (let count = 0; count < 10 && !emulator.getDebugStop(); count += 1)
      emulator.emulationStep();
    expect(emulator.getDebugStop()).toMatchObject({
      reason: 'breakpoint',
      breakpointId: 'loop',
      source: { fileId: 'matrix.asm', line: 4 },
    });
    expect(emulator.getRegisters()[8]).toBe(0);

    emulator.beginDebugContinue();
    emulator.emulationStep();
    expect(emulator.getRegisters()[8]).toBe(1);
    expect(emulator.getDebugStop()).toBeUndefined();
    emulator.emulationStep();
    emulator.emulationStep();
    expect(emulator.getDebugStop()?.reason).toBe('breakpoint');
    expect(emulator.getRegisters()[8]).toBe(1);
  });
});

describe('Emulator advanced debugger integration', () => {
  it('steps over a subroutine and records a logical call boundary', () => {
    const emulator = new Emulator(
      `START
  BSR SUB
  NOP
DONE BRA DONE
SUB
  MOVEQ #7,D0
  RTS
  END START`,
      { debugFileId: 'step.asm' }
    );
    expect(emulator.beginDebugStepOver()).toBe(true);
    for (let count = 0; count < 20 && !emulator.getDebugStop(); count += 1)
      emulator.emulationStep();
    expect(emulator.getDebugStop()).toMatchObject({ reason: 'step-complete', source: { line: 3 } });
    expect(emulator.getRegisters()[8]).toBe(7);
    expect(emulator.getDebugSnapshot().callStack).toEqual([]);
  });

  it('reports an exact write data breakpoint without instrumenting instruction fetch', () => {
    const emulator = new Emulator(
      `START
  MOVE.B #$5A,$2000
  NOP
  END START`,
      { debugFileId: 'watch.asm' }
    );
    emulator.configureDebugger({
      breakpoints: [],
      watchpoints: [{ id: 'write-byte', enabled: true, address: 0x2000, size: 1, access: 'write' }],
    });
    emulator.beginDebugContinue();
    emulator.emulationStep();
    expect(emulator.getDebugStop()).toMatchObject({
      reason: 'watchpoint',
      watchpointId: 'write-byte',
      access: { type: 'write', address: 0x2000, size: 1, value: 0x5a },
    });
  });

  it('distinguishes interrupt and exception policies from ordinary instruction cycles', () => {
    const interruptEmulator = new Emulator(
      `START BRA START
HANDLER RTS
  END START`,
      { emulation: { cpuModel: 'm68000', machineProfile: 'easy68k' }, debugFileId: 'irq.asm' }
    );
    interruptEmulator.configureDebugger({ breakpoints: [], breakOnInterrupt: true });
    expect(
      interruptEmulator.raiseExternalInterrupt(interruptEmulator.getSymbolAddress('HANDLER') ?? -1)
    ).toBe(true);
    interruptEmulator.beginDebugContinue();
    interruptEmulator.emulationStep();
    expect(interruptEmulator.getDebugStop()).toMatchObject({ reason: 'interrupt' });
    expect(interruptEmulator.getDebugSnapshot().callStack.at(-1)).toMatchObject({
      kind: 'interrupt',
    });

    const exceptionEmulator = new Emulator(
      `START
  MOVEQ #1,D0
  DIVU #0,D0
  END START`,
      { debugFileId: 'fault.asm' }
    );
    exceptionEmulator.configureDebugger({ breakpoints: [], breakOnException: true });
    exceptionEmulator.beginDebugContinue();
    exceptionEmulator.emulationStep();
    exceptionEmulator.emulationStep();
    expect(exceptionEmulator.getDebugStop()).toMatchObject({ reason: 'exception' });
  });
});
