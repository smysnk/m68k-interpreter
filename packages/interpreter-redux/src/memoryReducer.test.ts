import { describe, expect, it } from 'vitest';
import { createMemoryState } from './state';
import {
  MAX_MEMORY_ADDRESS,
  MEMORY_CODE_BYTE,
  MEMORY_CODE_LONG,
  MEMORY_CODE_WORD,
  clearMemoryState,
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

describe('memoryReducer', () => {
  it('reads and writes bytes, words, and longs in big-endian order', () => {
    let state = createMemoryState();
    state = setMemoryByte(state, 0x1000, 0xab);
    state = setMemoryWord(state, 0x1001, 0xcdef);
    state = setMemoryLong(state, 0x1003, 0x12345678);

    expect(getMemoryByte(state, 0x1000)).toBe(0xab);
    expect(getMemoryByte(state, 0x1001)).toBe(0xcd);
    expect(getMemoryByte(state, 0x1002)).toBe(0xef);
    expect(getMemoryWord(state, 0x1001)).toBe(0xcdef);
    expect(getMemoryLong(state, 0x1003)).toBe(0x12345678);
  });

  it('supports generic size-based writes and memory clearing', () => {
    let state = createMemoryState();
    state = setMemoryValue(state, 0x2000, 0x12, MEMORY_CODE_BYTE);
    state = setMemoryValue(state, 0x2001, 0x3456, MEMORY_CODE_WORD);
    state = setMemoryValue(state, 0x2003, 0x789abcde, MEMORY_CODE_LONG);

    expect(getMemoryByte(state, 0x2000)).toBe(0x12);
    expect(getMemoryWord(state, 0x2001)).toBe(0x3456);
    expect(getMemoryLong(state, 0x2003)).toBe(0x789abcde);
    expect(getUsedMemorySize(state)).toBe(7);

    const clearedState = clearMemoryState(state);
    expect(getUsedMemorySize(clearedState)).toBe(0);
    expect(getMemoryByte(clearedState, 0x2000)).toBe(0);
  });

  it('matches the current interpreter address bounds for word and long reads', () => {
    const state = createMemoryState({
      [MAX_MEMORY_ADDRESS]: 0xff,
    });

    expect(isValidMemoryAddress(MAX_MEMORY_ADDRESS)).toBe(true);
    expect(isValidMemoryAddress(MAX_MEMORY_ADDRESS + 1)).toBe(false);
    expect(getMemoryWord(state, MAX_MEMORY_ADDRESS)).toBe(0);
    expect(getMemoryLong(state, MAX_MEMORY_ADDRESS - 1)).toBe(0);
  });
});
