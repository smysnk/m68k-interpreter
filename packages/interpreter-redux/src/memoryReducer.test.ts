import { describe, expect, it } from 'vitest';
import {
  MAX_MEMORY_ADDRESS,
  MEMORY_CODE_BYTE,
  MEMORY_CODE_LONG,
  MEMORY_CODE_WORD,
  clearMemoryState,
  createReducerMemoryState,
  getMemoryByte,
  getMemoryLong,
  getMemoryWord,
  getUsedMemorySize,
  isValidMemoryAddress,
  setMemoryByte,
  setMemoryLong,
  setMemoryValue,
  setMemoryWord,
} from './memoryReducer';

describe('memoryReducer runtime helpers', () => {
  it('reads and writes bytes, words, and longs in big-endian order', () => {
    const runtime = createReducerMemoryState();

    setMemoryByte(runtime, 0x1000, 0xab);
    setMemoryWord(runtime, 0x1001, 0xcdef);
    setMemoryLong(runtime, 0x1003, 0x12345678);

    expect(getMemoryByte(runtime, 0x1000)).toBe(0xab);
    expect(getMemoryByte(runtime, 0x1001)).toBe(0xcd);
    expect(getMemoryByte(runtime, 0x1002)).toBe(0xef);
    expect(getMemoryWord(runtime, 0x1001)).toBe(0xcdef);
    expect(getMemoryLong(runtime, 0x1003)).toBe(0x12345678);
  });

  it('supports generic size-based writes and memory clearing', () => {
    const runtime = createReducerMemoryState();

    setMemoryValue(runtime, 0x2000, 0x12, MEMORY_CODE_BYTE);
    setMemoryValue(runtime, 0x2001, 0x3456, MEMORY_CODE_WORD);
    setMemoryValue(runtime, 0x2003, 0x789abcde, MEMORY_CODE_LONG);

    expect(getMemoryByte(runtime, 0x2000)).toBe(0x12);
    expect(getMemoryWord(runtime, 0x2001)).toBe(0x3456);
    expect(getMemoryLong(runtime, 0x2003)).toBe(0x789abcde);
    expect(getUsedMemorySize(runtime)).toBe(7);

    clearMemoryState(runtime);
    expect(getUsedMemorySize(runtime)).toBe(0);
    expect(getMemoryByte(runtime, 0x2000)).toBe(0);
  });

  it('matches the current interpreter address bounds for word and long reads', () => {
    const runtime = createReducerMemoryState({
      [MAX_MEMORY_ADDRESS]: 0xff,
    });

    expect(isValidMemoryAddress(MAX_MEMORY_ADDRESS)).toBe(true);
    expect(isValidMemoryAddress(MAX_MEMORY_ADDRESS + 1)).toBe(false);
    expect(getMemoryWord(runtime, MAX_MEMORY_ADDRESS)).toBe(0);
    expect(getMemoryLong(runtime, MAX_MEMORY_ADDRESS - 1)).toBe(0);
  });
});
