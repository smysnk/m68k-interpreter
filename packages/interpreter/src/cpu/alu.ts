export type OperandSize = 1 | 2 | 4;

export const FLAG_C = 0x01;
export const FLAG_V = 0x02;
export const FLAG_Z = 0x04;
export const FLAG_N = 0x08;
export const FLAG_X = 0x10;
export const CCR_MASK = FLAG_X | FLAG_N | FLAG_Z | FLAG_V | FLAG_C;

export function sizeMask(size: OperandSize): number {
  return size === 1 ? 0xff : size === 2 ? 0xffff : 0xffff_ffff;
}

export function signBit(size: OperandSize): number {
  return size === 1 ? 0x80 : size === 2 ? 0x8000 : 0x8000_0000;
}

export function truncate(value: number, size: OperandSize): number {
  return size === 4 ? value >>> 0 : value & sizeMask(size);
}

export function signExtend(value: number, size: OperandSize): number {
  const truncated = truncate(value, size);
  if (size === 1) return (truncated << 24) >> 24;
  if (size === 2) return (truncated << 16) >> 16;
  return truncated | 0;
}

export interface AluResult {
  value: number;
  ccr: number;
}

function nzFlags(value: number, size: OperandSize): number {
  const result = truncate(value, size);
  return (result === 0 ? FLAG_Z : 0) | ((result & signBit(size)) !== 0 ? FLAG_N : 0);
}

export function logicResult(value: number, size: OperandSize, previousCcr: number): AluResult {
  return {
    value: truncate(value, size),
    ccr: (previousCcr & FLAG_X) | nzFlags(value, size),
  };
}

export function addResult(
  destination: number,
  source: number,
  size: OperandSize,
  previousCcr: number,
  extend = 0,
  stickyZero = false
): AluResult {
  const mask = sizeMask(size) >>> 0;
  const unsignedDestination = truncate(destination, size);
  const unsignedSource = truncate(source, size);
  const sum = unsignedDestination + unsignedSource + (extend & 1);
  const value = size === 4 ? sum >>> 0 : sum & mask;
  const carry = sum > mask;
  const destinationNegative = (truncate(destination, size) & signBit(size)) !== 0;
  const sourceNegative = (truncate(source, size) & signBit(size)) !== 0;
  const resultNegative = (value & signBit(size)) !== 0;
  const overflow = destinationNegative === sourceNegative && destinationNegative !== resultNegative;
  const zero = value === 0 && (!stickyZero || (previousCcr & FLAG_Z) !== 0);
  return {
    value,
    ccr:
      (carry ? FLAG_X | FLAG_C : 0) |
      (overflow ? FLAG_V : 0) |
      (resultNegative ? FLAG_N : 0) |
      (zero ? FLAG_Z : 0),
  };
}

export function subResult(
  destination: number,
  source: number,
  size: OperandSize,
  previousCcr: number,
  extend = 0,
  stickyZero = false,
  affectExtend = true
): AluResult {
  const unsignedDestination = truncate(destination, size);
  const unsignedSource = truncate(source, size);
  const subtrahend = unsignedSource + (extend & 1);
  const mask = sizeMask(size) >>> 0;
  const difference = unsignedDestination - subtrahend;
  const value = size === 4 ? difference >>> 0 : difference & mask;
  const borrow = subtrahend > unsignedDestination;
  const resultNegative = (value & signBit(size)) !== 0;
  const minimum = -(2 ** (size * 8 - 1));
  const maximum = 2 ** (size * 8 - 1) - 1;
  const signedDifference = signExtend(destination, size) - signExtend(source, size) - (extend & 1);
  const overflow = signedDifference < minimum || signedDifference > maximum;
  const zero = value === 0 && (!stickyZero || (previousCcr & FLAG_Z) !== 0);
  return {
    value,
    ccr:
      (!affectExtend ? previousCcr & FLAG_X : borrow ? FLAG_X : 0) |
      (borrow ? FLAG_C : 0) |
      (overflow ? FLAG_V : 0) |
      (resultNegative ? FLAG_N : 0) |
      (zero ? FLAG_Z : 0),
  };
}

export function compareResult(
  destination: number,
  source: number,
  size: OperandSize,
  previousCcr: number
): AluResult {
  return subResult(destination, source, size, previousCcr, 0, false, false);
}
