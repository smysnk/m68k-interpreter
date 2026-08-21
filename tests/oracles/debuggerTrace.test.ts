import { describe, expect, it } from 'vitest';
import { createProgramImage } from '../../packages/interpreter/src/assembler/programImage';
import { StrictM68000Core } from '../../packages/interpreter/src/cpu/core';
import { runOracleTrace, type OracleCpuModel } from './musashiRunner';

const program = Uint8Array.from([
  0x70,
  0x01, // MOVEQ #1,D0
  0x61,
  0x04, // BSR SUB
  0x4e,
  0x71, // NOP (step-over fallthrough)
  0x60,
  0xfe, // BRA.S *
  0x72,
  0x02, // SUB: MOVEQ #2,D1
  0x4e,
  0x75, // RTS
]);

function initialState() {
  return {
    d: new Array<number>(8).fill(0),
    a: [0, 0, 0, 0, 0, 0, 0, 0x3000],
    pc: 0x1000,
    sr: 0x2700,
  };
}

describe('normalized multi-instruction debugger oracle traces', () => {
  it.each(['m68000', 'm68010'] satisfies OracleCpuModel[])(
    'keeps Musashi, Moira, and the local %s core on identical call/return boundaries',
    (cpuModel) => {
      const state = initialState();
      const musashi = runOracleTrace('musashi', program, state, 6, cpuModel);
      const moira = runOracleTrace('moira', program, state, 6, cpuModel);

      expect(musashi.version).toBe(1);
      expect(musashi.rows.map((row) => row.pcBefore)).toEqual([
        0x1000, 0x1002, 0x1008, 0x100a, 0x1004, 0x1006,
      ]);
      expect(moira.rows.map((row) => row.pcBefore)).toEqual(
        musashi.rows.map((row) => row.pcBefore)
      );

      const local = new StrictM68000Core({
        cpuModel,
        state: {
          dataRegisters: state.d,
          addressRegisters: state.a,
          pc: state.pc,
          sr: state.sr,
        },
      });
      local.loadProgram(createProgramImage([{ bytes: program, line: 1 }], { origin: state.pc }));

      for (const oracleRow of musashi.rows) {
        expect(local.state.pc).toBe(oracleRow.pcBefore);
        const result = local.step();
        expect(result).toMatchObject({ kind: 'executed', pcAfter: oracleRow.state.pc });
        expect(Array.from(local.state.d, (value) => value >>> 0)).toEqual(oracleRow.state.d);
        expect(Array.from(local.state.a, (value) => value >>> 0)).toEqual(oracleRow.state.a);
        expect(local.state.sr).toBe(oracleRow.state.sr);
      }

      for (let index = 0; index < musashi.rows.length; index += 1) {
        expect(moira.rows[index]?.state, `trace row ${index}`).toMatchObject({
          d: musashi.rows[index]?.state.d,
          a: musashi.rows[index]?.state.a,
          pc: musashi.rows[index]?.state.pc,
          sr: musashi.rows[index]?.state.sr,
        });
      }
    }
  );
});
