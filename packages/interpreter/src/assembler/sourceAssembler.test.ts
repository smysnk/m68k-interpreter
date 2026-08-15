import { describe, expect, it } from 'vitest';
import { StrictM68000Core } from '../cpu/core';
import { assembleProgramSource } from './sourceAssembler';

describe('assembleProgramSource', () => {
  it('uses exact byte addresses for labels, data, and branch displacements', () => {
    const result = assembleProgramSource(`
        ORG $1000
START   MOVEQ #2,D0
LOOP    SUBQ.W #1,D0
        BNE LOOP
VALUE   DC.W $1234
        END START
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.symbols).toMatchObject({ start: 0x1000, loop: 0x1002, value: 0x1008 });
    expect(result.image).toMatchObject({ loadAddress: 0x1000, entryPoint: 0x1000 });
    expect(Array.from(result.image?.bytes ?? [])).toEqual([
      0x70, 0x02, 0x53, 0x40, 0x66, 0x00, 0xff, 0xfc, 0x12, 0x34,
    ]);
  });

  it('executes an assembled multi-instruction byte program in the strict core', () => {
    const result = assembleProgramSource(`
        ORG $1000
START   MOVEQ #3,D0
        ADDI.W #4,D0
        SUBQ.W #1,D0
        END START
`);
    expect(result.image).toBeDefined();
    const core = new StrictM68000Core();
    core.loadProgram(result.image!);
    core.step();
    core.step();
    core.step();
    expect(core.state.d[0]).toBe(6);
    expect(core.state.pc).toBe(0x1008);
  });

  it('supports DCB byte, word, and long directives', () => {
    const result = assembleProgramSource(`
        ORG $200
BYTES   DCB.B 3,$AA
WORDS   DCB.W 2,$1234
LONGS   DCB.L 1,$89ABCDEF
        END BYTES
`);
    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.image?.bytes ?? [])).toEqual([
      0xaa, 0xaa, 0xaa, 0x12, 0x34, 0x12, 0x34, 0x89, 0xab, 0xcd, 0xef,
    ]);
  });
});
