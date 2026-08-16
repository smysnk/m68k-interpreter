import {
  type DecodedInstruction,
  type DecodedOperand,
  resolveDecodedInstruction,
} from '../instructionDecoder';
import { CODE_BYTE, CODE_LONG, CODE_WORD } from '../core/operations';
import { encodeIndexedExtension } from '../cpu/effectiveAddressCodec';

const TOKEN_IMMEDIATE = 0;
const TOKEN_OFFSET = 1;
const TOKEN_REG_ADDR = 2;
const TOKEN_REG_DATA = 3;
const TOKEN_OFFSET_ADDR = 4;
const TOKEN_LABEL = 5;
const TOKEN_REGISTER_LIST = 6;

interface EncodedEa {
  bits: number;
  extensions: number[];
}

const CONDITION_CODE: Record<string, number> = {
  bra: 0,
  bsr: 1,
  bhi: 2,
  bls: 3,
  bcc: 4,
  bhs: 4,
  bcs: 5,
  blo: 5,
  bne: 6,
  beq: 7,
  bvc: 8,
  bvs: 9,
  bpl: 10,
  bmi: 11,
  bge: 12,
  blt: 13,
  bgt: 14,
  ble: 15,
};

function wordsToBytes(words: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(words.length * 2);
  words.forEach((value, index) => {
    bytes[index * 2] = (value >>> 8) & 0xff;
    bytes[index * 2 + 1] = value & 0xff;
  });
  return bytes;
}

function immediateWords(value: number, size: number): number[] {
  return size === CODE_LONG ? [(value >>> 16) & 0xffff, value & 0xffff] : [value & 0xffff];
}

function encodeEa(operand: DecodedOperand, size: number): EncodedEa {
  switch (operand.type) {
    case TOKEN_REG_DATA:
      return { bits: operand.value - 8, extensions: [] };
    case TOKEN_REG_ADDR:
      return { bits: 0x08 | operand.value, extensions: [] };
    case TOKEN_OFFSET_ADDR: {
      if (operand.fullIndex !== undefined) {
        return {
          bits: operand.pcRelative ? 0x3b : 0x30 | operand.value,
          extensions: [...encodeIndexedExtension(operand.fullIndex)],
        };
      }
      if (operand.preDecrement) return { bits: 0x20 | operand.value, extensions: [] };
      if (operand.postIncrement) return { bits: 0x18 | operand.value, extensions: [] };
      if (operand.indexRegister !== undefined) {
        const addressIndex = operand.indexRegister < 8;
        const register = addressIndex ? operand.indexRegister : operand.indexRegister - 8;
        const extension =
          (addressIndex ? 0x8000 : 0) |
          (register << 12) |
          (operand.indexSize === CODE_LONG ? 0x0800 : 0) |
          (Math.log2(operand.indexScale ?? 1) << 9) |
          ((operand.offset ?? 0) & 0xff);
        return {
          bits: operand.pcRelative ? 0x3b : 0x30 | operand.value,
          extensions: [extension],
        };
      }
      if ((operand.offset ?? 0) !== 0) {
        return {
          bits: operand.pcRelative ? 0x3a : 0x28 | operand.value,
          extensions: [(operand.offset ?? 0) & 0xffff],
        };
      }
      return { bits: 0x10 | operand.value, extensions: [] };
    }
    case TOKEN_IMMEDIATE:
      return { bits: 0x3c, extensions: immediateWords(operand.value, size) };
    case TOKEN_OFFSET:
    case TOKEN_LABEL:
      return {
        bits: 0x39,
        extensions: [(operand.value >>> 16) & 0xffff, operand.value & 0xffff],
      };
    default:
      throw new Error(`Operand type ${operand.type} is not an effective address`);
  }
}

function dataRegister(operand: DecodedOperand): number {
  if (operand.type !== TOKEN_REG_DATA) throw new Error('Expected a data register');
  return operand.value - 8;
}

function addressRegister(operand: DecodedOperand): number {
  if (operand.type !== TOKEN_REG_ADDR) throw new Error('Expected an address register');
  return operand.value;
}

function generalRegister(operand: DecodedOperand): number {
  if (operand.type === TOKEN_REG_DATA) return operand.value - 8;
  if (operand.type === TOKEN_REG_ADDR) return operand.value + 8;
  throw new Error('Expected a data or address register');
}

function controlRegisterSelector(token: string): number {
  switch (token.trim().toLowerCase()) {
    case 'sfc':
      return 0x000;
    case 'dfc':
      return 0x001;
    case 'usp':
      return 0x800;
    case 'vbr':
      return 0x801;
    case 'cacr':
      return 0x002;
    case 'caar':
      return 0x802;
    case 'msp':
      return 0x803;
    case 'isp':
      return 0x804;
    default:
      throw new Error(`Unknown MC68010 control register: ${token}`);
  }
}

function sizeCode(size: number): number {
  if (size === CODE_BYTE) return 0;
  if (size === CODE_WORD) return 1;
  if (size === CODE_LONG) return 2;
  throw new Error(`Unsupported operand size ${size}`);
}

function resolvedOperands(
  instruction: DecodedInstruction,
  symbols: Record<string, number>
): DecodedInstruction {
  const resolved = resolveDecodedInstruction(instruction, symbols);
  if (
    resolved.decodeErrors.length > 0 ||
    resolved.operands.length !== resolved.operandTokens.length
  ) {
    throw new Error(
      `Cannot encode line ${instruction.line}: ${resolved.decodeErrors.join(', ') || instruction.raw}`
    );
  }
  return resolved;
}

export function encodeSourceInstruction(
  sourceInstruction: DecodedInstruction,
  symbols: Record<string, number>,
  address: number
): Uint8Array {
  const instruction = resolvedOperands(sourceInstruction, symbols);
  const op = instruction.operation;
  const operands = instruction.operands;
  const size = instruction.size;
  const fixed: Record<string, number> = {
    nop: 0x4e71,
    reset: 0x4e70,
    rte: 0x4e73,
    rts: 0x4e75,
    trapv: 0x4e76,
    rtr: 0x4e77,
    illegal: 0x4afc,
  };
  if (fixed[op] !== undefined) return wordsToBytes([fixed[op]]);

  if (op === 'stop' || op === 'rtd' || op === 'link') {
    if (op === 'link' && size === CODE_LONG) {
      const immediate = operands[1].value >>> 0;
      return wordsToBytes([
        0x4808 | addressRegister(operands[0]),
        immediate >>> 16,
        immediate,
      ]);
    }
    const opcode =
      op === 'stop' ? 0x4e72 : op === 'rtd' ? 0x4e74 : 0x4e50 | addressRegister(operands[0]);
    const immediate = operands[op === 'link' ? 1 : 0];
    return wordsToBytes([opcode, immediate.value]);
  }
  if (op === 'unlk') return wordsToBytes([0x4e58 | addressRegister(operands[0])]);
  if (op === 'trap') return wordsToBytes([0x4e40 | (operands[0].value & 0xf)]);
  if (op === 'bkpt') {
    if (operands.length !== 1 || operands[0].value < 0 || operands[0].value > 7) {
      throw new Error('BKPT requires a vector from 0 through 7');
    }
    return wordsToBytes([0x4848 | operands[0].value]);
  }
  if (op === 'movec') {
    if (operands.length !== 2) throw new Error('MOVEC requires two operands');
    const sourceControl = ['sfc', 'dfc', 'usp', 'vbr', 'cacr', 'caar', 'msp', 'isp'].includes(
      instruction.operandTokens[0]?.trim().toLowerCase()
    );
    const controlToken = instruction.operandTokens[sourceControl ? 0 : 1];
    const register = operands[sourceControl ? 1 : 0];
    const extension = (generalRegister(register) << 12) | controlRegisterSelector(controlToken);
    return wordsToBytes([sourceControl ? 0x4e7a : 0x4e7b, extension]);
  }
  if (op === 'moves') {
    if (operands.length !== 2) throw new Error('MOVES requires two operands');
    const firstIsRegister =
      operands[0].type === TOKEN_REG_DATA || operands[0].type === TOKEN_REG_ADDR;
    const secondIsRegister =
      operands[1].type === TOKEN_REG_DATA || operands[1].type === TOKEN_REG_ADDR;
    if (firstIsRegister === secondIsRegister) {
      throw new Error('MOVES requires one general register and one memory operand');
    }
    const register = firstIsRegister ? operands[0] : operands[1];
    const memory = firstIsRegister ? operands[1] : operands[0];
    const ea = encodeEa(memory, size);
    if (![2, 3, 4, 5, 6, 7].includes(ea.bits >>> 3) || (ea.bits >>> 3 === 7 && (ea.bits & 7) > 1)) {
      throw new Error('MOVES requires a memory-alterable effective address');
    }
    const extension = (generalRegister(register) << 12) | (firstIsRegister ? 0x0800 : 0);
    return wordsToBytes([0x0e00 | (sizeCode(size) << 6) | ea.bits, extension, ...ea.extensions]);
  }
  if (op === 'moveq') {
    return wordsToBytes([0x7000 | (dataRegister(operands[1]) << 9) | (operands[0].value & 0xff)]);
  }

  if (op === 'extb') {
    return wordsToBytes([0x49c0 | dataRegister(operands[0])]);
  }

  const trapCondition = op.startsWith('trap') ? CONDITION_CODE[`b${op.slice(4)}`] : undefined;
  if (trapCondition !== undefined) {
    const operandBytes = operands.length === 0 ? 0 : size === CODE_LONG ? 4 : 2;
    const suffix = operandBytes === 0 ? 0xfc : operandBytes === 2 ? 0xfa : 0xfb;
    return wordsToBytes([
      0x5000 | (trapCondition << 8) | suffix,
      ...(operandBytes === 0 ? [] : immediateWords(operands[0].value, operandBytes)),
    ]);
  }

  if (op === 'pack' || op === 'unpk') {
    const memory = operands[0].preDecrement === true && operands[1].preDecrement === true;
    const source = memory ? operands[0].value : dataRegister(operands[0]);
    const destination = memory ? operands[1].value : dataRegister(operands[1]);
    return wordsToBytes([
      (op === 'pack' ? 0x8140 : 0x8180) |
        (destination << 9) |
        (memory ? 0x0008 : 0) |
        source,
      operands[2].value,
    ]);
  }

  if (op === 'callm') {
    const ea = encodeEa(operands[1], CODE_LONG);
    return wordsToBytes([0x06c0 | ea.bits, operands[0].value & 0xff, ...ea.extensions]);
  }
  if (op === 'rtm') return wordsToBytes([0x06c0 | generalRegister(operands[0])]);

  if (op === 'cpgen') {
    if (operands.length !== 2) throw new Error('cpGEN requires a coprocessor ID and command word');
    return wordsToBytes([0xf000 | ((operands[0].value & 7) << 9), operands[1].value]);
  }
  if (op === 'cpbcc') {
    if (operands.length !== 3) throw new Error('cpBcc requires an ID, condition, and target');
    const displacement = (operands[2].value - (address + 2)) | 0;
    const long = size === CODE_LONG || displacement < -0x8000 || displacement > 0x7fff;
    return wordsToBytes([
      0xf000 |
        ((operands[0].value & 7) << 9) |
        ((long ? 3 : 2) << 6) |
        (operands[1].value & 0x3f),
      ...(long
        ? [(displacement >>> 16) & 0xffff, displacement & 0xffff]
        : [displacement & 0xffff]),
    ]);
  }
  if (op === 'cpdbcc') {
    if (operands.length !== 4) {
      throw new Error('cpDBcc requires an ID, condition, data register, and target');
    }
    const displacement = (operands[3].value - (address + 2)) | 0;
    return wordsToBytes([
      0xf048 | ((operands[0].value & 7) << 9) | dataRegister(operands[2]),
      operands[1].value & 0x3f,
      displacement & 0xffff,
    ]);
  }
  if (op === 'cpscc') {
    if (operands.length !== 3) throw new Error('cpScc requires an ID, condition, and destination');
    const ea = encodeEa(operands[2], CODE_BYTE);
    return wordsToBytes([
      0xf040 | ((operands[0].value & 7) << 9) | ea.bits,
      operands[1].value & 0x3f,
      ...ea.extensions,
    ]);
  }
  if (op === 'cptrapcc') {
    if (operands.length < 2 || operands.length > 3) {
      throw new Error('cpTRAPcc requires an ID, condition, and optional operand');
    }
    const operandBytes = operands.length === 2 ? 0 : size === CODE_LONG ? 4 : 2;
    const register = operandBytes === 0 ? 4 : operandBytes === 2 ? 2 : 3;
    return wordsToBytes([
      0xf078 | ((operands[0].value & 7) << 9) | register,
      operands[1].value & 0x3f,
      ...(operandBytes === 0 ? [] : immediateWords(operands[2].value, operandBytes)),
    ]);
  }
  if (op === 'cpsave' || op === 'cprestore') {
    if (operands.length !== 2) throw new Error(`${op} requires an ID and effective address`);
    const ea = encodeEa(operands[1], CODE_LONG);
    return wordsToBytes([
      (op === 'cpsave' ? 0xf100 : 0xf140) | ((operands[0].value & 7) << 9) | ea.bits,
      ...ea.extensions,
    ]);
  }

  const bitFieldOperation: Record<string, number> = {
    bftst: 0, bfextu: 1, bfchg: 2, bfexts: 3,
    bfclr: 4, bfffo: 5, bfset: 6, bfins: 7,
  };
  if (bitFieldOperation[op] !== undefined) {
    const operandIndex = op === 'bfins' ? 1 : 0;
    const destinationIndex = ['bfextu', 'bfexts', 'bfffo'].includes(op) ? 1 : op === 'bfins' ? 0 : -1;
    const operand = operands[operandIndex];
    if (operand.bitField === undefined) throw new Error(`${op.toUpperCase()} requires {offset:width}`);
    const ea = encodeEa(operand, CODE_LONG);
    const field = operand.bitField;
    const destination = destinationIndex < 0 ? 0 : dataRegister(operands[destinationIndex]);
    const extension =
      (destination << 12) |
      (field.offsetRegister !== undefined ? 0x0800 | (field.offsetRegister << 6) : (field.offset & 0x1f) << 6) |
      (field.widthRegister !== undefined ? 0x0020 | field.widthRegister : field.width & 0x1f);
    return wordsToBytes([
      0xe8c0 | (bitFieldOperation[op] << 8) | ea.bits,
      extension,
      ...ea.extensions,
    ]);
  }

  if (op === 'cas') {
    const ea = encodeEa(operands[2], size);
    const base = size === CODE_BYTE ? 0x0ac0 : size === CODE_WORD ? 0x0cc0 : 0x0ec0;
    const extension = (dataRegister(operands[1]) << 6) | dataRegister(operands[0]);
    return wordsToBytes([base | ea.bits, extension, ...ea.extensions]);
  }

  if (op === 'cas2') {
    const compare = operands[0].registerPair;
    const update = operands[1].registerPair;
    const addresses = operands[2].registerPair;
    if (compare === undefined || update === undefined || addresses === undefined) {
      throw new Error('CAS2 requires three register pairs');
    }
    if ([...compare, ...update].some((register) => register < 8)) {
      throw new Error('CAS2 compare and update operands must be data registers');
    }
    const extension1 =
      (addresses[0] << 12) | ((update[0] - 8) << 6) | (compare[0] - 8);
    const extension2 =
      (addresses[1] << 12) | ((update[1] - 8) << 6) | (compare[1] - 8);
    return wordsToBytes([
      size === CODE_WORD ? 0x0cfc : 0x0efc,
      extension1,
      extension2,
    ]);
  }

  if (op === 'chk2' || op === 'cmp2') {
    const ea = encodeEa(operands[0], size);
    const base = size === CODE_BYTE ? 0x00c0 : size === CODE_WORD ? 0x02c0 : 0x04c0;
    const extension = (generalRegister(operands[1]) << 12) | (op === 'chk2' ? 0x0800 : 0);
    return wordsToBytes([base | ea.bits, extension, ...ea.extensions]);
  }

  if (op === 'move') {
    const sourceName = instruction.operandTokens[0]?.trim().toLowerCase();
    const destinationName = instruction.operandTokens[1]?.trim().toLowerCase();
    if (destinationName === 'usp') {
      return wordsToBytes([0x4e60 | addressRegister(operands[0])]);
    }
    if (sourceName === 'usp') {
      return wordsToBytes([0x4e68 | addressRegister(operands[1])]);
    }
    if (sourceName === 'sr' || sourceName === 'ccr') {
      const destination = encodeEa(operands[1], CODE_WORD);
      return wordsToBytes([
        (sourceName === 'sr' ? 0x40c0 : 0x42c0) | destination.bits,
        ...destination.extensions,
      ]);
    }
    if (destinationName === 'ccr' || destinationName === 'sr') {
      const source = encodeEa(operands[0], CODE_WORD);
      return wordsToBytes([
        (destinationName === 'ccr' ? 0x44c0 : 0x46c0) | source.bits,
        ...source.extensions,
      ]);
    }
  }

  if (CONDITION_CODE[op] !== undefined) {
    const target = operands[0].value >>> 0;
    const displacement = (target - (address + 2)) | 0;
    if (size === CODE_LONG) {
      return wordsToBytes([
        0x60ff | (CONDITION_CODE[op] << 8),
        displacement >>> 16,
        displacement,
      ]);
    }
    return wordsToBytes([0x6000 | (CONDITION_CODE[op] << 8), displacement]);
  }

  if (op.startsWith('db') && CONDITION_CODE[`b${op.slice(2)}`] !== undefined) {
    const condition = CONDITION_CODE[`b${op.slice(2)}`];
    const target = operands[1].value >>> 0;
    return wordsToBytes([
      0x50c8 | (condition << 8) | dataRegister(operands[0]),
      (target - (address + 2)) | 0,
    ]);
  }

  if (op.startsWith('s') && CONDITION_CODE[`b${op.slice(1)}`] !== undefined) {
    const destination = encodeEa(operands[0], CODE_BYTE);
    return wordsToBytes([
      0x50c0 | (CONDITION_CODE[`b${op.slice(1)}`] << 8) | destination.bits,
      ...destination.extensions,
    ]);
  }

  if (op === 'move' || op === 'movea') {
    const source = encodeEa(operands[0], size);
    const destination = encodeEa(operands[1], size);
    const base = size === CODE_BYTE ? 0x1000 : size === CODE_LONG ? 0x2000 : 0x3000;
    const destinationMode = (destination.bits >>> 3) & 7;
    const destinationRegister = destination.bits & 7;
    return wordsToBytes([
      base | (destinationRegister << 9) | (destinationMode << 6) | source.bits,
      ...source.extensions,
      ...destination.extensions,
    ]);
  }

  const immediateBase: Record<string, number> = {
    ori: 0x0000,
    andi: 0x0200,
    subi: 0x0400,
    addi: 0x0600,
    eori: 0x0a00,
    cmpi: 0x0c00,
  };
  if (immediateBase[op] !== undefined) {
    const targetName = instruction.operandTokens[1]?.trim().toLowerCase();
    if (targetName === 'ccr' || targetName === 'sr') {
      const statusOffset = targetName === 'sr' ? 0x0040 : 0;
      return wordsToBytes([immediateBase[op] | 0x003c | statusOffset, operands[0].value]);
    }
    const destination = encodeEa(operands[1], size);
    return wordsToBytes([
      immediateBase[op] | (sizeCode(size) << 6) | destination.bits,
      ...immediateWords(operands[0].value, size),
      ...destination.extensions,
    ]);
  }

  if (op === 'addq' || op === 'subq') {
    const destination = encodeEa(operands[1], size);
    const quick = operands[0].value & 7;
    return wordsToBytes([
      0x5000 |
        (quick << 9) |
        (op === 'subq' ? 0x0100 : 0) |
        (sizeCode(size) << 6) |
        destination.bits,
      ...destination.extensions,
    ]);
  }

  if (op === 'addx' || op === 'subx') {
    const memory = operands[0].preDecrement === true && operands[1].preDecrement === true;
    const source = memory ? operands[0].value : dataRegister(operands[0]);
    const destination = memory ? operands[1].value : dataRegister(operands[1]);
    return wordsToBytes([
      (op === 'addx' ? 0xd100 : 0x9100) |
        (destination << 9) |
        (sizeCode(size) << 6) |
        (memory ? 0x0008 : 0) |
        source,
    ]);
  }

  if (op === 'cmpm') {
    return wordsToBytes([
      0xb108 | (operands[1].value << 9) | (sizeCode(size) << 6) | operands[0].value,
    ]);
  }

  if (op === 'abcd' || op === 'sbcd') {
    const memory = operands[0].preDecrement === true && operands[1].preDecrement === true;
    const source = memory ? operands[0].value : dataRegister(operands[0]);
    const destination = memory ? operands[1].value : dataRegister(operands[1]);
    return wordsToBytes([
      (op === 'abcd' ? 0xc100 : 0x8100) | (destination << 9) | (memory ? 0x0008 : 0) | source,
    ]);
  }

  if (op === 'negx' || op === 'nbcd') {
    const destination = encodeEa(operands[0], op === 'nbcd' ? CODE_BYTE : size);
    return wordsToBytes([
      (op === 'nbcd' ? 0x4800 : 0x4000 | (sizeCode(size) << 6)) | destination.bits,
      ...destination.extensions,
    ]);
  }

  const binaryGroup: Record<string, number> = {
    or: 0x8000,
    sub: 0x9000,
    cmp: 0xb000,
    eor: 0xb000,
    and: 0xc000,
    add: 0xd000,
  };
  if (binaryGroup[op] !== undefined) {
    if (operands[0].type === TOKEN_IMMEDIATE) {
      const destination = encodeEa(operands[1], size);
      const aliasBase =
        op === 'or'
          ? 0x0000
          : op === 'and'
            ? 0x0200
            : op === 'sub'
              ? 0x0400
              : op === 'add'
                ? 0x0600
                : op === 'eor'
                  ? 0x0a00
                  : 0x0c00;
      return wordsToBytes([
        aliasBase | (sizeCode(size) << 6) | destination.bits,
        ...immediateWords(operands[0].value, size),
        ...destination.extensions,
      ]);
    }
    if (op === 'cmp' && operands[1].type !== TOKEN_REG_DATA) {
      const source = encodeEa(operands[0], size);
      const destination = encodeEa(operands[1], size);
      return wordsToBytes([
        0x48e7,
        0x0100, // MOVEM.L D7,-(A7)
        (size === CODE_BYTE ? 0x1e00 : size === CODE_LONG ? 0x2e00 : 0x3e00) | source.bits,
        ...source.extensions,
        0xbe00 | (sizeCode(size) << 6) | destination.bits,
        ...destination.extensions,
        0x4cdf,
        0x0080, // MOVEM.L (A7)+,D7
      ]);
    }
    const sourceIsData = operands[0].type === TOKEN_REG_DATA;
    const destinationIsData = operands[1].type === TOKEN_REG_DATA;
    const register =
      sourceIsData && !destinationIsData ? dataRegister(operands[0]) : dataRegister(operands[1]);
    const ea = encodeEa(sourceIsData && !destinationIsData ? operands[1] : operands[0], size);
    const toEa = sourceIsData && !destinationIsData;
    return wordsToBytes([
      binaryGroup[op] | (register << 9) | ((sizeCode(size) + (toEa ? 4 : 0)) << 6) | ea.bits,
      ...ea.extensions,
    ]);
  }

  if (op === 'adda' || op === 'suba' || op === 'cmpa') {
    const source = encodeEa(operands[0], size);
    const base = op === 'adda' ? 0xd000 : op === 'suba' ? 0x9000 : 0xb000;
    return wordsToBytes([
      base |
        (addressRegister(operands[1]) << 9) |
        ((size === CODE_LONG ? 7 : 3) << 6) |
        source.bits,
      ...source.extensions,
    ]);
  }

  const unaryBase: Record<string, number> = {
    clr: 0x4200,
    neg: 0x4400,
    not: 0x4600,
    tst: 0x4a00,
  };
  if (unaryBase[op] !== undefined) {
    const destination = encodeEa(operands[0], size);
    return wordsToBytes([
      unaryBase[op] | (sizeCode(size) << 6) | destination.bits,
      ...destination.extensions,
    ]);
  }

  const multiplyDivideBase: Record<string, number> = {
    divu: 0x80c0,
    divs: 0x81c0,
    mulu: 0xc0c0,
    muls: 0xc1c0,
  };
  if (multiplyDivideBase[op] !== undefined) {
    if (size === CODE_LONG) {
      const source = encodeEa(operands[0], CODE_LONG);
      const destination = dataRegister(operands[1]);
      const multiply = op === 'mulu' || op === 'muls';
      return wordsToBytes([
        (multiply ? 0x4c00 : 0x4c40) | source.bits,
        (destination << 12) | (op === 'muls' || op === 'divs' ? 0x0800 : 0) | destination,
        ...source.extensions,
      ]);
    }
    const source = encodeEa(operands[0], CODE_WORD);
    return wordsToBytes([
      multiplyDivideBase[op] | (dataRegister(operands[1]) << 9) | source.bits,
      ...source.extensions,
    ]);
  }

  if (op === 'jmp' || op === 'jsr' || op === 'lea' || op === 'pea') {
    const source = encodeEa(operands[0], CODE_LONG);
    const opcode =
      op === 'jmp'
        ? 0x4ec0
        : op === 'jsr'
          ? 0x4e80
          : op === 'pea'
            ? 0x4840
            : 0x41c0 | (addressRegister(operands[1]) << 9);
    return wordsToBytes([opcode | source.bits, ...source.extensions]);
  }

  if (op === 'chk') {
    const source = encodeEa(operands[0], size);
    return wordsToBytes([
      (size === CODE_LONG ? 0x4100 : 0x4180) | (dataRegister(operands[1]) << 9) | source.bits,
      ...source.extensions,
    ]);
  }
  if (op === 'tas') {
    const destination = encodeEa(operands[0], CODE_BYTE);
    return wordsToBytes([0x4ac0 | destination.bits, ...destination.extensions]);
  }

  if (op === 'swap') return wordsToBytes([0x4840 | dataRegister(operands[0])]);
  if (op === 'ext') {
    return wordsToBytes([
      (size === CODE_BYTE ? 0x49c0 : size === CODE_LONG ? 0x48c0 : 0x4880) |
        dataRegister(operands[0]),
    ]);
  }
  if (op === 'exg') {
    const left = operands[0];
    const right = operands[1];
    const bothData = left.type === TOKEN_REG_DATA && right.type === TOKEN_REG_DATA;
    const bothAddress = left.type === TOKEN_REG_ADDR && right.type === TOKEN_REG_ADDR;
    const source = bothAddress ? addressRegister(left) : dataRegister(left);
    const destination = bothData ? dataRegister(right) : addressRegister(right);
    return wordsToBytes([
      (bothData ? 0xc140 : bothAddress ? 0xc148 : 0xc188) | (source << 9) | destination,
    ]);
  }

  if (op === 'movem') {
    const registers = operands.find((operand) => operand.type === TOKEN_REGISTER_LIST);
    const memory = operands.find((operand) => operand.type !== TOKEN_REGISTER_LIST);
    if (registers?.registerList === undefined || memory === undefined) {
      throw new Error('MOVEM requires a register list and memory effective address');
    }
    const memoryToRegisters = operands[0] === memory;
    const ea = encodeEa(memory, size);
    const predecrement = ea.bits >>> 3 === 4;
    let mask = 0;
    for (const register of registers.registerList) {
      const standardBit = register < 8 ? register + 8 : register - 8;
      mask |= 1 << (predecrement ? 15 - standardBit : standardBit);
    }
    return wordsToBytes([
      0x4880 | (memoryToRegisters ? 0x0400 : 0) | (size === CODE_LONG ? 0x0040 : 0) | ea.bits,
      mask,
      ...ea.extensions,
    ]);
  }

  if (op === 'movep') {
    const memoryToRegister = operands[0].type === TOKEN_OFFSET_ADDR;
    const memory = memoryToRegister ? operands[0] : operands[1];
    const data = memoryToRegister ? operands[1] : operands[0];
    const operationMode = (memoryToRegister ? 0 : 2) + (size === CODE_LONG ? 1 : 0);
    return wordsToBytes([
      0x0108 | (dataRegister(data) << 9) | (operationMode << 6) | memory.value,
      memory.offset ?? 0,
    ]);
  }

  const bitOperation = { btst: 0, bchg: 1, bclr: 2, bset: 3 } as const;
  if (op in bitOperation) {
    const operation = bitOperation[op as keyof typeof bitOperation];
    const destination = encodeEa(
      operands[1],
      operands[1].type === TOKEN_REG_DATA ? CODE_LONG : CODE_BYTE
    );
    const dynamic = operands[0].type === TOKEN_REG_DATA;
    return wordsToBytes([
      (dynamic ? 0x0100 | (dataRegister(operands[0]) << 9) : 0x0800) |
        (operation << 6) |
        destination.bits,
      ...(dynamic ? [] : [operands[0].value & 0xffff]),
      ...destination.extensions,
    ]);
  }

  const shiftKind: Record<string, number> = {
    asr: 0,
    asl: 0,
    lsr: 1,
    lsl: 1,
    roxr: 2,
    roxl: 2,
    ror: 3,
    rol: 3,
  };
  if (shiftKind[op] !== undefined) {
    if (operands.length === 1) {
      const destination = encodeEa(operands[0], CODE_WORD);
      const operationCode = shiftKind[op] * 2 + (op.endsWith('l') ? 1 : 0);
      return wordsToBytes([
        0xe0c0 | (operationCode << 9) | destination.bits,
        ...destination.extensions,
      ]);
    }
    const count = operands[0];
    return wordsToBytes([
      0xe000 |
        ((count.type === TOKEN_REG_DATA ? dataRegister(count) : count.value & 7) << 9) |
        (op.endsWith('l') ? 0x0100 : 0) |
        (sizeCode(size) << 6) |
        (count.type === TOKEN_REG_DATA ? 0x0020 : 0) |
        (shiftKind[op] << 3) |
        dataRegister(operands[1]),
    ]);
  }

  throw new Error(`Binary encoding is not implemented for ${instruction.raw}`);
}

export function estimateSourceInstructionLength(instruction: DecodedInstruction): number {
  const placeholderSymbols = new Proxy<Record<string, number>>(
    {},
    { get: () => 0x0010_0000, has: () => true }
  );
  try {
    return encodeSourceInstruction(instruction, placeholderSymbols, 0).length;
  } catch {
    return 2;
  }
}
