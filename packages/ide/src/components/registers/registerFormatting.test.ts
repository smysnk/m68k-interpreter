import { describe, expect, it } from 'vitest';
import {
  createRegisterBitRows,
  createRegisterBinaryGroups,
  formatRegisterBinary,
  formatRegisterDecimal,
  formatRegisterHex,
  mergeRegisterRowHexValue,
  normalizeRegisterValue,
  parseRegisterInput,
  stepRegisterHexDigit,
  toggleRegisterBit,
} from './registerFormatting';

describe('registerFormatting', () => {
  it('normalizes register values to the declared register width', () => {
    expect(normalizeRegisterValue(0x1_0000_0001, 32)).toBe(1);
    expect(normalizeRegisterValue(0x1ff, 8)).toBe(0xff);
  });

  it('formats hex and decimal using register-width aware rules', () => {
    expect(formatRegisterHex(-1, 32)).toBe('0xFFFFFFFF');
    expect(formatRegisterHex(0x1f, 8)).toBe('0x1F');
    expect(formatRegisterDecimal(0xffffffff, 32, 'signed')).toBe('-1');
    expect(formatRegisterDecimal(0xffffffff, 32, 'unsigned')).toBe('4294967295');
    expect(formatRegisterDecimal(0xff, 8, 'unsigned')).toBe('255');
  });

  it('formats grouped binary output for full-width registers', () => {
    expect(createRegisterBinaryGroups(0xa5, 8)).toEqual(['1010', '0101']);
    expect(formatRegisterBinary(0xa5, 8)).toBe('1010 0101');
  });

  it('parses decimal, hex, and binary input while clamping to the register width', () => {
    expect(parseRegisterInput('-1', 32, 'dec')).toBe(0xffffffff);
    expect(parseRegisterInput('$1ff', 8, 'hex')).toBe(0xff);
    expect(parseRegisterInput('0b1010_0101', 8, 'bin')).toBe(0xa5);
    expect(parseRegisterInput('%1010 0101', 8, 'bin')).toBe(0xa5);
  });

  it('returns null for invalid register input', () => {
    expect(parseRegisterInput('', 32, 'dec')).toBeNull();
    expect(parseRegisterInput('0xnope', 32, 'hex')).toBeNull();
    expect(parseRegisterInput('10201', 32, 'bin')).toBeNull();
  });

  it('toggles individual register bits without changing the declared width', () => {
    expect(toggleRegisterBit(0, 8, 0)).toBe(0x01);
    expect(toggleRegisterBit(0x01, 8, 0)).toBe(0x00);
    expect(toggleRegisterBit(0xff, 8, 7)).toBe(0x7f);
    expect(toggleRegisterBit(0, 32, 31)).toBe(0x80000000);
  });

  it('creates 16-bit display rows and merges per-row hex edits back into the register', () => {
    expect(createRegisterBitRows(0x12345678, 32)).toEqual([
      expect.objectContaining({
        rowIndex: 0,
        segmentBitWidth: 16,
        segmentHex: '1234',
        binaryText: '0001 0010 0011 0100',
      }),
      expect.objectContaining({
        rowIndex: 1,
        segmentBitWidth: 16,
        segmentHex: '5678',
        binaryText: '0101 0110 0111 1000',
      }),
    ]);

    expect(createRegisterBitRows(0xa5, 8)[0]).toEqual(
      expect.objectContaining({
        segmentBitWidth: 8,
        segmentHex: 'A5',
        binaryText: '0000 0000 1010 0101',
      })
    );

    expect(mergeRegisterRowHexValue(0x12345678, 32, 1, 0xabcd)).toBe(0x1234abcd);
    expect(mergeRegisterRowHexValue(0x00a5, 8, 0, 0xff)).toBe(0xff);
  });

  it('steps a selected hex digit up or down with wraparound', () => {
    expect(stepRegisterHexDigit('00AF', 2, 1)).toBe('00BF');
    expect(stepRegisterHexDigit('00AF', 3, 1)).toBe('00A0');
    expect(stepRegisterHexDigit('00AF', 2, -1)).toBe('009F');
    expect(stepRegisterHexDigit('00AF', 0, -1)).toBe('F0AF');
  });
});
