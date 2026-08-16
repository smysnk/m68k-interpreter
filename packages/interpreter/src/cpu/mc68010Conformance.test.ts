import { describe, expect, it } from 'vitest';
import { createProgramImage } from '../assembler/programImage';
import { StrictM68000Core } from './core';
import { RamBus } from './memoryBus';

type MemoryEa = {
  name: string;
  mode: number;
  register: number;
  extensions: number[];
};

const MEMORY_EFFECTIVE_ADDRESSES: readonly MemoryEa[] = [
  { name: '(A1)', mode: 2, register: 1, extensions: [] },
  { name: '(A1)+', mode: 3, register: 1, extensions: [] },
  { name: '-(A1)', mode: 4, register: 1, extensions: [] },
  { name: '0(A1)', mode: 5, register: 1, extensions: [0] },
  { name: '0(A1,D0.W)', mode: 6, register: 1, extensions: [0] },
  { name: '$0300.W', mode: 7, register: 0, extensions: [0x0300] },
  { name: '$00000300.L', mode: 7, register: 1, extensions: [0, 0x0300] },
];

function words(...values: number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => [(value >>> 8) & 0xff, value & 0xff]));
}

function readSized(bus: RamBus, address: number, size: 1 | 2 | 4): number {
  if (size === 1) return bus.read8(address);
  if (size === 2) return bus.read16(address);
  return bus.read32(address);
}

function writeSized(bus: RamBus, address: number, value: number, size: 1 | 2 | 4): void {
  if (size === 1) bus.write8(address, value);
  else if (size === 2) bus.write16(address, value);
  else bus.write32(address, value);
}

describe('MC68010 MOVES functional conformance matrix', () => {
  for (const size of [1, 2, 4] as const) {
    const sizeCode = size === 1 ? 0 : size === 2 ? 1 : 2;
    for (const ea of MEMORY_EFFECTIVE_ADDRESSES) {
      for (const direction of ['memory-to-register', 'register-to-memory'] as const) {
        it(`${direction} ${size * 8}-bit through ${ea.name}`, () => {
          const step = size === 1 ? 1 : size;
          const initialA1 = ea.mode === 4 ? 0x300 + step : 0x300;
          const opcode = 0x0e00 | (sizeCode << 6) | (ea.mode << 3) | ea.register;
          const extension = 0x7000 | (direction === 'register-to-memory' ? 0x0800 : 0);
          const instruction = words(opcode, extension, ...ea.extensions);
          const bus = new RamBus({ size: 0x4000 });
          const core = new StrictM68000Core({
            bus,
            cpuModel: 'm68010',
            state: {
              sr: 0x2700,
              ssp: 0x3f00,
              addressRegisters: [0, initialA1],
              sfc: 3,
              dfc: 4,
            },
          });
          core.state.d[7] = direction === 'register-to-memory' ? 0x8123_4567 | 0 : 0xaabb_ccdd | 0;
          const memoryValue = size === 1 ? 0x81 : size === 2 ? 0x8123 : 0x8123_4567;
          if (direction === 'memory-to-register') writeSized(bus, 0x300, memoryValue, size);
          core.loadProgram(
            createProgramImage([{ bytes: instruction, line: 1 }], { origin: 0x1000 })
          );

          expect(core.step()).toMatchObject({
            kind: 'executed',
            pcAfter: 0x1000 + instruction.length,
          });
          if (direction === 'memory-to-register') {
            const expected = size === 1 ? 0xaabb_cc81 : size === 2 ? 0xaabb_8123 : 0x8123_4567;
            expect(core.state.d[7] >>> 0).toBe(expected);
          } else {
            const expected = size === 1 ? 0x67 : size === 2 ? 0x4567 : 0x8123_4567;
            expect(readSized(bus, 0x300, size)).toBe(expected);
          }
          if (ea.mode === 3) expect(core.state.a[1] >>> 0).toBe(0x300 + step);
          if (ea.mode === 4) expect(core.state.a[1] >>> 0).toBe(0x300);
        });
      }
    }
  }

  it('sign-extends byte and word memory values loaded into address registers', () => {
    for (const [size, opcode, expected] of [
      [1, 0x0e10, 0xffff_ff80],
      [2, 0x0e50, 0xffff_8000],
    ] as const) {
      const bus = new RamBus({ size: 0x4000 });
      const core = new StrictM68000Core({
        bus,
        cpuModel: 'm68010',
        state: { sr: 0x2700, ssp: 0x3f00, addressRegisters: [0x300] },
      });
      writeSized(bus, 0x300, size === 1 ? 0x80 : 0x8000, size);
      core.loadProgram(
        createProgramImage([{ bytes: words(opcode, 0x8000), line: 1 }], { origin: 0x1000 })
      );
      expect(core.step()).toMatchObject({ kind: 'executed' });
      expect(core.state.a[0] >>> 0).toBe(expected);
    }
  });

  it('uses the A7 two-byte step for byte predecrement and postincrement exactly once', () => {
    for (const [mode, initialSp, expectedSp] of [
      [3, 0x300, 0x302],
      [4, 0x302, 0x300],
    ] as const) {
      const bus = new RamBus({ size: 0x4000 });
      const core = new StrictM68000Core({
        bus,
        cpuModel: 'm68010',
        state: { sr: 0x2700, ssp: initialSp },
      });
      core.state.d[0] = 0x7f;
      core.loadProgram(
        createProgramImage([{ bytes: words(0x0e00 | (mode << 3) | 7, 0x0800), line: 1 }], {
          origin: 0x1000,
        })
      );
      expect(core.step()).toMatchObject({ kind: 'executed' });
      expect(core.state.a[7] >>> 0).toBe(expectedSp);
      expect(bus.read8(0x300)).toBe(0x7f);
    }
  });

  it('rejects register-direct and user-mode MOVES before mutation', () => {
    for (const state of [
      { sr: 0x2700, expected: 'illegal-instruction' },
      { sr: 0x0000, expected: 'privilege-violation' },
    ]) {
      const bus = new RamBus({ size: 0x4000 });
      const core = new StrictM68000Core({
        bus,
        cpuModel: 'm68010',
        state: { sr: state.sr, usp: 0x3000, ssp: 0x3800 },
      });
      core.state.d[0] = 0x1234_5678;
      core.loadProgram(
        createProgramImage([{ bytes: words(0x0e00, 0x0800), line: 1 }], { origin: 0x1000 })
      );
      expect(core.step()).toMatchObject({ kind: 'exception', fault: { code: state.expected } });
      expect(core.state.d[0] >>> 0).toBe(0x1234_5678);
    }
  });
});
