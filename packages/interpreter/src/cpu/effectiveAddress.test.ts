import { describe, expect, it } from 'vitest';
import { InstructionStream } from './instructionStream';
import { RamBus } from './memoryBus';
import { M68000State } from './state';
import { resolveEffectiveAddress } from './effectiveAddress';

function setup() {
  const bus = new RamBus({ size: 0x10_000 });
  const state = new M68000State({ sr: 0x2000 });
  return { bus, state };
}

describe('effective-address transactions', () => {
  it('preserves upper data-register bits for byte and word writes', () => {
    const { bus, state } = setup();
    state.d[2] = 0x1234_5678;

    resolveEffectiveAddress(0, 2, {
      state,
      bus,
      stream: new InstructionStream(bus, 0),
      size: 1,
      access: 'write',
    }).write(0xab);
    expect(state.d[2] >>> 0).toBe(0x1234_56ab);

    resolveEffectiveAddress(0, 2, {
      state,
      bus,
      stream: new InstructionStream(bus, 0),
      size: 2,
      access: 'write',
    }).write(0xcdef);
    expect(state.d[2] >>> 0).toBe(0x1234_cdef);
  });

  it('applies A7 byte postincrement exactly once for read-modify-write', () => {
    const { bus, state } = setup();
    state.a[7] = 0x100;
    bus.write8(0x100, 0x12);
    const transaction = resolveEffectiveAddress(3, 7, {
      state,
      bus,
      stream: new InstructionStream(bus, 0),
      size: 1,
      access: 'readwrite',
    });

    expect(transaction.read()).toBe(0x12);
    transaction.write(0x34);

    expect(state.a[7] >>> 0).toBe(0x102);
    expect(bus.read8(0x100)).toBe(0x34);
  });

  it('prepares indexed and PC-relative addresses from extension words', () => {
    const { bus, state } = setup();
    state.a[1] = 0x200;
    state.d[3] = 4;
    bus.write16(0x20, 0x3006);
    const indexed = resolveEffectiveAddress(6, 1, {
      state,
      bus,
      stream: new InstructionStream(bus, 0x20),
      size: 2,
      access: 'address',
    });
    expect(indexed.resolveAddress()).toBe(0x20a);

    bus.write16(0x30, 0x0010);
    const pcRelative = resolveEffectiveAddress(7, 2, {
      state,
      bus,
      stream: new InstructionStream(bus, 0x30),
      size: 2,
      access: 'address',
    });
    expect(pcRelative.resolveAddress()).toBe(0x40);
  });

  it('preserves the full 32-bit computed address while the bus masks it to 24 bits', () => {
    const { bus, state } = setup();
    state.a[1] = 0x1200_0200;
    bus.write16(0x20, 0x0006);
    const indexed = resolveEffectiveAddress(6, 1, {
      state,
      bus,
      stream: new InstructionStream(bus, 0x20),
      size: 2,
      access: 'address',
    });

    expect(indexed.resolveAddress()).toBe(0x1200_0206);
  });

  it('reads byte, word, and long immediate values with exact extension lengths', () => {
    const { bus, state } = setup();
    bus.write16(0x40, 0x00fe);
    bus.write16(0x42, 0x8123);
    bus.write32(0x44, 0x89ab_cdef);
    const stream = new InstructionStream(bus, 0x40);

    expect(
      resolveEffectiveAddress(7, 4, { state, bus, stream, size: 1, access: 'read' }).read()
    ).toBe(0xfe);
    expect(
      resolveEffectiveAddress(7, 4, { state, bus, stream, size: 2, access: 'read' }).read()
    ).toBe(0x8123);
    expect(
      resolveEffectiveAddress(7, 4, { state, bus, stream, size: 4, access: 'read' }).read()
    ).toBe(0x89ab_cdef);
    expect(stream.cursor).toBe(0x48);
  });
});
