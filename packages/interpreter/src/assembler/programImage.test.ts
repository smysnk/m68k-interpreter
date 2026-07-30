import { describe, expect, it } from 'vitest';
import { encodeBranch, encodeIllegal, encodeMoveq, encodeNop, encodeTrap } from './encoder';
import { createProgramImage, findProgramSource } from './programImage';
import { decodeBinaryInstruction } from '../cpu/decoder';

describe('ProgramImage and initial MC68000 encoder', () => {
  it('tracks exact byte addresses independently from source lines', () => {
    const image = createProgramImage(
      [
        { bytes: encodeNop(), line: 10 },
        { bytes: encodeMoveq(2, -1), line: 11 },
        { bytes: encodeIllegal(), line: 12 },
      ],
      { origin: 0x1000 }
    );

    expect(Array.from(image.bytes)).toEqual([0x4e, 0x71, 0x74, 0xff, 0x4a, 0xfc]);
    expect(image.entryPoint).toBe(0x1000);
    expect(image.sourceMap).toEqual([
      { address: 0x1000, length: 2, line: 10 },
      { address: 0x1002, length: 2, line: 11 },
      { address: 0x1004, length: 2, line: 12 },
    ]);
    expect(findProgramSource(image, 0x1003)?.line).toBe(11);
  });

  it('round-trips fixed, MOVEQ, TRAP, and branch encodings', () => {
    expect(decodeBinaryInstruction(encodeNop())).toMatchObject({ kind: 'nop', length: 2 });
    expect(decodeBinaryInstruction(encodeMoveq(7, -128))).toMatchObject({
      kind: 'moveq',
      register: 7,
      immediate: -128,
    });
    expect(decodeBinaryInstruction(encodeTrap(15))).toMatchObject({
      kind: 'trap',
      vector: 15,
    });
    expect(decodeBinaryInstruction(encodeBranch('ne', -2))).toMatchObject({
      kind: 'branch',
      condition: 'ne',
      displacement: -2,
      length: 2,
    });
    expect(decodeBinaryInstruction(encodeBranch('eq', 0x1234))).toMatchObject({
      kind: 'branch',
      condition: 'eq',
      displacement: 0x1234,
      length: 4,
    });
  });

  it('rejects values that cannot be encoded by an MC68000 form', () => {
    expect(() => encodeMoveq(8, 0)).toThrow(RangeError);
    expect(() => encodeMoveq(0, 128)).toThrow(RangeError);
    expect(() => encodeTrap(16)).toThrow(RangeError);
    expect(() => encodeBranch('bra', 0x8000)).toThrow(RangeError);
  });
});
