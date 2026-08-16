import type { BusAccessInput, MemoryBus } from './memoryBus';
import { createAddressSpacePolicy, type AddressSpacePolicy } from './addressSpace';

export function signExtend8(value: number): number {
  return (value << 24) >> 24;
}

export function signExtend16(value: number): number {
  return (value << 16) >> 16;
}

export class InstructionStream {
  private cursorAddress: number;
  private readonly addressMask: number;

  constructor(
    private readonly bus: MemoryBus,
    address: number,
    private readonly fetchAccess: BusAccessInput = 'fetch',
    private readonly addressSpace: AddressSpacePolicy = createAddressSpacePolicy('m68000')
  ) {
    this.addressMask = this.addressSpace.mask;
    this.cursorAddress = (address & this.addressMask) >>> 0;
  }

  get cursor(): number {
    return this.cursorAddress;
  }

  readWord(): number {
    const address = this.cursorAddress;
    const value = this.bus.read16(address, this.fetchAccess);
    this.cursorAddress = ((address + 2) & this.addressMask) >>> 0;
    return value;
  }

  readSignedWord(): number {
    return signExtend16(this.readWord());
  }

  readLong(): number {
    const address = this.cursorAddress;
    const value = this.bus.read32(address, this.fetchAccess);
    this.cursorAddress = ((address + 4) & this.addressMask) >>> 0;
    return value;
  }
}
