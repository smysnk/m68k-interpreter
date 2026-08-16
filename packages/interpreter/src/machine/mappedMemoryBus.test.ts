import { describe, expect, it } from 'vitest';
import { Memory } from '../core/memory';
import type { MemoryMappedDevice } from '../cpu/memoryBus';
import { MappedMemoryBus } from './mappedMemoryBus';

function device(): MemoryMappedDevice<{ value: number }> {
  let value = 0;
  return {
    id: 'test-device',
    addressRanges: () => [{ start: 0xe00010, end: 0xe00010 }],
    read8: (address) => (address === 0xe00010 ? value : undefined),
    write8: (address, next) => {
      if (address !== 0xe00010) return false;
      value = next;
      return true;
    },
    snapshot: () => ({ value }),
    reset: () => {
      value = 0;
    },
  };
}

describe('MappedMemoryBus', () => {
  it('routes exact registered addresses and leaves neighboring RAM alone', () => {
    const memory = new Memory();
    const bus = new MappedMemoryBus(memory, [device()]);
    bus.write8(0xe00010, 0xa5);
    bus.write8(0xe00011, 0x5a);
    expect(bus.read8(0xe00010)).toBe(0xa5);
    expect(bus.read8(0xe00011)).toBe(0x5a);
    expect(memory.getByte(0xe00010)).toBe(0);
  });

  it('enforces word alignment before routing', () => {
    const bus = new MappedMemoryBus(new Memory(), [device()]);
    expect(() => bus.read16(1)).toThrow(/Unaligned/);
  });
});
