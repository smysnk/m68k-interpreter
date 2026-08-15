import { StrictM68000Core } from '../../packages/interpreter/src/cpu/core';
import {
  BusFault,
  type BusAccessType,
  type MemoryBus,
} from '../../packages/interpreter/src/cpu/memoryBus';
import type { MameSingleStepVector } from './mameVectors';

const ADDRESS_MASK = 0x00ff_ffff;

class SparseM68000Bus implements MemoryBus {
  private readonly bytes = new Map<number, number>();

  private address(address: number, size: 1 | 2 | 4, access: BusAccessType): number {
    const normalized = address & ADDRESS_MASK;
    if (size > 1 && (normalized & 1) !== 0) {
      throw new BusFault(
        'address-error',
        normalized,
        access,
        size,
        `Unaligned ${size * 8}-bit bus access at ${normalized.toString(16)}`
      );
    }
    return normalized;
  }

  read8(address: number, access: BusAccessType = 'read'): number {
    return this.bytes.get(this.address(address, 1, access)) ?? 0;
  }

  read16(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.address(address, 2, access);
    return (this.read8(normalized, access) << 8) | this.read8(normalized + 1, access);
  }

  read32(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.address(address, 4, access);
    return ((this.read16(normalized, access) << 16) | this.read16(normalized + 2, access)) >>> 0;
  }

  write8(address: number, value: number): void {
    this.bytes.set(this.address(address, 1, 'write'), value & 0xff);
  }

  write16(address: number, value: number): void {
    const normalized = this.address(address, 2, 'write');
    this.write8(normalized, value >>> 8);
    this.write8(normalized + 1, value);
  }

  write32(address: number, value: number): void {
    const normalized = this.address(address, 4, 'write');
    this.write16(normalized, value >>> 16);
    this.write16(normalized + 2, value);
  }
}

export interface MameExecutionComparison {
  differences: string[];
  faultCode?: string;
}

function definedStatusMask(vector: MameSingleStepVector): number {
  const mnemonic = vector.name.split(' ')[1];
  if (mnemonic === 'ABCD' || mnemonic === 'SBCD' || mnemonic === 'NBCD') {
    // Motorola defines X, Z, and C; N and V are undefined.
    return 0xffff & ~0x0a;
  }
  if ((mnemonic === 'DIVS' || mnemonic === 'DIVU') && (vector.final.registers.sr & 0x02) !== 0) {
    // Quotient overflow leaves N and Z undefined.
    return 0xffff & ~0x0c;
  }
  if (mnemonic === 'CHK') {
    // CHK preserves X; the remaining condition codes are undefined.
    return 0xffff & ~0x0f;
  }
  return 0xffff;
}

export function compareMameVector(vector: MameSingleStepVector): MameExecutionComparison {
  const initial = vector.initial.registers;
  const bus = new SparseM68000Bus();
  for (const [address, value] of vector.initial.ram) bus.write8(address, value);
  const core = new StrictM68000Core({
    bus,
    state: {
      dataRegisters: Array.from(
        { length: 8 },
        (_, index) => initial[`d${index}` as keyof typeof initial]
      ),
      addressRegisters: [
        initial.a0,
        initial.a1,
        initial.a2,
        initial.a3,
        initial.a4,
        initial.a5,
        initial.a6,
        (initial.sr & 0x2000) !== 0 ? initial.ssp : initial.usp,
      ],
      pc: ((initial.pc & ADDRESS_MASK) - 4) & ADDRESS_MASK,
      sr: initial.sr,
      usp: initial.usp,
      ssp: initial.ssp,
    },
  });

  const result = core.step();
  const expected = vector.final.registers;
  const actual = core.state.snapshot();
  const differences: string[] = [];
  const expectedData = Array.from(
    { length: 8 },
    (_, index) => expected[`d${index}` as keyof typeof expected]
  );
  const expectedAddress = [
    expected.a0,
    expected.a1,
    expected.a2,
    expected.a3,
    expected.a4,
    expected.a5,
    expected.a6,
  ];

  for (let index = 0; index < 8; index += 1) {
    if (actual.d[index] >>> 0 !== expectedData[index]) differences.push(`D${index}`);
  }
  for (let index = 0; index < 7; index += 1) {
    if (actual.a[index] >>> 0 !== expectedAddress[index]) differences.push(`A${index}`);
  }
  if (actual.pc !== (((expected.pc & ADDRESS_MASK) - 4) & ADDRESS_MASK)) differences.push('PC');
  const statusMask = definedStatusMask(vector);
  if ((actual.sr & statusMask) !== (expected.sr & statusMask)) differences.push('SR');
  if (actual.usp !== expected.usp) differences.push('USP');
  if (actual.ssp !== expected.ssp) differences.push('SSP');
  for (const [address, value] of vector.final.ram) {
    if (bus.read8(address) !== value) differences.push(`RAM:$${address.toString(16)}`);
  }

  return {
    differences,
    faultCode: result.kind === 'exception' ? result.fault.code : undefined,
  };
}
