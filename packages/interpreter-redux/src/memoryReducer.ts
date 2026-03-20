import { CODE_BYTE, CODE_LONG, CODE_WORD } from '@m68k/interpreter';
import { ReducerMemoryRuntime, type MemorySizeCode } from './memoryRuntime';

export const MEMORY_CODE_BYTE = CODE_BYTE;
export const MEMORY_CODE_WORD = CODE_WORD;
export const MEMORY_CODE_LONG = CODE_LONG;
export const MAX_MEMORY_ADDRESS = 0x7fffffff;

export { type MemorySizeCode };

export function isValidMemoryAddress(address: number): boolean {
  const normalizedAddress = address >>> 0;
  return 0 <= normalizedAddress && normalizedAddress <= MAX_MEMORY_ADDRESS;
}

export function createReducerMemoryState(
  initialBytes: Record<number, number> = {}
): ReducerMemoryRuntime {
  return new ReducerMemoryRuntime(initialBytes);
}

export function getMemoryByte(runtime: ReducerMemoryRuntime, address: number): number {
  return runtime.readByte(address);
}

export function getMemoryWord(runtime: ReducerMemoryRuntime, address: number): number {
  return runtime.readWord(address);
}

export function getMemoryLong(runtime: ReducerMemoryRuntime, address: number): number {
  return runtime.readLong(address);
}

export function getMemoryValue(
  runtime: ReducerMemoryRuntime,
  address: number,
  size: MemorySizeCode
): number {
  return runtime.readValue(address, size);
}

export function setMemoryByte(
  runtime: ReducerMemoryRuntime,
  address: number,
  value: number
): ReducerMemoryRuntime {
  runtime.writeByte(address, value);
  return runtime;
}

export function setMemoryWord(
  runtime: ReducerMemoryRuntime,
  address: number,
  value: number
): ReducerMemoryRuntime {
  runtime.writeWord(address, value);
  return runtime;
}

export function setMemoryLong(
  runtime: ReducerMemoryRuntime,
  address: number,
  value: number
): ReducerMemoryRuntime {
  runtime.writeLong(address, value);
  return runtime;
}

export function setMemoryValue(
  runtime: ReducerMemoryRuntime,
  address: number,
  value: number,
  size: MemorySizeCode
): ReducerMemoryRuntime {
  runtime.writeValue(address, value, size);
  return runtime;
}

export function clearMemoryState(runtime: ReducerMemoryRuntime): ReducerMemoryRuntime {
  runtime.reset({});
  return runtime;
}

export function getUsedMemorySize(runtime: ReducerMemoryRuntime): number {
  return runtime.toMemoryState().usedBytes;
}
