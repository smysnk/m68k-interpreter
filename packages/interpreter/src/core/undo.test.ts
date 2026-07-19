import { describe, expect, it } from 'vitest';
import { Memory } from './memory';
import { Undo } from './undo';

describe('Undo', () => {
  it('captures a composed frame without retaining mutable CPU or diagnostics references', () => {
    const undo = new Undo();
    const memory = new Memory();
    const registers = new Int32Array([1, 2, 3]);
    const errors = ['before'];

    undo.push({
      cpu: { pc: 4, sr: 0x2001, usp: 0x1000, ssp: 0x2000, registers },
      memory: memory.createSnapshot(),
      deviceOutputs: { display: new Array(8).fill(0), leds: 0, outputVersion: 1 },
      diagnostics: { errors },
      execution: { lastInstruction: 'MOVE.B', line: 3 },
    });
    registers[0] = 99;
    errors.push('after');

    expect(undo.pop()).toMatchObject({
      cpu: {
        pc: 4,
        sr: 0x2001,
        usp: 0x1000,
        ssp: 0x2000,
        registers: new Int32Array([1, 2, 3]),
      },
      diagnostics: { errors: ['before'] },
      execution: { lastInstruction: 'MOVE.B', line: 3 },
    });
  });
});
