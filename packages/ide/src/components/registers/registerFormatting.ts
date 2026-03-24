export type RegisterBitWidth = 8 | 16 | 32;
export type RegisterDecimalMode = 'signed' | 'unsigned';
export type RegisterRadix = 'hex' | 'dec' | 'bin';
export type RegisterRowBitWidth = 8 | 16;

export interface RegisterBitCell {
  bit: '0' | '1';
  bitIndex: number | null;
  interactive: boolean;
}

export interface RegisterBitRowModel {
  rowIndex: number;
  segmentBitWidth: RegisterRowBitWidth;
  segmentHex: string;
  binaryText: string;
  groups: RegisterBitCell[][];
}

type RegisterFormatOptions = {
  groupSize?: number;
  prefix?: boolean;
  decimalMode?: RegisterDecimalMode;
};

function toFiniteInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.trunc(value);
}

export function normalizeRegisterValue(value: number, bitWidth: RegisterBitWidth): number {
  return Number(BigInt.asUintN(bitWidth, BigInt(toFiniteInteger(value))));
}

export function getSignedRegisterValue(value: number, bitWidth: RegisterBitWidth): number {
  return Number(BigInt.asIntN(bitWidth, BigInt(normalizeRegisterValue(value, bitWidth))));
}

export function formatRegisterHex(
  value: number,
  bitWidth: RegisterBitWidth,
  { prefix = true }: RegisterFormatOptions = {}
): string {
  const digits = Math.ceil(bitWidth / 4);
  const body = normalizeRegisterValue(value, bitWidth)
    .toString(16)
    .toUpperCase()
    .padStart(digits, '0');
  return prefix ? `0x${body}` : body;
}

export function formatRegisterDecimal(
  value: number,
  bitWidth: RegisterBitWidth,
  decimalMode: RegisterDecimalMode = 'signed'
): string {
  if (decimalMode === 'unsigned') {
    return String(normalizeRegisterValue(value, bitWidth));
  }

  return String(getSignedRegisterValue(value, bitWidth));
}

export function createRegisterBinaryGroups(
  value: number,
  bitWidth: RegisterBitWidth,
  groupSize = 4
): string[] {
  const normalized = normalizeRegisterValue(value, bitWidth);
  const binary = normalized.toString(2).padStart(bitWidth, '0');
  const groups: string[] = [];

  for (let index = 0; index < binary.length; index += groupSize) {
    groups.push(binary.slice(index, index + groupSize));
  }

  return groups;
}

export function formatRegisterBinary(
  value: number,
  bitWidth: RegisterBitWidth,
  { groupSize = 4 }: RegisterFormatOptions = {}
): string {
  return createRegisterBinaryGroups(value, bitWidth, groupSize).join(' ');
}

export function toggleRegisterBit(
  value: number,
  bitWidth: RegisterBitWidth,
  bitIndex: number
): number {
  if (bitIndex < 0 || bitIndex >= bitWidth) {
    return normalizeRegisterValue(value, bitWidth);
  }

  const normalized = BigInt(normalizeRegisterValue(value, bitWidth));
  const mask = 1n << BigInt(bitIndex);

  return normalizeRegisterValue(Number(normalized ^ mask), bitWidth);
}

function getRegisterRowWidths(bitWidth: RegisterBitWidth): RegisterRowBitWidth[] {
  switch (bitWidth) {
    case 32:
      return [16, 16];
    case 16:
      return [16];
    case 8:
    default:
      return [8];
  }
}

function getRegisterRowShift(bitWidth: RegisterBitWidth, rowIndex: number): number {
  const rowWidths = getRegisterRowWidths(bitWidth);
  return rowWidths.slice(rowIndex + 1).reduce((sum, width) => sum + width, 0);
}

function getUnsignedMask(bitWidth: RegisterBitWidth | RegisterRowBitWidth): bigint {
  return (1n << BigInt(bitWidth)) - 1n;
}

export function createRegisterBitRows(
  value: number,
  bitWidth: RegisterBitWidth
): RegisterBitRowModel[] {
  const normalized = BigInt(normalizeRegisterValue(value, bitWidth));
  const rowWidths = getRegisterRowWidths(bitWidth);

  return rowWidths.map((segmentBitWidth, rowIndex) => {
    const shift = getRegisterRowShift(bitWidth, rowIndex);
    const segmentMask = getUnsignedMask(segmentBitWidth);
    const segmentValue = Number((normalized >> BigInt(shift)) & segmentMask);
    const segmentHex = segmentValue
      .toString(16)
      .toUpperCase()
      .padStart(Math.ceil(segmentBitWidth / 4), '0');
    const activeBinary = segmentValue.toString(2).padStart(segmentBitWidth, '0');
    const displayBinary =
      segmentBitWidth === 16 ? activeBinary : `${'0'.repeat(16 - segmentBitWidth)}${activeBinary}`;
    const groups: RegisterBitCell[][] = [];

    for (let groupIndex = 0; groupIndex < 4; groupIndex += 1) {
      const group: RegisterBitCell[] = [];

      for (let bitOffset = 0; bitOffset < 4; bitOffset += 1) {
        const displayIndex = groupIndex * 4 + bitOffset;
        const displayBit = displayBinary[displayIndex] as '0' | '1';
        const activeIndex = displayIndex - (16 - segmentBitWidth);

        if (activeIndex < 0) {
          group.push({
            bit: displayBit,
            bitIndex: null,
            interactive: false,
          });
          continue;
        }

        group.push({
          bit: displayBit,
          bitIndex: shift + (segmentBitWidth - 1 - activeIndex),
          interactive: true,
        });
      }

      groups.push(group);
    }

    return {
      rowIndex,
      segmentBitWidth,
      segmentHex,
      binaryText: groups
        .map((group) => group.map((cell) => cell.bit).join(''))
        .join(' '),
      groups,
    };
  });
}

export function mergeRegisterRowHexValue(
  currentValue: number,
  bitWidth: RegisterBitWidth,
  rowIndex: number,
  nextRowValue: number
): number {
  const rowWidths = getRegisterRowWidths(bitWidth);
  const segmentBitWidth = rowWidths[rowIndex];

  if (segmentBitWidth === undefined) {
    return normalizeRegisterValue(currentValue, bitWidth);
  }

  const shift = getRegisterRowShift(bitWidth, rowIndex);
  const current = BigInt(normalizeRegisterValue(currentValue, bitWidth));
  const segmentMask = getUnsignedMask(segmentBitWidth) << BigInt(shift);
  const nextSegment =
    (BigInt(normalizeRegisterValue(nextRowValue, segmentBitWidth)) & getUnsignedMask(segmentBitWidth)) <<
    BigInt(shift);

  return normalizeRegisterValue(Number((current & ~segmentMask) | nextSegment), bitWidth);
}

export function updateRegisterHexDigit(segmentHex: string, nibbleIndex: number, nextDigit: string): string {
  if (nibbleIndex < 0 || nibbleIndex >= segmentHex.length) {
    return segmentHex;
  }

  const normalizedDigit = nextDigit.toUpperCase();

  if (!/^[0-9A-F]$/.test(normalizedDigit)) {
    return segmentHex;
  }

  return `${segmentHex.slice(0, nibbleIndex)}${normalizedDigit}${segmentHex.slice(nibbleIndex + 1)}`;
}

export function stepRegisterHexDigit(segmentHex: string, nibbleIndex: number, delta: 1 | -1): string {
  if (nibbleIndex < 0 || nibbleIndex >= segmentHex.length) {
    return segmentHex;
  }

  const currentDigit = segmentHex[nibbleIndex];

  if (!/^[0-9A-F]$/i.test(currentDigit)) {
    return segmentHex;
  }

  const currentValue = Number.parseInt(currentDigit, 16);
  const nextValue = (currentValue + delta + 16) % 16;

  return updateRegisterHexDigit(segmentHex, nibbleIndex, nextValue.toString(16));
}

export function formatRegisterValueForRadix(
  value: number,
  bitWidth: RegisterBitWidth,
  radix: RegisterRadix,
  options: RegisterFormatOptions = {}
): string {
  switch (radix) {
    case 'hex':
      return formatRegisterHex(value, bitWidth, options);
    case 'bin':
      return formatRegisterBinary(value, bitWidth, options);
    case 'dec':
    default:
      return formatRegisterDecimal(value, bitWidth, options.decimalMode);
  }
}

function sanitizePrefixedInput(input: string, prefixPattern: RegExp): string {
  return input.trim().replace(prefixPattern, '').replace(/[\s_]/g, '');
}

export function parseRegisterInput(
  input: string,
  bitWidth: RegisterBitWidth,
  radix: RegisterRadix
): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  switch (radix) {
    case 'dec': {
      const sanitized = trimmed.replace(/_/g, '');
      if (!/^[+-]?\d+$/.test(sanitized)) {
        return null;
      }
      return normalizeRegisterValue(Number.parseInt(sanitized, 10), bitWidth);
    }

    case 'hex': {
      const sanitized = sanitizePrefixedInput(trimmed, /^(0x|\$)/i);
      if (!/^[\da-f]+$/i.test(sanitized)) {
        return null;
      }
      return normalizeRegisterValue(Number.parseInt(sanitized, 16), bitWidth);
    }

    case 'bin': {
      const sanitized = sanitizePrefixedInput(trimmed, /^(0b|%)/i);
      if (!/^[01]+$/.test(sanitized)) {
        return null;
      }
      return normalizeRegisterValue(Number.parseInt(sanitized, 2), bitWidth);
    }

    default:
      return null;
  }
}
