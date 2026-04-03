/**
 * Arithmetic and logical operations for M68K emulator
 * Handles ADD, SUB, MOVE, AND, OR, and other instruction operations
 */

export const CODE_LONG = 2;
export const CODE_WORD = 1;
export const CODE_BYTE = 0;

export const BYTE_MASK = 0x000000ff;
export const WORD_MASK = 0x0000ffff;
export const LONG_MASK = 0xffffffff;
export const MSB_BYTE_MASK = 0x80;
export const MSB_WORD_MASK = 0x8000;
export const MSB_LONG_MASK = 0x80000000;

function toSignedByte(value: number): number {
  return ((value & BYTE_MASK) << 24) >> 24;
}

function toSignedWord(value: number): number {
  return ((value & WORD_MASK) << 16) >> 16;
}

function applyArithmeticCCR(
  result: number,
  ccr: number,
  overflow: boolean,
  carry: boolean
): number {
  if (overflow) ccr = (ccr | 0x02) >>> 0;
  else ccr = (ccr & 0xfd) >>> 0;

  if (carry) ccr = (ccr | 0x01) >>> 0;
  else ccr = (ccr & 0xfe) >>> 0;

  if (result === 0) ccr = (ccr | 0x04) >>> 0;
  else ccr = (ccr & 0xfb) >>> 0;

  if (result < 0) ccr = (ccr | 0x08) >>> 0;
  else ccr = (ccr & 0xf7) >>> 0;

  if (carry) ccr = (ccr | 0x10) >>> 0;
  else ccr = (ccr & 0xef) >>> 0;

  return ccr;
}

function addWord(src: number, dest: number, ccr: number, isSub: boolean): [number, number] {
  let aux = dest;

  // need signed 16 bits dest and src for signed overflow testing
  const destSigned = toSignedWord(dest);
  const srcSigned = toSignedWord(src);
  const destUnsigned = dest & WORD_MASK;
  const srcUnsigned = src & WORD_MASK;

  aux = (aux & ~WORD_MASK) >>> 0; // Save the 16 leftmost bits of the register
  dest = destUnsigned >>> 0; // Extract the 16 rightmost bits from destination

  if (isSub) dest -= srcUnsigned >>> 0;
  else dest += srcUnsigned >>> 0;

  const resultSigned = toSignedWord(dest);

  const overflow = isSub
    ? (destSigned >= 0 && srcSigned < 0 && resultSigned < 0) ||
      (destSigned < 0 && srcSigned >= 0 && resultSigned >= 0)
    : (destSigned >= 0 && srcSigned >= 0 && resultSigned < 0) ||
      (destSigned < 0 && srcSigned < 0 && resultSigned >= 0);
  const carry = isSub ? srcUnsigned > destUnsigned : dest > WORD_MASK;

  ccr = applyArithmeticCCR(resultSigned, ccr, overflow, carry);

  dest = (dest & WORD_MASK) >>> 0; // Trim again to 16
  aux += dest; // Sum it to aux that contained the 16 leftmost bits of dest (32 bit sum)
  return [aux, ccr];
}

function addByte(src: number, dest: number, ccr: number, isSub: boolean): [number, number] {
  let aux = dest;

  // need signed 8 bits dest and src for signed overflow testing
  const destSigned = toSignedByte(dest);
  const srcSigned = toSignedByte(src);
  const destUnsigned = dest & BYTE_MASK;
  const srcUnsigned = src & BYTE_MASK;

  aux = (aux & ~BYTE_MASK) >>> 0; // Save the 8 leftmost bits
  dest = destUnsigned >>> 0; // Extract 8 rightmost bits

  if (isSub) dest -= srcUnsigned >>> 0;
  else dest += srcUnsigned >>> 0;

  const resultSigned = toSignedByte(dest);

  const overflow = isSub
    ? (destSigned >= 0 && srcSigned < 0 && resultSigned < 0) ||
      (destSigned < 0 && srcSigned >= 0 && resultSigned >= 0)
    : (destSigned >= 0 && srcSigned >= 0 && resultSigned < 0) ||
      (destSigned < 0 && srcSigned < 0 && resultSigned >= 0);
  const carry = isSub ? srcUnsigned > destUnsigned : dest > BYTE_MASK;

  ccr = applyArithmeticCCR(resultSigned, ccr, overflow, carry);

  dest = (dest & BYTE_MASK) >>> 0; // Trim again to 8
  aux += dest;
  return [aux, ccr];
}

function addLong(src: number, dest: number, ccr: number, isSub: boolean): [number, number] {
  const destUnsigned = dest >>> 0;
  const srcUnsigned = src >>> 0;
  const destSigned = dest | 0;
  const srcSigned = src | 0;

  const fullResult = isSub ? destUnsigned - srcUnsigned : destUnsigned + srcUnsigned;
  const resultUnsigned = fullResult >>> 0;
  const resultSigned = resultUnsigned | 0;
  const carry = isSub ? srcUnsigned > destUnsigned : fullResult > LONG_MASK;
  const overflow = isSub
    ? (destSigned >= 0 && srcSigned < 0 && resultSigned < 0) ||
      (destSigned < 0 && srcSigned >= 0 && resultSigned >= 0)
    : (destSigned >= 0 && srcSigned >= 0 && resultSigned < 0) ||
      (destSigned < 0 && srcSigned < 0 && resultSigned >= 0);

  ccr = applyArithmeticCCR(resultSigned, ccr, overflow, carry);
  return [resultUnsigned, ccr];
}

export function addOP(
  src: number,
  dest: number,
  ccr: number,
  size: number,
  isSub: boolean
): [number, number] {
  switch (size) {
    case CODE_LONG:
      return addLong(src, dest, ccr, isSub);
    case CODE_WORD:
      return addWord(src, dest, ccr, isSub);
    case CODE_BYTE:
      return addByte(src, dest, ccr, isSub);
    default:
      throw new Error('Invalid size');
  }
}

function moveCCR(res: number, ccr: number): number {
  // Setting carry and overflow bits to 0
  ccr = (ccr & 0xfc) >>> 0;

  // Zero
  if (res === 0) ccr = (ccr | 0x04) >>> 0;
  else ccr = (ccr & 0xfb) >>> 0;

  // Negative
  if (res < 0) ccr = (ccr | 0x08) >>> 0;
  else ccr = (ccr & 0xf7) >>> 0;

  return ccr;
}

export function moveOP(src: number, dest: number, ccr: number, size: number): [number, number] {
  let aux: number;

  switch (size) {
    case CODE_LONG:
      return [src, moveCCR(src | 0, ccr)];
    case CODE_WORD: {
      aux = addOP(src, dest & ~WORD_MASK, ccr, size, false)[0]; // New register value
      const signedWord = toSignedWord(aux);

      aux = ((aux & ~WORD_MASK) | (signedWord & WORD_MASK)) >>> 0;
      if (signedWord < 0) {
        aux = (aux | 0xffff0000) >>> 0;
      }

      return [aux, moveCCR(signedWord, ccr)];
    }
    case CODE_BYTE: {
      aux = addOP(src, dest & ~BYTE_MASK, ccr, size, false)[0]; // New register value
      const signedByte = toSignedByte(aux);

      aux = ((aux & ~BYTE_MASK) | (signedByte & BYTE_MASK)) >>> 0;
      if (signedByte < 0) {
        aux = (aux | 0xffffff00) >>> 0;
      }

      return [aux, moveCCR(signedByte, ccr)];
    }
    default:
      throw new Error('Invalid size');
  }
}

export function swapOP(op: number, ccr: number): [number, number] {
  let tmp = op << 16; // Move first 16 bits to most significant positions
  op = op >> 16; // Move last 16 bits to least significant positions
  tmp += op; // Combine register
  return [tmp, moveCCR(tmp | 0, ccr)]; // Same behaviour as move
}

export function exgOP(op1: number, op2: number): [number, number] {
  return [op2, op1];
}

export function clrOP(size: number, op: number, ccr: number): [number, number] {
  ccr = (ccr & 0x10) >>> 0; // Reset every bit but the Extended bit
  ccr = (ccr | 0x04) >>> 0; // Set zero bit to 1

  switch (size) {
    case CODE_BYTE:
      return [op & ~BYTE_MASK, ccr];
    case CODE_WORD:
      return [op & ~WORD_MASK, ccr];
    case CODE_LONG:
      return [0x00000000, ccr];
    default:
      throw new Error('Invalid size');
  }
}

export function notOP(size: number, op: number, ccr: number): [number, number] {
  let res: number;

  switch (size) {
    case CODE_BYTE: {
      res = ((op & ~BYTE_MASK) + (~op & BYTE_MASK)) >>> 0;
      return [res, moveCCR(toSignedByte(res), ccr)]; // Same ccr behaviour as move
    }
    case CODE_WORD: {
      res = ((op & ~WORD_MASK) + (~op & WORD_MASK)) >>> 0;
      return [res, moveCCR(toSignedWord(res), ccr)]; // Same ccr behaviour as move
    }
    case CODE_LONG: {
      res = ~op >>> 0;
      return [res, moveCCR(res | 0, ccr)]; // Same ccr behaviour as move
    }
    default:
      throw new Error('Invalid size');
  }
}

export function andOP(size: number, op1: number, op2: number, ccr: number): [number, number] {
  let res: number;

  switch (size) {
    case CODE_BYTE: {
      res = (op1 & BYTE_MASK & (op2 & BYTE_MASK)) >>> 0;
      res = (op1 & ~BYTE_MASK) + res;
      return [res, moveCCR(toSignedByte(res), ccr)];
    }
    case CODE_WORD: {
      res = (op1 & WORD_MASK & (op2 & WORD_MASK)) >>> 0;
      res = (op1 & ~WORD_MASK) + res;
      return [res, moveCCR(toSignedWord(res), ccr)];
    }
    case CODE_LONG:
      res = (op1 & op2) >>> 0;
      return [res, moveCCR(res | 0, ccr)];
    default:
      throw new Error('Invalid size');
  }
}

export function orOP(size: number, op1: number, op2: number, ccr: number): [number, number] {
  let res: number;

  switch (size) {
    case CODE_BYTE: {
      res = ((op1 & BYTE_MASK) | (op2 & BYTE_MASK)) >>> 0;
      res = (op1 & ~BYTE_MASK) + res;
      return [res, moveCCR(toSignedByte(res), ccr)];
    }
    case CODE_WORD: {
      res = ((op1 & WORD_MASK) | (op2 & WORD_MASK)) >>> 0;
      res = (op1 & ~WORD_MASK) + res;
      return [res, moveCCR(toSignedWord(res), ccr)];
    }
    case CODE_LONG:
      res = (op1 | op2) >>> 0;
      return [res, moveCCR(res | 0, ccr)];
    default:
      throw new Error('Invalid size');
  }
}

export function eorOP(size: number, op1: number, op2: number, ccr: number): [number, number] {
  let res: number;

  switch (size) {
    case CODE_BYTE: {
      res = ((op1 & BYTE_MASK) ^ (op2 & BYTE_MASK)) >>> 0;
      res = (op1 & ~BYTE_MASK) + res;
      return [res, moveCCR(toSignedByte(res), ccr)];
    }
    case CODE_WORD: {
      res = ((op1 & WORD_MASK) ^ (op2 & WORD_MASK)) >>> 0;
      res = (op1 & ~WORD_MASK) + res;
      return [res, moveCCR(toSignedWord(res), ccr)];
    }
    case CODE_LONG:
      res = (op1 ^ op2) >>> 0;
      return [res, moveCCR(res | 0, ccr)];
    default:
      throw new Error('Invalid size');
  }
}

export function negOP(size: number, op: number, ccr: number): [number, number] {
  return addOP(op, 0, ccr, size, true);
}

export function extOP(size: number, op: number, ccr: number): [number, number] {
  let res: number;

  switch (size) {
    case CODE_WORD: {
      // Extend byte to word
      res = (op & ~BYTE_MASK) + (toSignedByte(op) & WORD_MASK);
      return [res, moveCCR(toSignedWord(res), ccr)];
    }
    case CODE_LONG: {
      // Extend word to long
      res = toSignedWord(op); // Sign-extend word to long
      return [res, moveCCR(res | 0, ccr)];
    }
    default:
      throw new Error('Invalid size for EXT');
  }
}

export function cmpOP(src: number, dest: number, ccr: number, size: number): number {
  const [, newCCR] = addOP(src, dest, ccr, size, true);
  return newCCR;
}

export function tstOP(op: number, ccr: number, _size: number): number {
  return moveCCR(op, ccr);
}

export function lslOP(count: number, op: number, ccr: number, size: number): [number, number] {
  let carry = 0;

  switch (size) {
    case CODE_BYTE: {
      for (let i = 0; i < count; i++) {
        carry = (op & MSB_BYTE_MASK) >>> 7;
        op = op << 1;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      const result = toSignedByte(op);
      return [result, moveCCR(result, ccr)];
    }
    case CODE_WORD: {
      for (let i = 0; i < count; i++) {
        carry = (op & MSB_WORD_MASK) >> 15;
        op = op << 1;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      const result = toSignedWord(op);
      return [result, moveCCR(result, ccr)];
    }
    case CODE_LONG: {
      for (let i = 0; i < count; i++) {
        carry = (op & MSB_LONG_MASK) >>> 31;
        op = (op << 1) >>> 0;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      return [op, moveCCR(op | 0, ccr)];
    }
    default:
      throw new Error('Invalid size');
  }
}

export function aslOP(count: number, op: number, ccr: number, size: number): [number, number] {
  // ASL (Arithmetic Shift Left) is the same as LSL
  return lslOP(count, op, ccr, size);
}

export function lsrOP(count: number, op: number, ccr: number, size: number): [number, number] {
  let carry = 0;

  switch (size) {
    case CODE_BYTE: {
      for (let i = 0; i < count; i++) {
        carry = op & 0x01;
        op = (op >>> 1) & ~MSB_BYTE_MASK;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      const result = toSignedByte(op);
      return [result, moveCCR(result, ccr)];
    }
    case CODE_WORD: {
      for (let i = 0; i < count; i++) {
        carry = op & 0x01;
        op = (op >>> 1) & ~MSB_WORD_MASK;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      const result = toSignedWord(op);
      return [result, moveCCR(result, ccr)];
    }
    case CODE_LONG:
      for (let i = 0; i < count; i++) {
        carry = op & 0x01;
        op = op >>> 1;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      return [op, moveCCR(op | 0, ccr)];
    default:
      throw new Error('Invalid size');
  }
}

export function asrOP(count: number, op: number, ccr: number, size: number): [number, number] {
  // ASR (Arithmetic Shift Right) - preserves sign bit
  let carry = 0;

  switch (size) {
    case CODE_BYTE: {
      const signBit8 = (op & MSB_BYTE_MASK) >>> 0;
      for (let i = 0; i < count; i++) {
        carry = op & 0x01;
        op = ((op >>> 1) | signBit8) >>> 0;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      const result = toSignedByte(op);
      return [result, moveCCR(result, ccr)];
    }
    case CODE_WORD: {
      const signBit16 = (op & MSB_WORD_MASK) >>> 0;
      for (let i = 0; i < count; i++) {
        carry = op & 0x01;
        op = ((op >>> 1) | signBit16) >>> 0;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      const result = toSignedWord(op);
      return [result, moveCCR(result, ccr)];
    }
    case CODE_LONG: {
      const signBit32 = (op & MSB_LONG_MASK) >>> 0;
      for (let i = 0; i < count; i++) {
        carry = op & 0x01;
        op = ((op >>> 1) | signBit32) >>> 0;
      }
      if (carry) ccr = (ccr | 0x01) >>> 0;
      else ccr = (ccr & 0xfe) >>> 0;
      return [op, moveCCR(op | 0, ccr)];
    }
    default:
      throw new Error('Invalid size');
  }
}

export function rolOP(count: number, op: number, ccr: number, size: number): [number, number] {
  switch (size) {
    case CODE_BYTE: {
      for (let i = 0; i < count; i++) {
        const carry = (op & MSB_BYTE_MASK) >>> 7;
        op = ((op << 1) | carry) & BYTE_MASK;
      }
      return [op, moveCCR(toSignedByte(op), ccr)];
    }
    case CODE_WORD: {
      for (let i = 0; i < count; i++) {
        const carry = (op & MSB_WORD_MASK) >> 15;
        op = ((op << 1) | carry) & WORD_MASK;
      }
      return [op, moveCCR(toSignedWord(op), ccr)];
    }
    case CODE_LONG:
      for (let i = 0; i < count; i++) {
        const carry = (op & MSB_LONG_MASK) >>> 31;
        op = ((op << 1) | carry) >>> 0;
      }
      return [op, moveCCR(op | 0, ccr)];
    default:
      throw new Error('Invalid size');
  }
}

export function rorOP(count: number, op: number, ccr: number, size: number): [number, number] {
  switch (size) {
    case CODE_BYTE: {
      for (let i = 0; i < count; i++) {
        const carry = op & 0x01;
        op = ((op >>> 1) | (carry << 7)) & BYTE_MASK;
      }
      return [op, moveCCR(toSignedByte(op), ccr)];
    }
    case CODE_WORD: {
      for (let i = 0; i < count; i++) {
        const carry = op & 0x01;
        op = ((op >>> 1) | (carry << 15)) & WORD_MASK;
      }
      return [op, moveCCR(toSignedWord(op), ccr)];
    }
    case CODE_LONG:
      for (let i = 0; i < count; i++) {
        const carry = op & 0x01;
        op = ((op >>> 1) | (carry << 31)) >>> 0;
      }
      return [op, moveCCR(op | 0, ccr)];
    default:
      throw new Error('Invalid size');
  }
}
export function mulsOP(size: number, src: number, dest: number, ccr: number): [number, number] {
  // MULS: Signed multiply
  // For 16-bit operands, result is 32-bit (destination register holds result)
  // For 32-bit operands, results in 64-bit (we store low 32 bits in dest)
  let srcSigned: number;
  let destSigned: number;

  if (size === CODE_WORD) {
    // Treat as 16-bit signed values - extract 16 bits and sign-extend
    srcSigned = toSignedWord(src);
    destSigned = toSignedWord(dest);
  } else {
    srcSigned = src | 0;
    destSigned = dest | 0;
  }

  const result = (srcSigned * destSigned) >>> 0;

  // Update CCR based on result
  if (result === 0)
    ccr = (ccr | 0x04) >>> 0; // Z flag
  else ccr = (ccr & 0xfb) >>> 0;

  if ((result | 0) < 0)
    ccr = (ccr | 0x08) >>> 0; // N flag
  else ccr = (ccr & 0xf7) >>> 0;

  ccr = (ccr & 0xfd) >>> 0; // Clear V flag
  ccr = (ccr & 0xfe) >>> 0; // Clear C flag

  return [result, ccr];
}

export function muluOP(size: number, src: number, dest: number, ccr: number): [number, number] {
  let srcUnsigned: number;
  let destUnsigned: number;

  if (size === CODE_WORD) {
    srcUnsigned = src & WORD_MASK;
    destUnsigned = dest & WORD_MASK;
  } else {
    srcUnsigned = src >>> 0;
    destUnsigned = dest >>> 0;
  }

  const result = Math.imul(srcUnsigned, destUnsigned) >>> 0;

  if (result === 0) ccr = (ccr | 0x04) >>> 0;
  else ccr = (ccr & 0xfb) >>> 0;

  if ((result | 0) < 0) ccr = (ccr | 0x08) >>> 0;
  else ccr = (ccr & 0xf7) >>> 0;

  ccr = (ccr & 0xfd) >>> 0;
  ccr = (ccr & 0xfe) >>> 0;

  return [result, ccr];
}

export function divsOP(size: number, src: number, dest: number, ccr: number): [number, number] {
  // DIVS: Signed division
  // Quotient in low word, remainder in high word (for 32-bit result)
  // Returns remainder:quotient in a single 32-bit value

  if (src === 0) {
    // Division by zero - would cause trap in real M68K
    return [dest, ccr];
  }

  let srcSigned: number;
  let destSigned: number;

  if (size === CODE_WORD) {
    // Convert to signed 16-bit divisor
    srcSigned = toSignedWord(src);
    // Dividend is 32-bit signed
    destSigned = dest | 0;
  } else {
    srcSigned = src | 0;
    destSigned = dest | 0;
  }

  // Perform signed division
  const quotient = Math.trunc(destSigned / srcSigned);
  const remainder = destSigned % srcSigned;

  // Pack result: remainder in high word, quotient in low word
  let result = ((remainder & WORD_MASK) << 16) | (quotient & WORD_MASK);
  result = result >>> 0;

  // Update CCR
  if (quotient === 0)
    ccr = (ccr | 0x04) >>> 0; // Z flag
  else ccr = (ccr & 0xfb) >>> 0;

  if (quotient < 0)
    ccr = (ccr | 0x08) >>> 0; // N flag
  else ccr = (ccr & 0xf7) >>> 0;

  ccr = (ccr & 0xfd) >>> 0; // Clear V flag
  ccr = (ccr & 0xfe) >>> 0; // Clear C flag

  return [result, ccr];
}

export function divuOP(size: number, src: number, dest: number, ccr: number): [number, number] {
  if ((src & WORD_MASK) === 0x0) {
    return [dest >>> 0, ccr];
  }

  const divisor = size === CODE_WORD ? src & WORD_MASK : src >>> 0;
  const dividend = dest >>> 0;
  const quotient = Math.trunc(dividend / divisor) & WORD_MASK;
  const remainder = (dividend % divisor) & WORD_MASK;
  const result = (((remainder << 16) >>> 0) | quotient) >>> 0;

  if (quotient === 0) ccr = (ccr | 0x04) >>> 0;
  else ccr = (ccr & 0xfb) >>> 0;

  if ((quotient & 0x8000) !== 0) ccr = (ccr | 0x08) >>> 0;
  else ccr = (ccr & 0xf7) >>> 0;

  ccr = (ccr & 0xfd) >>> 0;
  ccr = (ccr & 0xfe) >>> 0;

  return [result, ccr];
}
