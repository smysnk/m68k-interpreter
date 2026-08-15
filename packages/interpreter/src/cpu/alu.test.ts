import { describe, expect, it } from 'vitest';
import {
  FLAG_C,
  FLAG_N,
  FLAG_V,
  FLAG_X,
  FLAG_Z,
  addResult,
  compareResult,
  logicResult,
  subResult,
} from './alu';

describe('strict-core ALU flag results', () => {
  it('reports carry and signed overflow independently', () => {
    expect(addResult(0xff, 1, 1, 0)).toEqual({ value: 0, ccr: FLAG_X | FLAG_Z | FLAG_C });
    expect(addResult(0x7f, 1, 1, 0)).toEqual({ value: 0x80, ccr: FLAG_N | FLAG_V });
  });

  it('preserves sticky zero for extend-aware arithmetic', () => {
    expect(addResult(0, 0, 1, FLAG_Z, 0, true).ccr & FLAG_Z).toBe(FLAG_Z);
    expect(addResult(0, 0, 1, 0, 0, true).ccr & FLAG_Z).toBe(0);
    expect(subResult(0, 0, 1, FLAG_Z, 0, true).ccr & FLAG_Z).toBe(FLAG_Z);
  });

  it('preserves X for comparisons and logical operations', () => {
    expect(compareResult(1, 2, 1, FLAG_X).ccr & FLAG_X).toBe(FLAG_X);
    expect(logicResult(0, 2, FLAG_X | FLAG_C | FLAG_V).ccr).toBe(FLAG_X | FLAG_Z);
  });
});
