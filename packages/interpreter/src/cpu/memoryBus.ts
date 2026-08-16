export type BusAccessType = 'read' | 'write' | 'fetch';
export type BusAccessSize = 1 | 2 | 4;
export type BusFunctionCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface BusAccessContext {
  operation: BusAccessType;
  functionCode?: BusFunctionCode;
  cpuSpace?: boolean;
}

export type BusAccessInput = BusAccessType | BusAccessContext;

export interface BusAccess {
  type: BusAccessType;
  address: number;
  size: BusAccessSize;
  value: number;
  functionCode?: BusFunctionCode;
  cpuSpace?: boolean;
}

export interface BreakpointAcknowledgeEvent {
  type: 'breakpoint-acknowledge';
  vector: number;
  functionCode: 7;
  cpuSpace: true;
  acknowledged: boolean;
}

export type BusTraceEvent = BusAccess | BreakpointAcknowledgeEvent;

export const USER_DATA_READ: BusAccessContext = { operation: 'read', functionCode: 1 };
export const USER_DATA_WRITE: BusAccessContext = { operation: 'write', functionCode: 1 };
export const USER_PROGRAM_FETCH: BusAccessContext = { operation: 'fetch', functionCode: 2 };
export const SUPERVISOR_DATA_READ: BusAccessContext = { operation: 'read', functionCode: 5 };
export const SUPERVISOR_DATA_WRITE: BusAccessContext = { operation: 'write', functionCode: 5 };
export const SUPERVISOR_PROGRAM_FETCH: BusAccessContext = {
  operation: 'fetch',
  functionCode: 6,
};
export const CPU_SPACE: BusAccessContext = {
  operation: 'read',
  functionCode: 7,
  cpuSpace: true,
};

export function busOperation(
  access: BusAccessInput | undefined,
  fallback: BusAccessType
): BusAccessType {
  return typeof access === 'string' ? access : (access?.operation ?? fallback);
}

export class BusFault extends Error {
  readonly code: 'address-error' | 'bus-error';
  readonly address: number;
  readonly access: BusAccessType;
  readonly size: BusAccessSize;
  readonly functionCode: BusFunctionCode | undefined;

  constructor(
    code: 'address-error' | 'bus-error',
    address: number,
    access: BusAccessType,
    size: BusAccessSize,
    message: string,
    functionCode?: BusFunctionCode
  ) {
    super(message);
    this.name = 'BusFault';
    this.code = code;
    this.address = address >>> 0;
    this.access = access;
    this.size = size;
    this.functionCode = functionCode;
  }
}

export interface MemoryBus {
  read8(address: number, access?: BusAccessInput): number;
  read16(address: number, access?: BusAccessInput): number;
  read32(address: number, access?: BusAccessInput): number;
  write8(address: number, value: number, access?: BusAccessInput): void;
  write16(address: number, value: number, access?: BusAccessInput): void;
  write32(address: number, value: number, access?: BusAccessInput): void;
  breakpointAcknowledge?(vector: number): boolean;
  beginInstructionTransaction?(): unknown;
  commitInstructionTransaction?(transaction: unknown): void;
  rollbackInstructionTransaction?(transaction: unknown): void;
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
  private readonly trace: BusTraceEvent[] | undefined;
  private readonly transactionBytes = new Map<number, number>();
  private activeTransaction = 0;
  private nextTransaction = 1;

  constructor(options: { size?: number; trace?: BusTraceEvent[] } = {}) {
    const size = options.size ?? ADDRESS_MASK + 1;
    if (!Number.isInteger(size) || size <= 0 || size > ADDRESS_MASK + 1) {
      throw new RangeError(`RAM size must be from 1 through ${ADDRESS_MASK + 1}: ${size}`);
    }
    this.bytes = new Uint8Array(size);
    this.trace = options.trace;
  }

  private normalize(address: number, access: BusAccessInput, size: BusAccessSize): number {
    const normalized = address & ADDRESS_MASK;
    if (normalized + size > this.bytes.length) {
      const operation = busOperation(access, 'read');
      const functionCode = typeof access === 'string' ? undefined : access.functionCode;
      throw new BusFault(
        'bus-error',
        normalized,
        operation,
        size,
        `Bus access exceeds installed RAM at ${normalized.toString(16)}`,
        functionCode
      );
    }
    if (size > 1 && (normalized & 1) !== 0) {
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

  private record(
    access: BusAccessInput,
    address: number,
    size: BusAccessSize,
    value: number
  ): void {
    if (this.trace === undefined) return;
    const type = busOperation(access, 'read');
    const context = typeof access === 'string' ? undefined : access;
    this.trace.push({
      type,
      address,
      size,
      value: value >>> 0,
      functionCode: context?.functionCode,
      cpuSpace: context?.cpuSpace,
    });
  }

  read8(address: number, access: BusAccessInput = 'read'): number {
    const normalized = this.normalize(address, access, 1);
    const value = this.bytes[normalized];
    this.record(access, normalized, 1, value);
    return value;
  }

  read16(address: number, access: BusAccessInput = 'read'): number {
    const normalized = this.normalize(address, access, 2);
    const value = (this.bytes[normalized] << 8) | this.bytes[normalized + 1];
    this.record(access, normalized, 2, value);
    return value;
  }

  read32(address: number, access: BusAccessInput = 'read'): number {
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

  write8(address: number, value: number, access: BusAccessInput = 'write'): void {
    const normalized = this.normalize(address, access, 1);
    this.rememberByte(normalized);
    this.bytes[normalized] = value & 0xff;
    this.record(access, normalized, 1, value & 0xff);
  }

  write16(address: number, value: number, access: BusAccessInput = 'write'): void {
    const normalized = this.normalize(address, access, 2);
    this.rememberByte(normalized);
    this.rememberByte(normalized + 1);
    this.bytes[normalized] = (value >>> 8) & 0xff;
    this.bytes[normalized + 1] = value & 0xff;
    this.record(access, normalized, 2, value & 0xffff);
  }

  write32(address: number, value: number, access: BusAccessInput = 'write'): void {
    const normalized = this.normalize(address, access, 4);
    for (let offset = 0; offset < 4; offset += 1) this.rememberByte(normalized + offset);
    this.bytes[normalized] = (value >>> 24) & 0xff;
    this.bytes[normalized + 1] = (value >>> 16) & 0xff;
    this.bytes[normalized + 2] = (value >>> 8) & 0xff;
    this.bytes[normalized + 3] = value & 0xff;
    this.record(access, normalized, 4, value);
  }

  breakpointAcknowledge(vector: number): boolean {
    this.trace?.push({
      type: 'breakpoint-acknowledge',
      vector: vector & 0x7,
      functionCode: 7,
      cpuSpace: true,
      acknowledged: false,
    });
    return false;
  }

  private rememberByte(address: number): void {
    if (this.activeTransaction !== 0 && !this.transactionBytes.has(address)) {
      this.transactionBytes.set(address, this.bytes[address]);
    }
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
    for (const [address, value] of this.transactionBytes) this.bytes[address] = value;
    this.activeTransaction = 0;
    this.transactionBytes.clear();
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
