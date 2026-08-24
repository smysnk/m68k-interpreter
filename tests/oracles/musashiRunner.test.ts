import { describe, expect, it } from 'vitest';
import { encodeMoveq, encodeNop } from '../../packages/interpreter/src/assembler/encoder';
import { createProgramImage } from '../../packages/interpreter/src/assembler/programImage';
import { StrictM68000Core } from '../../packages/interpreter/src/cpu/core';
import { RamBus } from '../../packages/interpreter/src/cpu/memoryBus';
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

  it('matches both independent cores for migrated register and immediate families', () => {
    const cases = [
      { name: 'MOVE.B D0,D1', bytes: [0x12, 0x00], d: [0x80, 0x1234_5600] },
      { name: 'MOVEA.W #$ffff,A0', bytes: [0x30, 0x7c, 0xff, 0xff] },
      { name: 'ADDI.B #1,D0', bytes: [0x06, 0x00, 0x00, 0x01], d: [0x7f] },
      { name: 'SUBQ.W #8,A0', bytes: [0x51, 0x48], a: [0x100] },
      { name: 'ADD.W D0,D1', bytes: [0xd2, 0x40], d: [3, 4] },
      { name: 'NEG.W D0', bytes: [0x44, 0x40], d: [1] },
      { name: 'MULU #3,D0', bytes: [0xc0, 0xfc, 0x00, 0x03], d: [7] },
      { name: 'DIVU #4,D0', bytes: [0x80, 0xfc, 0x00, 0x04], d: [20] },
      { name: 'EXG D0,D1', bytes: [0xc1, 0x41], d: [1, 2] },
      { name: 'EXT.W D0', bytes: [0x48, 0x80], d: [0x1234_5680] },
      { name: 'SWAP D0', bytes: [0x48, 0x40], d: [0x1234_5678] },
      { name: 'ASL.B #1,D0', bytes: [0xe3, 0x00], d: [0x81] },
    ] as const;

    for (const testCase of cases) {
      const state = initialState();
      testCase.d?.forEach((value, index) => (state.d[index] = value));
      testCase.a?.forEach((value, index) => (state.a[index] = value));
      const bytes = Uint8Array.from(testCase.bytes);
      const musashi = runMusashiStep(bytes, state);
      const moira = runMoiraStep(bytes, state);
      // Moira's standalone runner currently preserves Z for the immediate
      // DIVU fixture while Musashi and the Motorola-defined quotient flags
      // clear it. Keep Musashi authoritative for that one known runner seam.
      if (testCase.name !== 'DIVU #4,D0') {
        expect(moira, testCase.name).toMatchObject({
          d: musashi.d,
          a: musashi.a,
          pc: musashi.pc,
          sr: musashi.sr,
        });
      }

      const local = new StrictM68000Core({
        state: {
          dataRegisters: state.d,
          addressRegisters: state.a,
          pc: state.pc,
          sr: state.sr,
        },
      });
      local.loadProgram(createProgramImage([{ bytes, line: 1 }], { origin: state.pc }));
      expect(local.step(), testCase.name).toMatchObject({ kind: 'executed', pcAfter: musashi.pc });
      expect(
        Array.from(local.state.d, (value) => value >>> 0),
        testCase.name
      ).toEqual(musashi.d);
      expect(
        Array.from(local.state.a, (value) => value >>> 0),
        testCase.name
      ).toEqual(musashi.a);
      expect(local.state.sr, testCase.name).toBe(musashi.sr);
    }
  });

  it('matches both independent MC68010 cores for new control and MOVES forms', () => {
    const cases = [
      {
        name: 'MOVEC D0,VBR',
        bytes: [0x4e, 0x7b, 0x08, 0x01],
        d: [0x1234_0000],
      },
      {
        name: 'MOVEC SFC,D1',
        bytes: [0x4e, 0x7a, 0x10, 0x00],
        sfc: 7,
      },
      {
        name: 'MOVEC D2,DFC',
        bytes: [0x4e, 0x7b, 0x20, 0x01],
        d: [0, 0, 6],
      },
      {
        name: 'MOVES.W D0,(A0)',
        bytes: [0x0e, 0x50, 0x08, 0x00],
        d: [0x1234],
        a: [0x300],
        dfc: 4,
      },
      {
        name: 'MOVES.B (A0),D1',
        bytes: [0x0e, 0x10, 0x10, 0x00],
        d: [0, 0x1234_5678],
        a: [0x300],
        sfc: 3,
      },
    ] as const;

    for (const testCase of cases) {
      const state = {
        ...initialState(),
        vbr: 0,
        sfc: testCase.sfc ?? 0,
        dfc: testCase.dfc ?? 0,
      };
      testCase.d?.forEach((value, index) => (state.d[index] = value));
      testCase.a?.forEach((value, index) => (state.a[index] = value));
      const bytes = Uint8Array.from(testCase.bytes);
      const musashi = runMusashiStep(bytes, state, 'm68010');
      const moira = runMoiraStep(bytes, state, 'm68010');

      expect(moira, testCase.name).toMatchObject({
        d: musashi.d,
        a: musashi.a,
        pc: musashi.pc,
        sr: musashi.sr,
        vbr: musashi.vbr,
        sfc: musashi.sfc,
        dfc: musashi.dfc,
      });

      const bus = new RamBus({ size: 0x4000 });
      const local = new StrictM68000Core({
        bus,
        cpuModel: 'm68010',
        state: {
          dataRegisters: state.d,
          addressRegisters: state.a,
          pc: state.pc,
          sr: state.sr,
          vbr: state.vbr,
          sfc: state.sfc,
          dfc: state.dfc,
        },
      });
      local.loadProgram(createProgramImage([{ bytes, line: 1 }], { origin: state.pc }));
      expect(local.step(), testCase.name).toMatchObject({ kind: 'executed', pcAfter: musashi.pc });
      expect(
        Array.from(local.state.d, (value) => value >>> 0),
        testCase.name
      ).toEqual(musashi.d);
      expect(
        Array.from(local.state.a, (value) => value >>> 0),
        testCase.name
      ).toEqual(musashi.a);
      expect(local.state.sr, testCase.name).toBe(musashi.sr);
      expect(local.state.vbr, testCase.name).toBe(musashi.vbr);
      expect(local.state.sfc, testCase.name).toBe(musashi.sfc);
      expect(local.state.dfc, testCase.name).toBe(musashi.dfc);
      if (testCase.name === 'MOVES.W D0,(A0)') {
        expect(bus.read16(0x300)).toBe(0x1234);
        expect(musashi.writes).toContainEqual([0x300, 2, 0x1234]);
      }
    }
  });

  it('matches both independent MC68020 cores for representative added families', () => {
    const cases = [
      { name: 'EXTB.L D0', bytes: [0x49, 0xc0], d: [0x1234_5680] },
      { name: 'MULU.L D0,D1', bytes: [0x4c, 0x00, 0x10, 0x01], d: [3, 7] },
      { name: 'PACK D0,D1,#0', bytes: [0x83, 0x40, 0x00, 0x00], d: [0x1234, 0x5566_7700] },
      { name: 'BFEXTU D0{8:8},D1', bytes: [0xe9, 0xc0, 0x12, 0x08], d: [0x12ab_0000] },
    ] as const;

    for (const testCase of cases) {
      const state = initialState();
      testCase.d.forEach((value, index) => (state.d[index] = value));
      const bytes = Uint8Array.from(testCase.bytes);
      const musashi = runMusashiStep(bytes, state, 'm68020');
      const moira = runMoiraStep(bytes, state, 'm68020');
      expect(moira, testCase.name).toMatchObject({
        d: musashi.d,
        a: musashi.a,
        pc: musashi.pc,
        sr: musashi.sr,
      });

      const local = new StrictM68000Core({
        cpuModel: 'm68020',
        state: {
          dataRegisters: state.d,
          addressRegisters: state.a,
          pc: state.pc,
          sr: state.sr,
        },
      });
      local.loadProgram(createProgramImage([{ bytes, line: 1 }], { origin: state.pc }));
      expect(local.step(), testCase.name).toMatchObject({ kind: 'executed', pcAfter: musashi.pc });
      expect(
        Array.from(local.state.d, (value) => value >>> 0),
        testCase.name
      ).toEqual(musashi.d);
      expect(local.state.sr, testCase.name).toBe(musashi.sr);
    }
  });
});
