import type { BranchCondition } from '../assembler/encoder';
import type { CpuModel } from '../isa/types';
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
      length: 2 | 4 | 6;
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
  | {
      kind: 'immediate-status';
      length: 2;
      opcode: number;
      operation: 'or' | 'and' | 'eor';
      target: 'ccr' | 'sr';
    }
  | {
      kind: 'memory-shift';
      length: 2;
      opcode: number;
      operation: 'asr' | 'asl' | 'lsr' | 'lsl' | 'ror' | 'rol';
      mode: number;
      register: number;
    }
  | {
      kind: 'link';
      length: 2;
      opcode: number;
      register: number;
    }
  | { kind: 'link-long'; length: 2; opcode: number; register: number }
  | { kind: 'unlk'; length: 2; opcode: number; register: number }
  | {
      kind: 'move-usp';
      length: 2;
      opcode: number;
      direction: 'to-usp' | 'from-usp';
      register: number;
    }
  | { kind: 'rtr'; length: 2; opcode: number }
  | { kind: 'rtd'; length: 2; opcode: number }
  | { kind: 'bkpt'; length: 2; opcode: number; vector: number }
  | {
      kind: 'movec';
      length: 4;
      opcode: number;
      direction: 'control-to-register' | 'register-to-control';
      generalRegister: number;
      controlRegister: number;
    }
  | {
      kind: 'moves';
      length: 4;
      opcode: number;
      direction: 'memory-to-register' | 'register-to-memory';
      size: OperandSize;
      generalRegister: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'move-status';
      length: 2;
      opcode: number;
      direction: 'from-sr' | 'to-ccr' | 'to-sr';
      mode: number;
      register: number;
    }
  | { kind: 'move-from-ccr'; length: 2; opcode: number; mode: number; register: number }
  | {
      kind: 'movep';
      length: 2;
      opcode: number;
      direction: 'memory-to-register' | 'register-to-memory';
      size: 2 | 4;
      dataRegister: number;
      addressRegister: number;
    }
  | {
      kind: 'chk';
      length: 2;
      opcode: number;
      dataRegister: number;
      size: 2 | 4;
      mode: number;
      register: number;
    }
  | { kind: 'extb'; length: 2; opcode: number; register: number }
  | {
      kind: 'trapcc';
      length: 2 | 4 | 6;
      opcode: number;
      condition: number;
      operandBytes: 0 | 2 | 4;
    }
  | {
      kind: 'pack-unpk';
      length: 2;
      opcode: number;
      operation: 'pack' | 'unpk';
      memory: boolean;
      sourceRegister: number;
      destinationRegister: number;
    }
  | {
      kind: 'bitfield';
      length: 4;
      opcode: number;
      operation: 'bftst' | 'bfextu' | 'bfchg' | 'bfexts' | 'bfclr' | 'bfffo' | 'bfset' | 'bfins';
      mode: number;
      register: number;
    }
  | {
      kind: 'cas';
      length: 4;
      opcode: number;
      size: OperandSize;
      mode: number;
      register: number;
    }
  | { kind: 'cas2'; length: 6; opcode: number; size: 2 | 4 }
  | {
      kind: 'chk2-cmp2';
      length: 4;
      opcode: number;
      size: OperandSize;
      mode: number;
      register: number;
    }
  | {
      kind: 'long-multiply-divide';
      length: 4;
      opcode: number;
      operation: 'multiply' | 'divide';
      mode: number;
      register: number;
    }
  | { kind: 'rtm'; length: 2; opcode: number; generalRegister: number }
  | { kind: 'callm'; length: 4; opcode: number; mode: number; register: number }
  | {
      kind: 'coprocessor';
      length: 4;
      opcode: number;
      coprocessorId: number;
      operation: 'branch' | 'decrement-branch' | 'general' | 'restore' | 'save' | 'set-condition' | 'trap-condition';
      mode: number;
      register: number;
    }
  | { kind: 'tas'; length: 2; opcode: number; mode: number; register: number }
  | { kind: 'trapv'; length: 2; opcode: number }
  | {
      kind: 'move';
      length: 2;
      opcode: number;
      size: OperandSize;
      sourceMode: number;
      sourceRegister: number;
      destinationMode: number;
      destinationRegister: number;
    }
  | {
      kind: 'movea';
      length: 2;
      opcode: number;
      size: 2 | 4;
      sourceMode: number;
      sourceRegister: number;
      destinationRegister: number;
    }
  | {
      kind: 'binary-alu';
      length: 2;
      opcode: number;
      operation: 'add' | 'sub' | 'and' | 'or' | 'cmp' | 'eor';
      size: OperandSize;
      direction: 'ea-to-register' | 'register-to-ea';
      dataRegister: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'address-alu';
      length: 2;
      opcode: number;
      operation: 'adda' | 'suba' | 'cmpa';
      size: 2 | 4;
      addressRegister: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'immediate-data';
      length: 2;
      opcode: number;
      operation: 'add' | 'sub' | 'and' | 'or' | 'eor' | 'cmp';
      size: OperandSize;
      mode: number;
      register: number;
    }
  | {
      kind: 'quick';
      length: 2;
      opcode: number;
      operation: 'add' | 'sub';
      size: OperandSize;
      immediate: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'unary';
      length: 2;
      opcode: number;
      operation: 'clr' | 'neg' | 'not' | 'tst';
      size: OperandSize;
      mode: number;
      register: number;
    }
  | {
      kind: 'multiply-divide';
      length: 2;
      opcode: number;
      operation: 'mulu' | 'muls' | 'divu' | 'divs';
      dataRegister: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'control-ea';
      length: 2;
      opcode: number;
      operation: 'jmp' | 'jsr' | 'lea';
      addressRegister?: number;
      mode: number;
      register: number;
    }
  | {
      kind: 'movem';
      length: 2;
      opcode: number;
      direction: 'registers-to-memory' | 'memory-to-registers';
      size: 2 | 4;
      mode: number;
      register: number;
    }
  | {
      kind: 'exg';
      length: 2;
      opcode: number;
      registerKind: 'data-data' | 'address-address' | 'data-address';
      sourceRegister: number;
      destinationRegister: number;
    }
  | {
      kind: 'ext';
      length: 2;
      opcode: number;
      size: 2 | 4;
      register: number;
    }
  | { kind: 'swap'; length: 2; opcode: number; register: number }
  | {
      kind: 'register-shift';
      length: 2;
      opcode: number;
      operation: 'asr' | 'asl' | 'lsr' | 'lsl' | 'ror' | 'rol';
      size: OperandSize;
      count: { kind: 'immediate'; value: number } | { kind: 'register'; register: number };
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

const IMMEDIATE_STATUS_INSTRUCTIONS: ReadonlyMap<
  number,
  { operation: 'or' | 'and' | 'eor'; target: 'ccr' | 'sr' }
> = new Map([
  [0x003c, { operation: 'or', target: 'ccr' }],
  [0x007c, { operation: 'or', target: 'sr' }],
  [0x023c, { operation: 'and', target: 'ccr' }],
  [0x027c, { operation: 'and', target: 'sr' }],
  [0x0a3c, { operation: 'eor', target: 'ccr' }],
  [0x0a7c, { operation: 'eor', target: 'sr' }],
]);

function readWord(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length) {
    throw new RangeError(`Cannot read instruction word at byte offset ${offset}`);
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readLong(bytes: Uint8Array, offset: number): number {
  return ((readWord(bytes, offset) << 16) | readWord(bytes, offset + 2)) | 0;
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

export function decodeBinaryInstruction(
  bytes: Uint8Array,
  offset = 0,
  cpuModel: CpuModel = 'm68000'
): DecodedBinaryInstruction {
  const opcode = readWord(bytes, offset);

  if (cpuModel === 'm68020') {
    if ((opcode & 0xfff8) === 0x4808) {
      return { kind: 'link-long', length: 2, opcode, register: opcode & 0x7 };
    }
    if ((opcode & 0xfff8) === 0x49c0) {
      return { kind: 'extb', length: 2, opcode, register: opcode & 0x7 };
    }
    if ((opcode & 0xfff0) === 0x06c0) {
      return { kind: 'rtm', length: 2, opcode, generalRegister: opcode & 0xf };
    }
    if ((opcode & 0xffc0) === 0x06c0) {
      return {
        kind: 'callm', length: 4, opcode,
        mode: (opcode >>> 3) & 0x7, register: opcode & 0x7,
      };
    }
    if (opcode === 0x0cfc || opcode === 0x0efc) {
      return { kind: 'cas2', length: 6, opcode, size: opcode === 0x0cfc ? 2 : 4 };
    }
    for (const [base, size] of [[0x0ac0, 1], [0x0cc0, 2], [0x0ec0, 4]] as const) {
      if ((opcode & 0xffc0) === base) {
        return { kind: 'cas', length: 4, opcode, size, mode: (opcode >>> 3) & 7, register: opcode & 7 };
      }
    }
    if ((opcode & 0xf8c0) === 0xe8c0) {
      const operations = ['bftst', 'bfextu', 'bfchg', 'bfexts', 'bfclr', 'bfffo', 'bfset', 'bfins'] as const;
      return {
        kind: 'bitfield', length: 4, opcode,
        operation: operations[(opcode >>> 8) & 7], mode: (opcode >>> 3) & 7, register: opcode & 7,
      };
    }
    for (const [base, operation, memory] of [
      [0x8140, 'pack', false], [0x8148, 'pack', true],
      [0x8180, 'unpk', false], [0x8188, 'unpk', true],
    ] as const) {
      if ((opcode & 0xf1f8) === base) {
        return { kind: 'pack-unpk', length: 2, opcode, operation, memory,
          sourceRegister: opcode & 7, destinationRegister: (opcode >>> 9) & 7 };
      }
    }
    if ((opcode & 0xf1c0) === 0x00c0) {
      const sizeCode = (opcode >>> 9) & 3;
      const size = sizeCode === 0 ? 1 : sizeCode === 1 ? 2 : sizeCode === 2 ? 4 : undefined;
      if (size !== undefined) return { kind: 'chk2-cmp2', length: 4, opcode, size, mode: (opcode >>> 3) & 7, register: opcode & 7 };
    }
    if ((opcode & 0xffc0) === 0x4c00 || (opcode & 0xffc0) === 0x4c40) {
      return { kind: 'long-multiply-divide', length: 4, opcode,
        operation: (opcode & 0x0040) === 0 ? 'multiply' : 'divide', mode: (opcode >>> 3) & 7, register: opcode & 7 };
    }
    if ((opcode & 0xf0ff) === 0x50fc || (opcode & 0xf0ff) === 0x50fa || (opcode & 0xf0ff) === 0x50fb) {
      const suffix = opcode & 0xff;
      const operandBytes = suffix === 0xfc ? 0 : suffix === 0xfa ? 2 : 4;
      return { kind: 'trapcc', length: (2 + operandBytes) as 2 | 4 | 6, opcode,
        condition: (opcode >>> 8) & 0xf, operandBytes };
    }
    if ((opcode & 0xf000) === 0xf000) {
      const coprocessorId = (opcode >>> 9) & 7;
      const group = (opcode >>> 6) & 7;
      const operation = group === 2 ? 'branch' : group === 3 ? 'branch' : group === 0 ? 'general'
        : group === 5 ? 'restore' : group === 4 ? 'save'
          : (opcode & 0x0038) === 0x0038 ? 'trap-condition'
            : (opcode & 0x0038) === 0x0008 ? 'decrement-branch' : 'set-condition';
      return { kind: 'coprocessor', length: 4, opcode, coprocessorId, operation,
        mode: (opcode >>> 3) & 7, register: opcode & 7 };
    }
  }

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
    case 0x4e76:
      return { kind: 'trapv', length: 2, opcode };
    case 0x4e77:
      return { kind: 'rtr', length: 2, opcode };
    case 0x4e74:
      return { kind: 'rtd', length: 2, opcode };
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

  const immediateStatus = IMMEDIATE_STATUS_INSTRUCTIONS.get(opcode);
  if (immediateStatus) {
    return { kind: 'immediate-status', length: 2, opcode, ...immediateStatus };
  }

  if ((opcode & 0xfff8) === 0x4e50) {
    return { kind: 'link', length: 2, opcode, register: opcode & 0x7 };
  }

  if ((opcode & 0xfff8) === 0x4848) {
    return { kind: 'bkpt', length: 2, opcode, vector: opcode & 0x7 };
  }

  if ((opcode & 0xfffe) === 0x4e7a) {
    const extension = readWord(bytes, offset + 2);
    return {
      kind: 'movec',
      length: 4,
      opcode,
      direction: (opcode & 1) === 0 ? 'control-to-register' : 'register-to-control',
      generalRegister: (extension >>> 12) & 0xf,
      controlRegister: extension & 0x0fff,
    };
  }

  if ((opcode & 0xff00) === 0x0e00) {
    const size = decodeOperandSize((opcode >>> 6) & 0x3);
    if (size !== undefined) {
      const extension = readWord(bytes, offset + 2);
      return {
        kind: 'moves',
        length: 4,
        opcode,
        direction: (extension & 0x0800) !== 0 ? 'register-to-memory' : 'memory-to-register',
        size,
        generalRegister: (extension >>> 12) & 0xf,
        mode: (opcode >>> 3) & 0x7,
        register: opcode & 0x7,
      };
    }
  }

  if ((opcode & 0xfff8) === 0x4e58) {
    return { kind: 'unlk', length: 2, opcode, register: opcode & 0x7 };
  }

  if ((opcode & 0xfff0) === 0x4e60) {
    return {
      kind: 'move-usp',
      length: 2,
      opcode,
      direction: (opcode & 0x0008) !== 0 ? 'from-usp' : 'to-usp',
      register: opcode & 0x7,
    };
  }

  for (const [maskValue, direction] of [
    [0x40c0, 'from-sr'],
    [0x44c0, 'to-ccr'],
    [0x46c0, 'to-sr'],
  ] as const) {
    if ((opcode & 0xffc0) === maskValue) {
      return {
        kind: 'move-status',
        length: 2,
        opcode,
        direction,
        mode: (opcode >>> 3) & 0x7,
        register: opcode & 0x7,
      };
    }
  }

  if ((opcode & 0xffc0) === 0x42c0) {
    return {
      kind: 'move-from-ccr',
      length: 2,
      opcode,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xf138) === 0x0108) {
    const operationMode = (opcode >>> 6) & 0x3;
    return {
      kind: 'movep',
      length: 2,
      opcode,
      direction: operationMode < 2 ? 'memory-to-register' : 'register-to-memory',
      size: (operationMode & 1) === 0 ? 2 : 4,
      dataRegister: (opcode >>> 9) & 0x7,
      addressRegister: opcode & 0x7,
    };
  }

  if ((opcode & 0xf1c0) === 0x4180 || (cpuModel === 'm68020' && (opcode & 0xf1c0) === 0x4100)) {
    return {
      kind: 'chk',
      length: 2,
      opcode,
      dataRegister: (opcode >>> 9) & 0x7,
      size: (opcode & 0x0080) !== 0 ? 2 : 4,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xffc0) === 0x4ac0) {
    return {
      kind: 'tas',
      length: 2,
      opcode,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
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

  if ((opcode & 0xf0c0) === 0xe0c0) {
    const operationGroup = (opcode >>> 9) & 0x3;
    if (operationGroup !== 2) {
      const direction = (opcode & 0x0100) !== 0 ? 'l' : 'r';
      const operationPrefix = operationGroup === 0 ? 'as' : operationGroup === 1 ? 'ls' : 'ro';
      return {
        kind: 'memory-shift',
        length: 2,
        opcode,
        operation: `${operationPrefix}${direction}` as
          'asr' | 'asl' | 'lsr' | 'lsl' | 'ror' | 'rol',
        mode: (opcode >>> 3) & 0x7,
        register: opcode & 0x7,
      };
    }
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
    if (shortDisplacement === 0xff && cpuModel === 'm68020') {
      return {
        kind: 'branch',
        length: 6,
        opcode,
        condition,
        displacement: readLong(bytes, offset + 2),
      };
    }
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

  const moveSize =
    (opcode & 0xf000) === 0x1000
      ? 1
      : (opcode & 0xf000) === 0x2000
        ? 4
        : (opcode & 0xf000) === 0x3000
          ? 2
          : undefined;
  if (moveSize !== undefined) {
    const destinationMode = (opcode >>> 6) & 0x7;
    const destinationRegister = (opcode >>> 9) & 0x7;
    if (destinationMode === 1 && moveSize !== 1) {
      return {
        kind: 'movea',
        length: 2,
        opcode,
        size: moveSize,
        sourceMode: (opcode >>> 3) & 0x7,
        sourceRegister: opcode & 0x7,
        destinationRegister,
      };
    }
    return {
      kind: 'move',
      length: 2,
      opcode,
      size: moveSize,
      sourceMode: (opcode >>> 3) & 0x7,
      sourceRegister: opcode & 0x7,
      destinationMode,
      destinationRegister,
    };
  }

  for (const [maskValue, operation] of [
    [0x0000, 'or'],
    [0x0200, 'and'],
    [0x0400, 'sub'],
    [0x0600, 'add'],
    [0x0a00, 'eor'],
    [0x0c00, 'cmp'],
  ] as const) {
    if ((opcode & 0xff00) === maskValue) {
      const size = decodeOperandSize((opcode >>> 6) & 0x3);
      if (size !== undefined) {
        return {
          kind: 'immediate-data',
          length: 2,
          opcode,
          operation,
          size,
          mode: (opcode >>> 3) & 0x7,
          register: opcode & 0x7,
        };
      }
    }
  }

  if ((opcode & 0xf000) === 0x5000) {
    const size = decodeOperandSize((opcode >>> 6) & 0x3);
    if (size !== undefined) {
      return {
        kind: 'quick',
        length: 2,
        opcode,
        operation: (opcode & 0x0100) !== 0 ? 'sub' : 'add',
        size,
        immediate: (opcode >>> 9) & 0x7 || 8,
        mode: (opcode >>> 3) & 0x7,
        register: opcode & 0x7,
      };
    }
  }

  if ((opcode & 0xfff8) === 0x4840) {
    return { kind: 'swap', length: 2, opcode, register: opcode & 0x7 };
  }
  if ((opcode & 0xfff8) === 0x4880 || (opcode & 0xfff8) === 0x48c0) {
    return {
      kind: 'ext',
      length: 2,
      opcode,
      size: (opcode & 0x0040) !== 0 ? 4 : 2,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xfb80) === 0x4880) {
    return {
      kind: 'movem',
      length: 2,
      opcode,
      direction: (opcode & 0x0400) !== 0 ? 'memory-to-registers' : 'registers-to-memory',
      size: (opcode & 0x0040) !== 0 ? 4 : 2,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  if ((opcode & 0xffc0) === 0x4e80 || (opcode & 0xffc0) === 0x4ec0) {
    return {
      kind: 'control-ea',
      length: 2,
      opcode,
      operation: (opcode & 0x0040) !== 0 ? 'jmp' : 'jsr',
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }
  if ((opcode & 0xf1c0) === 0x41c0) {
    return {
      kind: 'control-ea',
      length: 2,
      opcode,
      operation: 'lea',
      addressRegister: (opcode >>> 9) & 0x7,
      mode: (opcode >>> 3) & 0x7,
      register: opcode & 0x7,
    };
  }

  for (const [maskValue, operation] of [
    [0x4200, 'clr'],
    [0x4400, 'neg'],
    [0x4600, 'not'],
    [0x4a00, 'tst'],
  ] as const) {
    if ((opcode & 0xff00) === maskValue) {
      const size = decodeOperandSize((opcode >>> 6) & 0x3);
      if (size !== undefined) {
        return {
          kind: 'unary',
          length: 2,
          opcode,
          operation,
          size,
          mode: (opcode >>> 3) & 0x7,
          register: opcode & 0x7,
        };
      }
    }
  }

  for (const [maskValue, registerKind] of [
    [0xc140, 'data-data'],
    [0xc148, 'address-address'],
    [0xc188, 'data-address'],
  ] as const) {
    if ((opcode & 0xf1f8) === maskValue) {
      return {
        kind: 'exg',
        length: 2,
        opcode,
        registerKind,
        sourceRegister: (opcode >>> 9) & 0x7,
        destinationRegister: opcode & 0x7,
      };
    }
  }

  const group = opcode >>> 12;
  const groupOperation =
    group === 0x8
      ? 'or'
      : group === 0x9
        ? 'sub'
        : group === 0xb
          ? 'cmp'
          : group === 0xc
            ? 'and'
            : group === 0xd
              ? 'add'
              : undefined;
  if (groupOperation !== undefined) {
    const operationMode = (opcode >>> 6) & 0x7;
    const dataRegister = (opcode >>> 9) & 0x7;
    const mode = (opcode >>> 3) & 0x7;
    const register = opcode & 0x7;

    if (
      (group === 0x9 || group === 0xb || group === 0xd) &&
      (operationMode === 3 || operationMode === 7)
    ) {
      return {
        kind: 'address-alu',
        length: 2,
        opcode,
        operation: group === 0x9 ? 'suba' : group === 0xb ? 'cmpa' : 'adda',
        size: operationMode === 3 ? 2 : 4,
        addressRegister: dataRegister,
        mode,
        register,
      };
    }

    if ((group === 0x8 || group === 0xc) && (operationMode === 3 || operationMode === 7)) {
      return {
        kind: 'multiply-divide',
        length: 2,
        opcode,
        operation:
          group === 0x8
            ? operationMode === 3
              ? 'divu'
              : 'divs'
            : operationMode === 3
              ? 'mulu'
              : 'muls',
        dataRegister,
        mode,
        register,
      };
    }

    const sizeCode = operationMode & 0x3;
    const size = decodeOperandSize(sizeCode);
    if (size !== undefined && operationMode !== 3 && operationMode !== 7) {
      return {
        kind: 'binary-alu',
        length: 2,
        opcode,
        operation: group === 0xb && operationMode >= 4 ? 'eor' : groupOperation,
        size,
        direction: operationMode >= 4 ? 'register-to-ea' : 'ea-to-register',
        dataRegister,
        mode,
        register,
      };
    }
  }

  if ((opcode & 0xf000) === 0xe000 && ((opcode >>> 6) & 0x3) !== 3) {
    const size = decodeOperandSize((opcode >>> 6) & 0x3);
    const kind = (opcode >>> 3) & 0x3;
    if (size !== undefined && kind !== 2) {
      const direction = (opcode & 0x0100) !== 0 ? 'l' : 'r';
      const operation =
        kind === 0
          ? (`as${direction}` as const)
          : kind === 1
            ? (`ls${direction}` as const)
            : (`ro${direction}` as const);
      const registerCount = (opcode & 0x0020) !== 0;
      return {
        kind: 'register-shift',
        length: 2,
        opcode,
        operation,
        size,
        count: registerCount
          ? { kind: 'register', register: (opcode >>> 9) & 0x7 }
          : { kind: 'immediate', value: (opcode >>> 9) & 0x7 || 8 },
        register: opcode & 0x7,
      };
    }
  }

  return {
    kind: 'unimplemented',
    length: 2,
    opcode,
  };
}
