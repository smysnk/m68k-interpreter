import type { Memory } from '../core/memory';
import {
  BusFault,
  type BusAccessType,
  type MemoryBus,
  type MemoryMappedDevice,
} from '../cpu/memoryBus';

const ADDRESS_MASK = 0x00ff_ffff;

export class MappedMemoryBus implements MemoryBus {
  constructor(
    private readonly memory: Memory,
    private readonly devices: readonly MemoryMappedDevice[] = [],
    private readonly beforeRamWrite?: (address: number) => void
  ) {}

  private normalize(address: number, access: BusAccessType, size: 1 | 2 | 4): number {
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

  private findDevice(address: number): MemoryMappedDevice | undefined {
    for (const device of this.devices) {
      for (const range of device.addressRanges()) {
        if (address < range.start) break;
        if (address <= range.end) return device;
      }
    }
    return undefined;
  }

  read8(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.normalize(address, access, 1);
    return this.findDevice(normalized)?.read8(normalized) ?? this.memory.getByte(normalized);
  }

  read16(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.normalize(address, access, 2);
    return ((this.read8(normalized, access) << 8) | this.read8(normalized + 1, access)) >>> 0;
  }

  read32(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.normalize(address, access, 4);
    return (
      ((this.read8(normalized, access) << 24) |
        (this.read8(normalized + 1, access) << 16) |
        (this.read8(normalized + 2, access) << 8) |
        this.read8(normalized + 3, access)) >>>
      0
    );
  }

  write8(address: number, value: number): void {
    const normalized = this.normalize(address, 'write', 1);
    if (this.findDevice(normalized)?.write8(normalized, value & 0xff)) return;
    this.beforeRamWrite?.(normalized);
    this.memory.setByte(normalized, value & 0xff);
  }

  write16(address: number, value: number): void {
    const normalized = this.normalize(address, 'write', 2);
    this.write8(normalized, value >>> 8);
    this.write8(normalized + 1, value);
  }

  write32(address: number, value: number): void {
    const normalized = this.normalize(address, 'write', 4);
    this.write8(normalized, value >>> 24);
    this.write8(normalized + 1, value >>> 16);
    this.write8(normalized + 2, value >>> 8);
    this.write8(normalized + 3, value);
  }
}
