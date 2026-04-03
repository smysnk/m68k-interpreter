import { describe, expect, it } from 'vitest';
import {
  CODE_BYTE,
  CODE_WORD,
  addOP,
  andOP,
  divsOP,
  extOP,
  lslOP,
  moveOP,
  mulsOP,
  rolOP,
} from './operations';

describe('operations sign-extension helpers', () => {
  it('preserves byte overflow and negative CCR flags for ADD.B', () => {
    const [result, ccr] = addOP(0x01, 0x7f, 0x00, CODE_BYTE, false);

    expect(result).toBe(0x80);
    expect(ccr & 0x02).toBe(0x02);
    expect(ccr & 0x08).toBe(0x08);
    expect(ccr & 0x01).toBe(0x00);
    expect(ccr & 0x04).toBe(0x00);
  });

  it('preserves positive MOVE.B upper bits and sign-extends negative MOVE.W results', () => {
    const [byteResult, byteCCR] = moveOP(0x7f, 0x12345600, 0x00, CODE_BYTE);
    const [wordResult, wordCCR] = moveOP(0xff80, 0x12340000, 0x00, CODE_WORD);

    expect(byteResult >>> 0).toBe(0x1234567f);
    expect(byteCCR & 0x08).toBe(0x00);
    expect(wordResult >>> 0).toBe(0xffffff80);
    expect(wordCCR & 0x08).toBe(0x08);
  });

  it('extends byte to word without disturbing the upper word', () => {
    const [result, ccr] = extOP(CODE_WORD, 0x12340080, 0x00);

    expect(result >>> 0).toBe(0x1234ff80);
    expect(ccr & 0x08).toBe(0x08);
  });

  it('keeps low-word CCR evaluation for logical word results with preserved upper bits', () => {
    const [result, ccr] = andOP(CODE_WORD, 0x1234ffff, 0x00008001, 0x00);

    expect(result >>> 0).toBe(0x12348001);
    expect(ccr & 0x08).toBe(0x08);
    expect(ccr & 0x04).toBe(0x00);
  });

  it('returns signed results for LSL byte operations and unsigned results for ROL byte operations', () => {
    const [shifted, shiftCCR] = lslOP(1, 0x40, 0x00, CODE_BYTE);
    const [rotated, rotateCCR] = rolOP(1, 0x40, 0x00, CODE_BYTE);

    expect(shifted).toBe(-128);
    expect(shiftCCR & 0x08).toBe(0x08);
    expect(rotated).toBe(0x80);
    expect(rotateCCR & 0x08).toBe(0x08);
  });

  it('treats signed word operands correctly for MULS and DIVS', () => {
    const [product, mulCCR] = mulsOP(CODE_WORD, 0xffff, 0x0002, 0x00);
    const [quotient, divCCR] = divsOP(CODE_WORD, 0xffff, 0x00000006, 0x00);

    expect(product >>> 0).toBe(0xfffffffe);
    expect(mulCCR & 0x08).toBe(0x08);
    expect(quotient >>> 0).toBe(0x0000fffa);
    expect(divCCR & 0x08).toBe(0x08);
  });
});
