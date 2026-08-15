import { describe, expect, it } from 'vitest';
import { decodeLoadedInstructions } from '../instructionDecoder';
import { decodeBinaryInstruction } from '../cpu/decoder';
import { encodeSourceInstruction } from './sourceEncoder';

function encode(
  source: string,
  symbols: Record<string, number> = {},
  address = 0x1000
): Uint8Array {
  const [instruction] = decodeLoadedInstructions([[source, 1, false]], symbols);
  return encodeSourceInstruction(instruction, symbols, address);
}

describe('source instruction encoder', () => {
  it.each([
    ['MOVE.B D0,D1', [0x12, 0x00], 'move'],
    ['MOVEA.W #$FFFF,A0', [0x30, 0x7c, 0xff, 0xff], 'movea'],
    ['ADDI.B #1,D1', [0x06, 0x01, 0x00, 0x01], 'immediate-data'],
    ['ADD.W (A0),D1', [0xd2, 0x50], 'binary-alu'],
    ['ADD.W D0,(A0)', [0xd1, 0x50], 'binary-alu'],
    ['ADDA.L #$20,A1', [0xd3, 0xfc, 0x00, 0x00, 0x00, 0x20], 'address-alu'],
    ['CLR.B D0', [0x42, 0x00], 'unary'],
    ['MULU #3,D1', [0xc2, 0xfc, 0x00, 0x03], 'multiply-divide'],
    ['LEA (A0),A1', [0x43, 0xd0], 'control-ea'],
    ['MOVEM.W D0-D1,(A0)', [0x48, 0x90, 0x00, 0x03], 'movem'],
    ['EXG D0,D1', [0xc1, 0x41], 'exg'],
    ['ASL.B #1,D0', [0xe3, 0x00], 'register-shift'],
    ['ADDX.B D0,D1', [0xd3, 0x00], 'extend-arithmetic'],
    ['ABCD D0,D1', [0xc3, 0x00], 'bcd'],
    ['NEGX.W D0', [0x40, 0x40], 'unary-extend'],
    ['CHK.W D0,D1', [0x43, 0x80], 'chk'],
    ['TAS (A0)', [0x4a, 0xd0], 'tas'],
    ['MOVEP.L 4(A0),D1', [0x03, 0x48, 0x00, 0x04], 'movep'],
    ['MOVE SR,D0', [0x40, 0xc0], 'move-status'],
    ['MOVE D0,CCR', [0x44, 0xc0], 'move-status'],
    ['MOVE A0,USP', [0x4e, 0x60], 'move-usp'],
  ] as const)(
    'encodes %s independently and round-trips through the decoder',
    (source, bytes, kind) => {
      const encoded = encode(source);
      expect(Array.from(encoded)).toEqual(bytes);
      expect(decodeBinaryInstruction(encoded).kind).toBe(kind);
    }
  );

  it('uses exact byte addresses for word-displacement branches', () => {
    expect(Array.from(encode('BNE TARGET', { target: 0x1010 }))).toEqual([0x66, 0x00, 0x00, 0x0e]);
  });
});
