import type { BranchCondition } from '../assembler/encoder';
import type { OperandSize } from './alu';

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
  | { kind: 'pea'; length: 2; opcode: number; mode: number; register: number }
  | {
      kind: 'dbcc';
      length: 2;
      opcode: number;
      condition: number;
      register: number;
    }
  | {
      kind: 'scc';
      length: 2;
      opcode: number;
      condition: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'bit';
      length: 2;
      opcode: number;
      operation: 'btst' | 'bchg' | 'bclr' | 'bset';
      source: { kind: 'register'; register: number } | { kind: 'immediate' };
      mode: number;
      register: number;
    }
  | {
      kind: 'extend-arithmetic';
      length: 2;
      opcode: number;
      operation: 'addx' | 'subx';
      size: OperandSize;
      memory: boolean;
      sourceRegister: number;
      destinationRegister: number;
    }
  | {
      kind: 'bcd';
      length: 2;
      opcode: number;
      operation: 'abcd' | 'sbcd';
      memory: boolean;
      sourceRegister: number;
      destinationRegister: number;
    }
  | {
      kind: 'unary-extend';
      length: 2;
      opcode: number;
      operation: 'negx' | 'nbcd';
      size: OperandSize;
      mode: number;
      register: number;
    }
  | {
      kind: 'cmpm';
      length: 2;
      opcode: number;
      size: OperandSize;
      sourceRegister: number;
      destinationRegister: number;
    }
  | {
      kind: 'rotate-extend';
      length: 2;
      opcode: number;
      direction: 'left' | 'right';
      size: OperandSize;
      memory: boolean;
      count: { kind: 'immediate'; value: number } | { kind: 'register'; register: number };
      mode: number;
      register: number;
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

function decodeOperandSize(code: number): OperandSize | undefined {
  if (code === 0) return 1;
  if (code === 1) return 2;
  if (code === 2) return 4;
  return undefined;
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

  if ((opcode & 0xffc0) === 0x4840 && ((opcode >>> 3) & 0x7) !== 0) {
    return {
      kind: 'pea',
      length: 2,
      opcode,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xff00) === 0x4000) {
    const size = decodeOperandSize((opcode >>> 6) & 0x3);
    if (size !== undefined) {
      return {
        kind: 'unary-extend',
        length: 2,
        opcode,
        operation: 'negx',
        size,
        mode: (opcode >>> 3) & 0x7,
        register: opcode & 0x7,
      };
    }
  }

  if ((opcode & 0xffc0) === 0x4800) {
    return {
      kind: 'unary-extend',
      length: 2,
      opcode,
      operation: 'nbcd',
      size: 1,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  for (const [maskValue, operation] of [
    [0xd100, 'addx'],
    [0x9100, 'subx'],
  ] as const) {
    if ((opcode & 0xf130) === maskValue) {
      const size = decodeOperandSize((opcode >>> 6) & 0x3);
      if (size !== undefined) {
        return {
          kind: 'extend-arithmetic',
          length: 2,
          opcode,
          operation,
          size,
          memory: (opcode & 0x0008) !== 0,
          sourceRegister: opcode & 0x7,
          destinationRegister: (opcode >>> 9) & 0x7,
        };
      }
    }
  }

  for (const [maskValue, operation] of [
    [0xc100, 'abcd'],
    [0x8100, 'sbcd'],
  ] as const) {
    if ((opcode & 0xf1f0) === maskValue) {
      return {
        kind: 'bcd',
        length: 2,
        opcode,
        operation,
        memory: (opcode & 0x0008) !== 0,
        sourceRegister: opcode & 0x7,
        destinationRegister: (opcode >>> 9) & 0x7,
      };
    }
  }

  if ((opcode & 0xf138) === 0xb108) {
    const size = decodeOperandSize((opcode >>> 6) & 0x3);
    if (size !== undefined) {
      return {
        kind: 'cmpm',
        length: 2,
        opcode,
        size,
        sourceRegister: opcode & 0x7,
        destinationRegister: (opcode >>> 9) & 0x7,
      };
    }
  }

  if ((opcode & 0xfec0) === 0xe4c0) {
    return {
      kind: 'rotate-extend',
      length: 2,
      opcode,
      direction: (opcode & 0x0100) !== 0 ? 'left' : 'right',
      size: 2,
      memory: true,
      count: { kind: 'immediate', value: 1 },
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xf018) === 0xe010 && ((opcode >>> 3) & 0x3) === 2) {
    const size = decodeOperandSize((opcode >>> 6) & 0x3);
    if (size !== undefined) {
      const registerCount = (opcode & 0x0020) !== 0;
      return {
        kind: 'rotate-extend',
        length: 2,
        opcode,
        direction: (opcode & 0x0100) !== 0 ? 'left' : 'right',
        size,
        memory: false,
        count: registerCount
          ? { kind: 'register', register: (opcode >>> 9) & 0x7 }
          : { kind: 'immediate', value: (opcode >>> 9) & 0x7 || 8 },
        mode: 0,
        register: opcode & 0x7,
      };
    }
  }

  if ((opcode & 0xf0f8) === 0x50c8) {
    return {
      kind: 'dbcc',
      length: 2,
      opcode,
      condition: (opcode >>> 8) & 0x0f,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xf0c0) === 0x50c0) {
    return {
      kind: 'scc',
      length: 2,
      opcode,
      condition: (opcode >>> 8) & 0x0f,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  const bitOperation = ['btst', 'bchg', 'bclr', 'bset'] as const;
  if ((opcode & 0xf100) === 0x0100 && ((opcode >>> 3) & 0x7) !== 1) {
    return {
      kind: 'bit',
      length: 2,
      opcode,
      operation: bitOperation[(opcode >>> 6) & 0x3],
      source: { kind: 'register', register: (opcode >>> 9) & 0x7 },
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xff00) === 0x0800) {
    return {
      kind: 'bit',
      length: 2,
      opcode,
      operation: bitOperation[(opcode >>> 6) & 0x3],
      source: { kind: 'immediate' },
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
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
