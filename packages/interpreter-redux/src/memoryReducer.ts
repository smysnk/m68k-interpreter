import type { MemoryState } from './state';

export const MEMORY_CODE_BYTE = 0;
export const MEMORY_CODE_WORD = 1;
export const MEMORY_CODE_LONG = 2;
export const MAX_MEMORY_ADDRESS = 0x7fffffff;

export type MemorySizeCode =
  | typeof MEMORY_CODE_BYTE
  | typeof MEMORY_CODE_WORD
  | typeof MEMORY_CODE_LONG;

export function isValidMemoryAddress(address: number): boolean {
  const normalizedAddress = address >>> 0;
  return 0 <= normalizedAddress && normalizedAddress <= MAX_MEMORY_ADDRESS;
}

export function getMemoryByte(state: MemoryState, address: number): number {
  const normalizedAddress = address >>> 0;
  if (state.bytes[normalizedAddress] === undefined) {
    return 0x00;
  }

  return state.bytes[normalizedAddress];
}

export function getMemoryWord(state: MemoryState, address: number): number {
  const firstByte = getMemoryByte(state, address);

  if (!isValidMemoryAddress(address + 1)) {
    return 0x0000;
  }

  const secondByte = getMemoryByte(state, address + 1);
  return (((firstByte << 8) | secondByte) & 0xffff) >>> 0;
}

export function getMemoryLong(state: MemoryState, address: number): number {
  const byte0 = getMemoryByte(state, address);
  if (!isValidMemoryAddress(address + 1)) {
    return 0;
  }

  const byte1 = getMemoryByte(state, address + 1);
  if (!isValidMemoryAddress(address + 2)) {
    return 0;
  }

  const byte2 = getMemoryByte(state, address + 2);
  if (!isValidMemoryAddress(address + 3)) {
    return 0;
  }

  const byte3 = getMemoryByte(state, address + 3);
  return (((byte0 << 24) | (byte1 << 16) | (byte2 << 8) | byte3) >>> 0);
}

export function getMemoryValue(
  state: MemoryState,
  address: number,
  size: MemorySizeCode
): number {
  switch (size) {
    case MEMORY_CODE_BYTE:
      return getMemoryByte(state, address);
    case MEMORY_CODE_WORD:
      return getMemoryWord(state, address);
    case MEMORY_CODE_LONG:
    default:
      return getMemoryLong(state, address);
  }
}

function createPatchedMemoryState(
  baseBytes: Record<number, number>,
  overrides: Record<number, number>
): MemoryState {
  return {
    baseBytes,
    overrides,
    bytes: Object.assign(Object.create(baseBytes), overrides),
  };
}

export function setMemoryByte(state: MemoryState, address: number, value: number): MemoryState {
  const normalizedAddress = address >>> 0;
  const normalizedValue = (value & 0xff) >>> 0;

  if (state.bytes[normalizedAddress] === normalizedValue) {
    return state;
  }

  return createPatchedMemoryState(state.baseBytes, {
    ...state.overrides,
    [normalizedAddress]: normalizedValue,
  });
}

export function setMemoryWord(state: MemoryState, address: number, value: number): MemoryState {
  const normalizedAddress = address >>> 0;
  const nextOverrides = {
    ...state.overrides,
    [normalizedAddress]: ((value >>> 8) & 0xff) >>> 0,
    [(normalizedAddress + 1) >>> 0]: (value & 0xff) >>> 0,
  };

  return createPatchedMemoryState(state.baseBytes, nextOverrides);
}

export function setMemoryLong(state: MemoryState, address: number, value: number): MemoryState {
  const normalizedAddress = address >>> 0;
  const nextOverrides = {
    ...state.overrides,
    [normalizedAddress]: ((value >>> 24) & 0xff) >>> 0,
    [(normalizedAddress + 1) >>> 0]: ((value >>> 16) & 0xff) >>> 0,
    [(normalizedAddress + 2) >>> 0]: ((value >>> 8) & 0xff) >>> 0,
    [(normalizedAddress + 3) >>> 0]: (value & 0xff) >>> 0,
  };

  return createPatchedMemoryState(state.baseBytes, nextOverrides);
}

export function setMemoryValue(
  state: MemoryState,
  address: number,
  value: number,
  size: MemorySizeCode
): MemoryState {
  switch (size) {
    case MEMORY_CODE_LONG:
      return setMemoryLong(state, address, value);
    case MEMORY_CODE_WORD:
      return setMemoryWord(state, address, value);
    case MEMORY_CODE_BYTE:
    default:
      return setMemoryByte(state, address, value);
  }
}

export function clearMemoryState(state: MemoryState): MemoryState {
  if (Object.keys(state.baseBytes).length === 0 && Object.keys(state.overrides).length === 0) {
    return state;
  }

  return createPatchedMemoryState({}, {});
}

export function getUsedMemorySize(state: MemoryState): number {
  return new Set([...Object.keys(state.baseBytes), ...Object.keys(state.overrides)]).size;
}
