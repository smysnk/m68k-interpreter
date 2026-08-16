import { describe, expect, it } from 'vitest';
import type { EmulationConfig } from '../isa/types';
import { Emulator } from './emulator';

const combinations: EmulationConfig[] = [
  { cpuModel: 'm68000', machineProfile: 'bare' },
  { cpuModel: 'm68010', machineProfile: 'bare' },
  { cpuModel: 'm68000', machineProfile: 'easy68k' },
  { cpuModel: 'm68010', machineProfile: 'easy68k' },
];

describe.each(combinations)('$cpuModel + $machineProfile', (emulation) => {
  it('executes MC68000 instructions', () => {
    const emulator = new Emulator('START\n  MOVE.L #7,D0\n  END START', { emulation });
    expect(emulator.stepInstruction().kind).toBe('executed');
    expect(emulator.getRegisters()[8]).toBe(7);
  });

  it('accepts architectural IRQ requests', () => {
    const emulator = new Emulator('START\n  BRA START\n  END START', { emulation });
    expect(emulator.requestInterruptLevel(3)).toBe('accepted');
    expect(emulator.getPendingInterruptLevels()).toEqual([3]);
  });

  it(`${emulation.machineProfile === 'easy68k' ? 'routes' : 'does not route'} mapped hardware`, () => {
    const emulator = new Emulator('START\n  END START', { emulation });
    emulator.writeMemoryByte(0xe00010, 0xa5);
    expect(emulator.getHardwareSnapshot().leds).toBe(
      emulation.machineProfile === 'easy68k' ? 0xa5 : 0
    );
    if (emulation.machineProfile === 'bare') {
      expect(emulator.readMemoryRange(0xe00010, 1)[0]).toBe(0xa5);
    }
  });
});

describe('orthogonal capability gates', () => {
  it.each(['m68000', 'm68010'] as const)('provides Easy68K traps on %s', (cpuModel) => {
    const emulator = new Emulator(
      `START
  MOVE.B #'A',D0
  TRAP #15
  DC.W 1
  TRAP #11
  DC.W 0
  END START`,
      { emulation: { cpuModel, machineProfile: 'easy68k' } }
    );
    for (let index = 0; index < 4 && !emulator.isHalted(); index += 1) emulator.emulationStep();
    expect(emulator.getTerminalText()).toContain('A');
  });

  it('does not intercept Easy68K traps on Bare', () => {
    const emulator = new Emulator('START\n  TRAP #15\n  DC.W 1\n  END START', {
      emulation: { cpuModel: 'm68000', machineProfile: 'bare' },
    });
    expect(emulator.stepInstruction()).toMatchObject({ kind: 'exception' });
    expect(emulator.getTerminalText().trim()).toBe('');
  });

  it('reads the Easy68K task word from live memory', () => {
    const emulator = new Emulator(
      `START
  MOVE.B #'A',D0
  TRAP #15
  DC.W 1
  END START`
    );
    emulator.stepInstruction();
    const trapAddress = emulator.getPC();
    emulator.writeMemoryWord(trapAddress + 2, 4);
    emulator.stepInstruction();
    expect(emulator.getTerminalText().trim()).toBe('');
  });
});
