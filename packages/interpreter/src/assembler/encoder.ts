export type BranchCondition =
  | 'bra'
  | 'bsr'
  | 'hi'
  | 'ls'
  | 'cc'
  | 'cs'
  | 'ne'
  | 'eq'
  | 'vc'
  | 'vs'
  | 'pl'
  | 'mi'
  | 'ge'
  | 'lt'
  | 'gt'
  | 'le';

const BRANCH_CONDITION_CODE: Record<BranchCondition, number> = {
  bra: 0x0,
  bsr: 0x1,
  hi: 0x2,
  ls: 0x3,
  cc: 0x4,
  cs: 0x5,
  ne: 0x6,
  eq: 0x7,
  vc: 0x8,
  vs: 0x9,
  pl: 0xa,
  mi: 0xb,
  ge: 0xc,
  lt: 0xd,
  gt: 0xe,
  le: 0xf,
};

function word(value: number): Uint8Array {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

export function encodeNop(): Uint8Array {
  return word(0x4e71);
}

export function encodeRts(): Uint8Array {
  return word(0x4e75);
}

export function encodeRte(): Uint8Array {
  return word(0x4e73);
}

export function encodeIllegal(): Uint8Array {
  return word(0x4afc);
}

export function encodeReset(): Uint8Array {
  return word(0x4e70);
}

export function encodeTrap(vector: number): Uint8Array {
  if (!Number.isInteger(vector) || vector < 0 || vector > 15) {
    throw new RangeError(`TRAP vector must be an integer from 0 through 15: ${vector}`);
  }
  return word(0x4e40 | vector);
}

export function encodeStop(statusRegister: number): Uint8Array {
  const opcode = word(0x4e72);
  const immediate = word(statusRegister & 0xffff);
  return Uint8Array.of(...opcode, ...immediate);
}

export function encodeMoveq(register: number, immediate: number): Uint8Array {
  if (!Number.isInteger(register) || register < 0 || register > 7) {
    throw new RangeError(`MOVEQ register must be D0 through D7: ${register}`);
  }
  if (!Number.isInteger(immediate) || immediate < -128 || immediate > 127) {
    throw new RangeError(`MOVEQ immediate must fit a signed byte: ${immediate}`);
  }

  return word(0x7000 | (register << 9) | (immediate & 0xff));
}

export function encodeBranch(condition: BranchCondition, displacement: number): Uint8Array {
  if (!Number.isInteger(displacement) || displacement < -32768 || displacement > 32767) {
    throw new RangeError(`MC68000 branch displacement must fit a signed word: ${displacement}`);
  }

  const opcode = 0x6000 | (BRANCH_CONDITION_CODE[condition] << 8);
  if (displacement !== 0 && displacement >= -128 && displacement <= 127) {
    return word(opcode | (displacement & 0xff));
  }

  return Uint8Array.of(...word(opcode), ...word(displacement & 0xffff));
}
