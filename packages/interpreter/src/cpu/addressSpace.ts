import { getCpuCapabilities } from '../isa/cpuCapabilities';
import type { CpuModel } from '../isa/types';
import { BusFault, busOperation, type BusAccessInput, type BusAccessSize } from './memoryBus';

export interface AddressSpacePolicy {
  readonly model: CpuModel;
  readonly addressBits: 24 | 32;
  readonly mask: number;
  readonly allowsUnalignedData: boolean;
  normalize(address: number): number;
  add(address: number, displacement: number): number;
  assertAccess(address: number, access: BusAccessInput, size: BusAccessSize): number;
}

const POLICY_CACHE: Partial<Record<CpuModel, AddressSpacePolicy>> = {};

export function createAddressSpacePolicy(model: CpuModel): AddressSpacePolicy {
  const cached = POLICY_CACHE[model];
  if (cached !== undefined) return cached;
  const capabilities = getCpuCapabilities(model);
  const normalize =
    capabilities.addressBits === 32
      ? (address: number): number => address >>> 0
      : (address: number): number => address & 0x00ff_ffff;

  const policy = Object.freeze({
    model,
    addressBits: capabilities.addressBits,
    mask: capabilities.addressMask,
    allowsUnalignedData: capabilities.allowsUnalignedData,
    normalize,
    add: (address: number, displacement: number): number => normalize(address + displacement),
    assertAccess(address: number, access: BusAccessInput, size: BusAccessSize): number {
      const normalized = normalize(address);
      const operation = busOperation(access, 'read');
      if (
        size > 1 &&
        (normalized & 1) !== 0 &&
        (operation === 'fetch' || !capabilities.allowsUnalignedData)
      ) {
        const functionCode = typeof access === 'string' ? undefined : access.functionCode;
        throw new BusFault(
          'address-error',
          normalized,
          operation,
          size,
          `Unaligned ${size * 8}-bit ${operation} at ${normalized.toString(16)}`,
          functionCode
        );
      }
      return normalized;
    },
  });
  POLICY_CACHE[model] = policy;
  return policy;
}
