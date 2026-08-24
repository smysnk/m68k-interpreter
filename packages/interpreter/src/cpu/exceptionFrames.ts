import type { CpuModel } from '../isa/types';
import type { BusFunctionCode, MemoryBus } from './memoryBus';

export interface ExceptionFrameInput {
  readonly cpuModel: CpuModel;
  readonly vector: number;
  readonly statusRegister: number;
  readonly programCounter: number;
  readonly faultAddress?: number;
  readonly functionCode?: BusFunctionCode;
  readonly write?: boolean;
  readonly instruction?: boolean;
}

export interface DecodedExceptionFrame {
  readonly format: number;
  readonly vector: number;
  readonly statusRegister: number;
  readonly programCounter: number;
  readonly size: number;
  readonly faultAddress?: number;
}

function set16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >>> 8;
  bytes[offset + 1] = value;
}

function set32(bytes: Uint8Array, offset: number, value: number): void {
  set16(bytes, offset, value >>> 16);
  set16(bytes, offset + 2, value);
}

export function encodeExceptionFrame(input: ExceptionFrameInput): Uint8Array {
  const fault = input.faultAddress !== undefined;
  const format = fault
    ? input.cpuModel === 'm68010'
      ? 8
      : input.cpuModel === 'm68020'
        ? 0xa
        : 0
    : 0;
  const size = format === 8 ? 58 : format === 0xa ? 32 : input.cpuModel === 'm68000' ? 6 : 8;
  const bytes = new Uint8Array(size);
  set16(bytes, 0, input.statusRegister);
  set32(bytes, 2, input.programCounter);
  if (input.cpuModel !== 'm68000') set16(bytes, 6, (format << 12) | ((input.vector << 2) & 0x0fff));
  if (format === 8) {
    const specialStatus =
      (input.write ? 0 : 0x0100) | (input.instruction ? 0x2000 : 0) | (input.functionCode ?? 0);
    set16(bytes, 8, specialStatus);
    set32(bytes, 10, input.faultAddress ?? 0);
  } else if (format === 0xa) {
    const specialStatus =
      (input.write ? 0x0040 : 0) | (input.instruction ? 0x0100 : 0) | (input.functionCode ?? 0);
    set16(bytes, 10, specialStatus);
    set32(bytes, 16, input.faultAddress ?? 0);
  }
  return bytes;
}

export function decodeExceptionFrame(
  bus: MemoryBus,
  address: number,
  cpuModel: CpuModel
): DecodedExceptionFrame {
  const statusRegister = bus.read16(address);
  const programCounter = bus.read32(address + 2);
  if (cpuModel === 'm68000') {
    return { format: 0, vector: 0, statusRegister, programCounter, size: 6 };
  }
  const formatVector = bus.read16(address + 6);
  const format = formatVector >>> 12;
  const size =
    format === 0
      ? 8
      : format === 8 && cpuModel === 'm68010'
        ? 58
        : format === 0xa && cpuModel === 'm68020'
          ? 32
          : 0;
  if (size === 0)
    throw new RangeError(`Unsupported ${cpuModel} exception-frame format ${format.toString(16)}`);
  if (format === 8 && ((bus.read16(address + 26) >>> 10) & 0xf) !== 0) {
    throw new RangeError('Unsupported MC68010 format-8 frame version');
  }
  for (let offset = 8; offset < size; offset += 2) bus.read16(address + offset);
  return {
    format,
    vector: (formatVector & 0x0fff) >>> 2,
    statusRegister,
    programCounter,
    size,
    faultAddress:
      format === 8
        ? bus.read32(address + 10)
        : format === 0xa
          ? bus.read32(address + 16)
          : undefined,
  };
}
