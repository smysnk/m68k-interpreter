import { describe, expect, it } from 'vitest';
import { encodeBranch, encodeMoveq, encodeNop, encodeRts, encodeStop } from '../assembler/encoder';
import { createProgramImage } from '../assembler/programImage';
import { StrictM68000Core } from './core';
import { evaluateBranchCondition } from './conditions';
import { RamBus } from './memoryBus';

describe('StrictM68000Core byte execution', () => {
  it('fetches variable-length bytes and applies MOVEQ flags', () => {
    const core = new StrictM68000Core();
    core.loadProgram(
      createProgramImage(
        [
          { bytes: encodeNop(), line: 1 },
          { bytes: encodeMoveq(3, -1), line: 2 },
        ],
        { origin: 0x1000 }
      )
    );
    core.state.ccr = 0x1f;

    expect(core.step()).toEqual({
      kind: 'executed',
      pcBefore: 0x1000,
      pcAfter: 0x1002,
      cycles: 4,
    });
    expect(core.step()).toEqual({
      kind: 'executed',
      pcBefore: 0x1002,
      pcAfter: 0x1004,
      cycles: 4,
    });
    expect(core.state.d[3]).toBe(-1);
    expect(core.state.ccr).toBe(0x18);
  });

  it('uses the instruction-word PC as the branch displacement base', () => {
    const core = new StrictM68000Core({
      state: { sr: 0x2700 },
    });
    core.loadProgram(
      createProgramImage([{ bytes: encodeBranch('bra', -2), line: 1 }], {
        origin: 0x2000,
      })
    );

    expect(core.step()).toMatchObject({
      kind: 'executed',
      pcBefore: 0x2000,
      pcAfter: 0x2000,
    });
  });

  it('pushes an exact return address for BSR and restores it with RTS', () => {
    const bus = new RamBus();
    const core = new StrictM68000Core({
      bus,
      state: {
        sr: 0x2700,
        addressRegisters: [0, 0, 0, 0, 0, 0, 0, 0x3000],
      },
    });
    bus.load(0x1000, encodeBranch('bsr', 4));
    bus.load(0x1006, encodeRts());
    core.state.pc = 0x1000;

    expect(core.step()).toMatchObject({ pcAfter: 0x1006 });
    expect(core.state.a[7]).toBe(0x2ffc);
    expect(bus.read32(0x2ffc)).toBe(0x1002);
    expect(core.step()).toMatchObject({ pcAfter: 0x1002 });
    expect(core.state.a[7]).toBe(0x3000);
  });

  it('reports address and privilege faults without executing the instruction', () => {
    const oddPc = new StrictM68000Core({
      state: { pc: 1 },
    });
    expect(oddPc.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'address-error', vector: 3, address: 1 },
    });

    const userCore = new StrictM68000Core({
      state: { sr: 0x0000 },
    });
    userCore.loadProgram(createProgramImage([{ bytes: encodeStop(0x2700), line: 1 }]));
    expect(userCore.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'privilege-violation', vector: 8 },
    });
    expect(userCore.state.pc).toBe(0);
  });
});

describe('MC68000 condition evaluator', () => {
  it('evaluates every condition across all CCR combinations', () => {
    const conditions = [
      'bra',
      'bsr',
      'hi',
      'ls',
      'cc',
      'cs',
      'ne',
      'eq',
      'vc',
      'vs',
      'pl',
      'mi',
      'ge',
      'lt',
      'gt',
      'le',
    ] as const;

    for (let ccr = 0; ccr < 32; ccr += 1) {
      for (const condition of conditions) {
        expect(typeof evaluateBranchCondition(condition, ccr)).toBe('boolean');
      }
      expect(evaluateBranchCondition('hi', ccr)).toBe((ccr & 0x01) === 0 && (ccr & 0x04) === 0);
      expect(evaluateBranchCondition('gt', ccr)).toBe(
        (ccr & 0x04) === 0 && ((ccr & 0x08) !== 0) === ((ccr & 0x02) !== 0)
      );
    }
  });
});
