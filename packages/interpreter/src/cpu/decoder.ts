import type { BranchCondition } from '../assembler/encoder';

export type DecodedBinaryInstruction =
  | { kind: 'nop'; length: 2; opcode: number }
  | { kind: 'rts'; length: 2; opcode: number }
  | { kind: 'rte'; length: 2; opcode: number }
  | { kind: 'illegal'; length: 2; opcode: number }
  | { kind: 'reset'; length: 2; opcode: number }
  | { kind: 'stop'; length: 4; opcode: number; statusRegister: number }
  | { kind: 'trap'; length: 2; opcode: number; vector: number }
  | {
      kind: 'moveq';
      length: 2;
      opcode: number;
      register: number;
      immediate: number;
    }
  | {
      kind: 'branch';
      length: 2 | 4;
      opcode: number;
      condition: BranchCondition;
      displacement: number;
    }
  | { kind: 'unimplemented'; length: 2; opcode: number };

const BRANCH_CONDITION: readonly BranchCondition[] = [
  'bra',
  'bsr',
  'hi',
  'ls',
  'cc',
  'cs',
  'ne',
  'eq',
  'vc',
  'vs',
  'pl',
  'mi',
  'ge',
  'lt',
  'gt',
  'le',
];

function readWord(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length) {
    throw new RangeError(`Cannot read instruction word at byte offset ${offset}`);
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function signExtendByte(value: number): number {
  return (value << 24) >> 24;
}

function signExtendWord(value: number): number {
  return (value << 16) >> 16;
}

export function decodeBinaryInstruction(bytes: Uint8Array, offset = 0): DecodedBinaryInstruction {
  const opcode = readWord(bytes, offset);

  switch (opcode) {
    case 0x4e71:
      return { kind: 'nop', length: 2, opcode };
    case 0x4e75:
      return { kind: 'rts', length: 2, opcode };
    case 0x4e73:
      return { kind: 'rte', length: 2, opcode };
    case 0x4afc:
      return { kind: 'illegal', length: 2, opcode };
    case 0x4e70:
      return { kind: 'reset', length: 2, opcode };
    case 0x4e72:
      return {
        kind: 'stop',
        length: 4,
        opcode,
        statusRegister: readWord(bytes, offset + 2),
      };
    default:
      break;
  }

  if ((opcode & 0xfff0) === 0x4e40) {
    return {
      kind: 'trap',
      length: 2,
      opcode,
      vector: opcode & 0x0f,
    };
  }

  if ((opcode & 0xf100) === 0x7000) {
    return {
      kind: 'moveq',
      length: 2,
      opcode,
      register: (opcode >>> 9) & 0x7,
      immediate: signExtendByte(opcode & 0xff),
    };
  }

  if ((opcode & 0xf000) === 0x6000) {
    const condition = BRANCH_CONDITION[(opcode >>> 8) & 0x0f];
    const shortDisplacement = opcode & 0xff;
    if (shortDisplacement === 0) {
      return {
        kind: 'branch',
        length: 4,
        opcode,
        condition,
        displacement: signExtendWord(readWord(bytes, offset + 2)),
      };
    }
    return {
      kind: 'branch',
      length: 2,
      opcode,
      condition,
      displacement: signExtendByte(shortDisplacement),
    };
  }

  return {
    kind: 'unimplemented',
    length: 2,
    opcode,
  };
}
