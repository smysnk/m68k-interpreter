import type { MemoryBus } from './memoryBus';

const ADDRESS_MASK = 0x00ff_ffff;

export function signExtend8(value: number): number {
  return (value << 24) >> 24;
}

export function signExtend16(value: number): number {
  return (value << 16) >> 16;
}

export class InstructionStream {
  private cursorAddress: number;

  constructor(
    private readonly bus: MemoryBus,
    address: number
  ) {
    this.cursorAddress = address & ADDRESS_MASK;
  }

  get cursor(): number {
    return this.cursorAddress;
  }

  readWord(): number {
    const address = this.cursorAddress;
    const value = this.bus.read16(address, 'fetch');
    this.cursorAddress = (address + 2) & ADDRESS_MASK;
    return value;
  }

  readSignedWord(): number {
    return signExtend16(this.readWord());
  }

  readLong(): number {
    const address = this.cursorAddress;
    const value = this.bus.read32(address, 'fetch');
    this.cursorAddress = (address + 4) & ADDRESS_MASK;
    return value;
  }
}
