import { describe, expect, it } from 'vitest';
import { encodeBranch, encodeMoveq, encodeNop, encodeRts, encodeStop } from '../assembler/encoder';
import { createProgramImage } from '../assembler/programImage';
import { StrictM68000Core } from './core';
import { evaluateBranchCondition, evaluateConditionCode } from './conditions';
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
      expect(evaluateConditionCode(0, ccr)).toBe(true);
      expect(evaluateConditionCode(1, ccr)).toBe(false);
    }
  });
});

describe('StrictM68000Core condition and bit-operation slice', () => {
  it('executes PEA through the shared control effective-address path', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: {
        sr: 0x2700,
        addressRegisters: [0x1234, 0, 0, 0, 0, 0, 0, 0x3000],
      },
    });
    bus.load(0x1000, Uint8Array.of(0x48, 0x50)); // PEA (A0)
    core.state.pc = 0x1000;

    expect(core.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1002 });
    expect(core.state.a[7] >>> 0).toBe(0x2ffc);
    expect(bus.read32(0x2ffc)).toBe(0x1234);
  });

  it('implements DBcc word-counter termination without touching flags', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x271f, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0x51, 0xc8, 0xff, 0xfe)); // DBF D0,-2
    core.state.d[0] = 1;

    expect(core.step()).toMatchObject({ pcAfter: 0x1000 });
    expect(core.state.d[0]).toBe(0);
    expect(core.state.ccr).toBe(0x1f);
    expect(core.step()).toMatchObject({ pcAfter: 0x1004 });
    expect(core.state.d[0] & 0xffff).toBe(0xffff);
    expect(core.state.ccr).toBe(0x1f);
  });

  it('writes Scc byte results without changing the condition codes', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x2700, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0x56, 0xc1)); // SNE D1
    core.state.d[1] = 0x1234_5600;

    expect(core.step()).toMatchObject({ pcAfter: 0x1002 });
    expect(core.state.d[1] >>> 0).toBe(0x1234_56ff);
    expect(core.state.ccr).toBe(0);
  });

  it('normalizes static memory bit numbers modulo eight and preserves non-Z flags', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x271b, pc: 0x1000, addressRegisters: [0x200] },
    });
    bus.load(0x1000, Uint8Array.of(0x08, 0xd0, 0x00, 0x0f)); // BSET #15,(A0)
    bus.write8(0x200, 0);

    expect(core.step()).toMatchObject({ pcAfter: 0x1004 });
    expect(bus.read8(0x200)).toBe(0x80);
    expect(core.state.ccr).toBe(0x1f);
  });
});

describe('StrictM68000Core extend-aware arithmetic slice', () => {
  it('implements ADDX sticky zero and partial data-register writes', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x2704, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0xd3, 0x00, 0xd3, 0x00)); // ADDX.B D0,D1 twice
    core.state.d[0] = 0;
    core.state.d[1] = 0x1234_5600;

    core.step();
    expect(core.state.d[1] >>> 0).toBe(0x1234_5600);
    expect(core.state.ccr & 0x04).toBe(0x04);

    core.state.d[0] = 1;
    core.step();
    expect(core.state.d[1] >>> 0).toBe(0x1234_5601);
    expect(core.state.ccr & 0x04).toBe(0);
  });

  it('applies two ordered predecrements for aliased memory ADDX operands', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2704, pc: 0x1000, addressRegisters: [0x204] },
    });
    bus.load(0x1000, Uint8Array.of(0xd1, 0x08)); // ADDX.B -(A0),-(A0)
    bus.write8(0x203, 2);
    bus.write8(0x202, 3);

    core.step();

    expect(core.state.a[0] >>> 0).toBe(0x202);
    expect(bus.read8(0x202)).toBe(5);
  });

  it('executes packed BCD carry and sticky-zero behavior', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x2704, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0xc3, 0x00)); // ABCD D0,D1
    core.state.d[0] = 0x55;
    core.state.d[1] = 0x45;

    core.step();

    expect(core.state.d[1] & 0xff).toBe(0);
    expect(core.state.ccr & 0x15).toBe(0x15);
  });

  it('compares sequential memory operands when CMPM aliases an address register', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2710, pc: 0x1000, addressRegisters: [0x200] },
    });
    bus.load(0x1000, Uint8Array.of(0xb1, 0x08)); // CMPM.B (A0)+,(A0)+
    bus.write8(0x200, 1);
    bus.write8(0x201, 2);

    core.step();

    expect(core.state.a[0] >>> 0).toBe(0x202);
    expect(core.state.ccr).toBe(0x10);
  });

  it('rotates through X and reports the shifted bit in X and C', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x2710, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0xe3, 0x10)); // ROXL.B #1,D0
    core.state.d[0] = 0x1234_5680;

    core.step();

    expect(core.state.d[0] >>> 0).toBe(0x1234_5601);
    expect(core.state.ccr).toBe(0x11);
  });
});

describe('StrictM68000Core status, stack, and system slice', () => {
  it('executes immediate CCR operations and protects the status register', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x0000, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0x00, 0x3c, 0x00, 0x11)); // ORI #$11,CCR
    bus.load(0x1004, Uint8Array.of(0x02, 0x7c, 0xff, 0xff)); // ANDI #$ffff,SR

    expect(core.step()).toMatchObject({ kind: 'executed', pcAfter: 0x1004 });
    expect(core.state.ccr).toBe(0x11);
    expect(core.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'privilege-violation', vector: 8 },
    });
    expect(core.state.pc).toBe(0x1004);
  });

  it('creates and tears down LINK stack frames', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2700, pc: 0x1000, addressRegisters: [0, 0, 0, 0, 0, 0, 0x2222, 0x3000] },
    });
    bus.load(0x1000, Uint8Array.of(0x4e, 0x56, 0xff, 0xf8, 0x4e, 0x5e));

    expect(core.step()).toMatchObject({ pcAfter: 0x1004 });
    expect(core.state.a[6] >>> 0).toBe(0x2ffc);
    expect(core.state.a[7] >>> 0).toBe(0x2ff4);
    expect(bus.read32(0x2ffc)).toBe(0x2222);
    expect(core.step()).toMatchObject({ pcAfter: 0x1006 });
    expect(core.state.a[6] >>> 0).toBe(0x2222);
    expect(core.state.a[7] >>> 0).toBe(0x3000);
  });

  it('moves the user stack pointer only in supervisor mode', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2700, pc: 0x1000, usp: 0x3330, addressRegisters: [0x2220] },
    });
    bus.load(0x1000, Uint8Array.of(0x4e, 0x60, 0x4e, 0x69)); // MOVE A0,USP; MOVE USP,A1

    core.step();
    core.step();
    expect(core.state.usp).toBe(0x2220);
    expect(core.state.a[1] >>> 0).toBe(0x2220);
  });

  it('restores CCR and PC with RTR', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2700, pc: 0x1000, addressRegisters: [0, 0, 0, 0, 0, 0, 0, 0x3000] },
    });
    bus.load(0x1000, Uint8Array.of(0x4e, 0x77));
    bus.write16(0x3000, 0x0015);
    bus.write32(0x3002, 0x0012_3456);

    expect(core.step()).toMatchObject({ pcAfter: 0x0012_3456 });
    expect(core.state.ccr).toBe(0x15);
    expect(core.state.a[7] >>> 0).toBe(0x3006);
  });

  it('moves SR and CCR through effective addresses', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({ bus, state: { sr: 0x2715, pc: 0x1000 } });
    bus.load(0x1000, Uint8Array.of(0x40, 0xc0, 0x44, 0xc1, 0x46, 0xc2));
    core.state.d[1] = 0x000a;
    core.state.d[2] = 0x2704;

    core.step();
    expect(core.state.d[0] & 0xffff).toBe(0x2715);
    core.step();
    expect(core.state.ccr).toBe(0x0a);
    core.step();
    expect(core.state.sr).toBe(0x2704);
  });

  it('transfers MOVEP bytes at two-byte intervals in both directions', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2700, pc: 0x1000, addressRegisters: [0x200] },
    });
    bus.load(0x1000, Uint8Array.of(0x01, 0x08, 0x00, 0x04, 0x03, 0xc8, 0x00, 0x08));
    bus.write8(0x204, 0x12);
    bus.write8(0x206, 0x34);

    core.step();
    expect(core.state.d[0] & 0xffff).toBe(0x1234);
    core.state.d[1] = 0x5678_9abc;
    core.step();
    expect([0, 1, 2, 3].map((index) => bus.read8(0x208 + index * 2))).toEqual([
      0x56, 0x78, 0x9a, 0xbc,
    ]);
  });

  it('checks bounds, tests-and-sets once, traps overflow, and shifts memory', () => {
    const bus = new RamBus({ size: 0x4000 });
    const core = new StrictM68000Core({
      bus,
      state: { sr: 0x2700, pc: 0x1000, addressRegisters: [0x200] },
    });
    bus.load(
      0x1000,
      Uint8Array.of(
        0x43,
        0x80, // CHK.W D0,D1
        0x4a,
        0xd0, // TAS (A0)
        0xe3,
        0xd0, // ASL.W (A0)
        0x4e,
        0x76 // TRAPV
      )
    );
    core.state.d[0] = 10;
    core.state.d[1] = 5;
    bus.write16(0x200, 1);

    expect(core.step()).toMatchObject({ kind: 'executed' });
    expect(core.step()).toMatchObject({ kind: 'executed' });
    expect(bus.read16(0x200)).toBe(0x8001);
    expect(core.step()).toMatchObject({ kind: 'executed' });
    expect(bus.read16(0x200)).toBe(0x0002);
    expect(core.state.ccr & 0x13).toBe(0x13);
    expect(core.step()).toMatchObject({
      kind: 'exception',
      fault: { code: 'trapv', vector: 7 },
    });
  });
});
