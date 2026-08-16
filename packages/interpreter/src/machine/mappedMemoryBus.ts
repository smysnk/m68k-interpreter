import type { Memory } from '../core/memory';
import { createAddressSpacePolicy, type AddressSpacePolicy } from '../cpu/addressSpace';
import {
  BusFault,
  type BusAccessInput,
  type MemoryBus,
  type MemoryMappedDevice,
  busOperation,
} from '../cpu/memoryBus';

export class MappedMemoryBus implements MemoryBus {
  private readonly transactionBytes = new Map<number, number>();
  private activeTransaction = 0;
  private nextTransaction = 1;
  private readonly addressMask: number;
  private readonly allowsUnalignedData: boolean;

  constructor(
    private readonly memory: Memory,
    private readonly devices: readonly MemoryMappedDevice[] = [],
    private readonly beforeRamWrite?: (address: number) => void,
    addressSpace: AddressSpacePolicy = createAddressSpacePolicy('m68000')
  ) {
    this.addressMask = addressSpace.mask;
    this.allowsUnalignedData = addressSpace.allowsUnalignedData;
  }

  private normalize(address: number, access: BusAccessInput, size: 1 | 2 | 4): number {
    const normalized = (address & this.addressMask) >>> 0;
    if (
      size > 1 &&
      (normalized & 1) !== 0 &&
      (busOperation(access, 'read') === 'fetch' || !this.allowsUnalignedData)
    ) {
      const operation = busOperation(access, 'read');
      const functionCode = typeof access === 'string' ? undefined : access.functionCode;
      throw new BusFault(
        'address-error',
        normalized,
        operation,
        size,
        `Unaligned ${size * 8}-bit bus access at ${normalized.toString(16)}`,
        functionCode
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

  read8(address: number, access: BusAccessInput = 'read'): number {
    const normalized = this.normalize(address, access, 1);
    return this.findDevice(normalized)?.read8(normalized) ?? this.memory.getByte(normalized);
  }

  read16(address: number, access: BusAccessInput = 'read'): number {
    const normalized = this.normalize(address, access, 2);
    return ((this.read8(normalized, access) << 8) | this.read8(normalized + 1, access)) >>> 0;
  }

  read32(address: number, access: BusAccessInput = 'read'): number {
    const normalized = this.normalize(address, access, 4);
    return (
      ((this.read8(normalized, access) << 24) |
        (this.read8(normalized + 1, access) << 16) |
        (this.read8(normalized + 2, access) << 8) |
        this.read8(normalized + 3, access)) >>>
      0
    );
  }

  write8(address: number, value: number, access: BusAccessInput = 'write'): void {
    const normalized = this.normalize(address, access, 1);
    if (this.findDevice(normalized)?.write8(normalized, value & 0xff)) return;
    if (this.activeTransaction !== 0 && !this.transactionBytes.has(normalized)) {
      this.transactionBytes.set(normalized, this.memory.getByte(normalized));
    }
    this.beforeRamWrite?.(normalized);
    this.memory.setByte(normalized, value & 0xff);
  }

  write16(address: number, value: number, access: BusAccessInput = 'write'): void {
    const normalized = this.normalize(address, access, 2);
    this.write8(normalized, value >>> 8, access);
    this.write8(normalized + 1, value, access);
  }

  write32(address: number, value: number, access: BusAccessInput = 'write'): void {
    const normalized = this.normalize(address, access, 4);
    this.write8(normalized, value >>> 24, access);
    this.write8(normalized + 1, value >>> 16, access);
    this.write8(normalized + 2, value >>> 8, access);
    this.write8(normalized + 3, value, access);
  }

  load(address: number, bytes: Uint8Array): void {
    bytes.forEach((byte, offset) => this.write8(address + offset, byte));
  }

  readRange(address: number, length: number): Uint8Array {
    return Uint8Array.from({ length }, (_, offset) => this.read8(address + offset));
  }

  atomicCompareExchange(
    address: number,
    size: 1 | 2 | 4,
    expected: number,
    replacement: number,
    access: BusAccessInput = 'write'
  ): { value: number; exchanged: boolean } {
    const value =
      size === 1
        ? this.read8(address, access)
        : size === 2
          ? this.read16(address, access)
          : this.read32(address, access);
    const mask = size === 1 ? 0xff : size === 2 ? 0xffff : 0xffff_ffff;
    const exchanged = (value & mask) === (expected & mask);
    if (exchanged) {
      if (size === 1) this.write8(address, replacement, access);
      else if (size === 2) this.write16(address, replacement, access);
      else this.write32(address, replacement, access);
    }
    return { value: value >>> 0, exchanged };
  }

  breakpointAcknowledge(): boolean {
    return false;
  }

  beginInstructionTransaction(): number {
    this.transactionBytes.clear();
    this.activeTransaction = this.nextTransaction++;
    return this.activeTransaction;
  }

  commitInstructionTransaction(transaction: unknown): void {
    if (this.activeTransaction === transaction) {
      this.activeTransaction = 0;
      this.transactionBytes.clear();
    }
  }

  rollbackInstructionTransaction(transaction: unknown): void {
    if (this.activeTransaction !== transaction) return;
    for (const [address, value] of this.transactionBytes) this.memory.setByte(address, value);
    this.activeTransaction = 0;
    this.transactionBytes.clear();
  }
}
