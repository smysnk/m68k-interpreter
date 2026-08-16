import type {
  BusAccessInput,
  BusAccessSize,
  BusFunctionCode,
  MemoryBus,
} from './memoryBus';
import { busOperation } from './memoryBus';

export interface AddressTranslationRequest {
  readonly logicalAddress: number;
  readonly operation: 'read' | 'write' | 'fetch';
  readonly size: BusAccessSize;
  readonly functionCode?: BusFunctionCode;
  readonly supervisor: boolean;
  readonly atomic: boolean;
}

export type AddressTranslationResult =
  | { readonly kind: 'translated'; readonly physicalAddress: number }
  | {
      readonly kind: 'fault';
      readonly code: 'translation-fault' | 'protection-fault';
      readonly message: string;
      readonly vector: number;
    };

export interface AddressTranslationStateSnapshot {
  readonly device: string;
  readonly version: number;
  readonly payload: unknown;
}

export interface AddressTranslationPort {
  readonly device: string;
  translate(request: AddressTranslationRequest): AddressTranslationResult;
  snapshot(): AddressTranslationStateSnapshot;
  restore(snapshot: AddressTranslationStateSnapshot): void;
  reset(): void;
}

export class AddressTranslationFault extends Error {
  constructor(
    readonly code: 'translation-fault' | 'protection-fault',
    readonly logicalAddress: number,
    readonly vector: number,
    message: string
  ) {
    super(message);
    this.name = 'AddressTranslationFault';
  }
}

function supervisorFromFunctionCode(functionCode: BusFunctionCode | undefined): boolean {
  return functionCode !== undefined && functionCode >= 4;
}

export class TranslatingMemoryBus implements MemoryBus {
  constructor(
    private readonly physicalBus: MemoryBus,
    private readonly translator?: AddressTranslationPort
  ) {}

  private translate(address: number, size: BusAccessSize, access: BusAccessInput, atomic = false): number {
    if (this.translator === undefined) return address >>> 0;
    const context = typeof access === 'string' ? undefined : access;
    const result = this.translator.translate({
      logicalAddress: address >>> 0,
      operation: busOperation(access, 'read'),
      size,
      functionCode: context?.functionCode,
      supervisor: supervisorFromFunctionCode(context?.functionCode),
      atomic,
    });
    if (result.kind === 'fault') {
      throw new AddressTranslationFault(result.code, address >>> 0, result.vector, result.message);
    }
    return result.physicalAddress >>> 0;
  }

  read8(address: number, access: BusAccessInput = 'read'): number {
    return this.physicalBus.read8(this.translate(address, 1, access), access);
  }
  read16(address: number, access: BusAccessInput = 'read'): number {
    return this.physicalBus.read16(this.translate(address, 2, access), access);
  }
  read32(address: number, access: BusAccessInput = 'read'): number {
    return this.physicalBus.read32(this.translate(address, 4, access), access);
  }
  write8(address: number, value: number, access: BusAccessInput = 'write'): void {
    this.physicalBus.write8(this.translate(address, 1, access), value, access);
  }
  write16(address: number, value: number, access: BusAccessInput = 'write'): void {
    this.physicalBus.write16(this.translate(address, 2, access), value, access);
  }
  write32(address: number, value: number, access: BusAccessInput = 'write'): void {
    this.physicalBus.write32(this.translate(address, 4, access), value, access);
  }
  atomicCompareExchange(
    address: number,
    size: BusAccessSize,
    expected: number,
    replacement: number,
    access: BusAccessInput = 'write'
  ): { value: number; exchanged: boolean } {
    if (this.physicalBus.atomicCompareExchange === undefined) {
      throw new Error('Physical bus does not support atomic compare/exchange');
    }
    return this.physicalBus.atomicCompareExchange(
      this.translate(address, size, access, true),
      size,
      expected,
      replacement,
      access
    );
  }
  load(address: number, bytes: Uint8Array): void {
    if (this.translator === undefined && this.physicalBus.load !== undefined) {
      this.physicalBus.load(address, bytes);
      return;
    }
    bytes.forEach((byte, offset) => this.write8(address + offset, byte));
  }
  breakpointAcknowledge(vector: number): boolean {
    return this.physicalBus.breakpointAcknowledge?.(vector) ?? false;
  }
  beginInstructionTransaction(): unknown {
    return this.physicalBus.beginInstructionTransaction?.();
  }
  commitInstructionTransaction(transaction: unknown): void {
    this.physicalBus.commitInstructionTransaction?.(transaction);
  }
  rollbackInstructionTransaction(transaction: unknown): void {
    this.physicalBus.rollbackInstructionTransaction?.(transaction);
  }
}
