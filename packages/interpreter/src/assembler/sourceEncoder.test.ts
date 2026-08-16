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
    ['BKPT #7', [0x48, 0x4f], 'bkpt'],
    ['MOVEC VBR,D0', [0x4e, 0x7a, 0x08, 0x01], 'movec'],
    ['MOVEC D1,SFC', [0x4e, 0x7b, 0x10, 0x00], 'movec'],
    ['MOVES.B D0,(A0)', [0x0e, 0x10, 0x08, 0x00], 'moves'],
    ['MOVES.W (A1),A2', [0x0e, 0x51, 0xa0, 0x00], 'moves'],
    ['MOVES.L D3,4(A4)', [0x0e, 0xac, 0x38, 0x00, 0x00, 0x04], 'moves'],
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

  it.each([
    ['EXTB.L D0', [0x49, 0xc0], 'extb'],
    ['LINK.L A0,#-8', [0x48, 0x08, 0xff, 0xff, 0xff, 0xf8], 'link-long'],
    ['TRAPNE', [0x56, 0xfc], 'trapcc'],
    ['PACK D0,D1,#0', [0x83, 0x40, 0x00, 0x00], 'pack-unpk'],
    ['BFEXTU D0{8:8},D1', [0xe9, 0xc0, 0x12, 0x08], 'bitfield'],
    ['CAS.L D0,D1,(A0)', [0x0e, 0xd0, 0x00, 0x40], 'cas'],
    ['CAS2.L D0:D1,D2:D3,(A0):(A1)', [0x0e, 0xfc, 0x00, 0x80, 0x10, 0xc1], 'cas2'],
    ['CHK2.L (A0),D0', [0x04, 0xd0, 0x08, 0x00], 'chk2-cmp2'],
    ['MULU.L D0,D1', [0x4c, 0x00, 0x10, 0x01], 'long-multiply-divide'],
    ['CHK.L D0,D1', [0x43, 0x00], 'chk'],
    ['CALLM #7,(A0)', [0x06, 0xd0, 0x00, 0x07], 'callm'],
    ['RTM D0', [0x06, 0xc0], 'rtm'],
    ['CPGEN #1,#$1234', [0xf2, 0x00, 0x12, 0x34], 'coprocessor'],
    ['CPBCC #1,#5,$1010', [0xf2, 0x85, 0x00, 0x0e], 'coprocessor'],
    ['CPDBCC #1,#5,D0,$1010', [0xf2, 0x48, 0x00, 0x05, 0x00, 0x0e], 'coprocessor'],
    ['CPSCC #1,#5,(A0)', [0xf2, 0x50, 0x00, 0x05], 'coprocessor'],
    ['CPTRAPCC #1,#5', [0xf2, 0x7c, 0x00, 0x05], 'coprocessor'],
    ['CPSAVE #1,(A0)', [0xf3, 0x10], 'coprocessor'],
    ['CPRESTORE #1,(A0)', [0xf3, 0x50], 'coprocessor'],
  ] as const)('encodes MC68020 form %s', (source, bytes, kind) => {
    const encoded = encode(source);
    expect(Array.from(encoded)).toEqual(bytes);
    expect(decodeBinaryInstruction(encoded, 0, 'm68020').kind).toBe(kind);
  });

  it.each([
    ['MOVE.L 256(A0,D1.L*2),D0', [0x20, 0x30, 0x1b, 0x20, 0x01, 0x00]],
    ['MOVE.L ([16,A0,D1.L*2],32),D0', [0x20, 0x30, 0x1b, 0x22, 0x00, 0x10, 0x00, 0x20]],
    ['MOVE.L ([16,A0],D1.L*2,32),D0', [0x20, 0x30, 0x1b, 0x26, 0x00, 0x10, 0x00, 0x20]],
    ['MOVE.L 256(PC,D1.L*2),D0', [0x20, 0x3b, 0x1b, 0x20, 0x01, 0x00]],
    ['MOVE.L 256(ZA0,D1.L*2),D0', [0x20, 0x30, 0x1b, 0xa0, 0x01, 0x00]],
    ['MOVE.L ([16,ZPC],D1.L*2,32),D0', [0x20, 0x3b, 0x1b, 0xa6, 0x00, 0x10, 0x00, 0x20]],
  ] as const)('encodes full-format effective address %s', (source, bytes) => {
    expect(Array.from(encode(source))).toEqual(bytes);
  });
});
