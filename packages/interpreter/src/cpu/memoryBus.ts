export type BusAccessType = 'read' | 'write' | 'fetch';
export type BusAccessSize = 1 | 2 | 4;

export interface BusAccess {
  type: BusAccessType;
  address: number;
  size: BusAccessSize;
  value: number;
}

export class BusFault extends Error {
  readonly code: 'address-error' | 'bus-error';
  readonly address: number;
  readonly access: BusAccessType;
  readonly size: BusAccessSize;

  constructor(
    code: 'address-error' | 'bus-error',
    address: number,
    access: BusAccessType,
    size: BusAccessSize,
    message: string
  ) {
    super(message);
    this.name = 'BusFault';
    this.code = code;
    this.address = address >>> 0;
    this.access = access;
    this.size = size;
  }
}

export interface MemoryBus {
  read8(address: number, access?: BusAccessType): number;
  read16(address: number, access?: BusAccessType): number;
  read32(address: number, access?: BusAccessType): number;
  write8(address: number, value: number): void;
  write16(address: number, value: number): void;
  write32(address: number, value: number): void;
}

export interface AddressRange {
  start: number;
  end: number;
}

export interface MemoryMappedDevice<Snapshot = unknown> {
  readonly id: string;
  addressRanges(): readonly AddressRange[];
  read8(address: number): number | undefined;
  write8(address: number, value: number): boolean;
  snapshot(): Snapshot;
  reset(): void;
}

const ADDRESS_MASK = 0x00ff_ffff;

export class RamBus implements MemoryBus {
  private readonly bytes: Uint8Array;
  private readonly trace: BusAccess[] | undefined;

  constructor(options: { size?: number; trace?: BusAccess[] } = {}) {
    const size = options.size ?? ADDRESS_MASK + 1;
    if (!Number.isInteger(size) || size <= 0 || size > ADDRESS_MASK + 1) {
      throw new RangeError(`RAM size must be from 1 through ${ADDRESS_MASK + 1}: ${size}`);
    }
    this.bytes = new Uint8Array(size);
    this.trace = options.trace;
  }

  private normalize(address: number, access: BusAccessType, size: BusAccessSize): number {
    const normalized = address & ADDRESS_MASK;
    if (normalized + size > this.bytes.length) {
      throw new BusFault(
        'bus-error',
        normalized,
        access,
        size,
        `Bus access exceeds installed RAM at ${normalized.toString(16)}`
      );
    }
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

  private record(type: BusAccessType, address: number, size: BusAccessSize, value: number): void {
    this.trace?.push({
      type,
      address,
      size,
      value: value >>> 0,
    });
  }

  read8(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.normalize(address, access, 1);
    const value = this.bytes[normalized];
    this.record(access, normalized, 1, value);
    return value;
  }

  read16(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.normalize(address, access, 2);
    const value = (this.bytes[normalized] << 8) | this.bytes[normalized + 1];
    this.record(access, normalized, 2, value);
    return value;
  }

  read32(address: number, access: BusAccessType = 'read'): number {
    const normalized = this.normalize(address, access, 4);
    const value =
      ((this.bytes[normalized] << 24) |
        (this.bytes[normalized + 1] << 16) |
        (this.bytes[normalized + 2] << 8) |
        this.bytes[normalized + 3]) >>>
      0;
    this.record(access, normalized, 4, value);
    return value;
  }

  write8(address: number, value: number): void {
    const normalized = this.normalize(address, 'write', 1);
    this.bytes[normalized] = value & 0xff;
    this.record('write', normalized, 1, value & 0xff);
  }

  write16(address: number, value: number): void {
    const normalized = this.normalize(address, 'write', 2);
    this.bytes[normalized] = (value >>> 8) & 0xff;
    this.bytes[normalized + 1] = value & 0xff;
    this.record('write', normalized, 2, value & 0xffff);
  }

  write32(address: number, value: number): void {
    const normalized = this.normalize(address, 'write', 4);
    this.bytes[normalized] = (value >>> 24) & 0xff;
    this.bytes[normalized + 1] = (value >>> 16) & 0xff;
    this.bytes[normalized + 2] = (value >>> 8) & 0xff;
    this.bytes[normalized + 3] = value & 0xff;
    this.record('write', normalized, 4, value);
  }

  load(address: number, bytes: Uint8Array): void {
    for (let offset = 0; offset < bytes.length; offset += 1) {
      const normalized = this.normalize(address + offset, 'write', 1);
      this.bytes[normalized] = bytes[offset];
    }
  }

  readRange(address: number, length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`Memory range length must be a non-negative integer: ${length}`);
    }
    const result = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 1) {
      result[offset] = this.read8(address + offset);
    }
    return result;
  }
}
