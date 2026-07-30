import { describe, expect, it } from 'vitest';
import { encodeMoveq, encodeNop } from '../../packages/interpreter/src/assembler/encoder';
import { createProgramImage } from '../../packages/interpreter/src/assembler/programImage';
import { StrictM68000Core } from '../../packages/interpreter/src/cpu/core';
import { runMoiraStep, runMusashiStep } from './musashiRunner';

function initialState() {
  return {
    d: new Array<number>(8).fill(0),
    a: [0, 0, 0, 0, 0, 0, 0, 0x2000],
    pc: 0x1000,
    sr: 0x2700,
  };
}

describe('pinned Musashi single-step runner', () => {
  it('executes NOP with the documented PC and cycle result', () => {
    expect(runMusashiStep(encodeNop(), initialState())).toMatchObject({
      pc: 0x1002,
      sr: 0x2700,
      cycles: 4,
    });
  });

  it('provides an independent MOVEQ state oracle', () => {
    const result = runMusashiStep(encodeMoveq(3, -1), initialState());
    expect(result.pc).toBe(0x1002);
    expect(result.d[3]).toBe(0xffffffff);
    expect(result.sr & 0x1f).toBe(0x08);
    expect(result.cycles).toBe(4);
  });

  it('agrees with the independently pinned Moira core for the initial slice', () => {
    for (const bytes of [encodeNop(), encodeMoveq(0, -128), encodeMoveq(7, 127)]) {
      const state = initialState();
      expect(runMoiraStep(bytes, state)).toMatchObject(runMusashiStep(bytes, state));
    }
  });

  it('matches the strict core for MOVEQ register and signed-byte boundaries', () => {
    for (let register = 0; register < 8; register += 1) {
      for (const immediate of [-128, -1, 0, 1, 127]) {
        const bytes = encodeMoveq(register, immediate);
        const state = initialState();
        const oracle = runMusashiStep(bytes, state);
        const local = new StrictM68000Core({
          state: {
            dataRegisters: state.d,
            addressRegisters: state.a,
            pc: state.pc,
            sr: state.sr,
          },
        });
        local.loadProgram(createProgramImage([{ bytes, line: 1 }], { origin: state.pc }));
        const localStep = local.step();

        expect(localStep).toMatchObject({
          kind: 'executed',
          pcAfter: oracle.pc,
          cycles: oracle.cycles,
        });
        expect(Array.from(local.state.d, (value) => value >>> 0)).toEqual(oracle.d);
        expect(local.state.sr & 0x1f).toBe(oracle.sr & 0x1f);
      }
    }
  });
});
