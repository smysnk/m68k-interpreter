import type { ProgramImage } from '../assembler/programImage';
import type { CpuFault, StepResult } from '../core/execution';
import {
  FLAG_C,
  FLAG_N,
  FLAG_V,
  FLAG_X,
  FLAG_Z,
  addResult,
  compareResult,
  logicResult,
  signExtend,
  signBit,
  subResult,
  truncate,
} from './alu';
import { evaluateBranchCondition, evaluateConditionCode } from './conditions';
import { decodeBinaryInstruction } from './decoder';
import {
  classifyEffectiveAddress,
  isEffectiveAddressAllowed,
  resolveEffectiveAddress,
} from './effectiveAddress';
import { InstructionStream } from './instructionStream';
import { BusFault, type MemoryBus, RamBus } from './memoryBus';
import { M68000State, type M68000StateOptions } from './state';

export interface StrictM68000CoreOptions {
  bus?: MemoryBus;
  state?: M68000StateOptions;
}

export class StrictM68000Core {
  readonly bus: MemoryBus;
  readonly state: M68000State;
  private stopped = false;

  constructor(options: StrictM68000CoreOptions = {}) {
    this.bus = options.bus ?? new RamBus();
    this.state = new M68000State(options.state);
  }

  loadProgram(image: ProgramImage): void {
    if (!(this.bus instanceof RamBus)) {
      throw new TypeError('loadProgram requires a RamBus; load custom buses through their own API');
    }
    this.bus.load(image.entryPoint, image.bytes);
    this.state.pc = image.entryPoint;
  }

  private faultResult(fault: CpuFault): StepResult {
    return {
      kind: 'exception',
      pc: this.state.pc,
      fault,
    };
  }

  private busFaultResult(error: BusFault): StepResult {
    return this.faultResult({
      code: error.code,
      message: error.message,
      vector: error.code === 'address-error' ? 3 : 2,
      address: error.address,
    });
  }

  private push32(value: number): void {
    this.state.a[7] = (this.state.a[7] - 4) | 0;
    this.bus.write32(this.state.a[7] >>> 0, value);
  }

  private pop32(): number {
    const value = this.bus.read32(this.state.a[7] >>> 0);
    this.state.a[7] = (this.state.a[7] + 4) | 0;
    return value;
  }

  private pop16(): number {
    const value = this.bus.read16(this.state.a[7] >>> 0);
    this.state.a[7] = (this.state.a[7] + 2) | 0;
    return value;
  }

  private bcdResult(
    destination: number,
    source: number,
    subtract: boolean
  ): { value: number; ccr: number } {
    const extend = (this.state.ccr & FLAG_X) !== 0 ? 1 : 0;
    const stickyZero = (this.state.ccr & FLAG_Z) !== 0;
    const preservedUndefined = this.state.ccr & (FLAG_N | FLAG_V);
    let value: number;
    let carry: boolean;

    if (subtract) {
      const lowDifference = (destination & 0x0f) - (source & 0x0f) - extend;
      let difference = (destination & 0xff) - (source & 0xff) - extend;
      if (lowDifference < 0) difference -= 0x06;
      carry = difference < 0;
      if (carry) difference -= 0x60;
      value = difference & 0xff;
    } else {
      const lowSum = (destination & 0x0f) + (source & 0x0f) + extend;
      let sum = (destination & 0xff) + (source & 0xff) + extend;
      if (lowSum > 9) sum += 0x06;
      carry = sum > 0x99;
      if (carry) sum += 0x60;
      value = sum & 0xff;
    }

    return {
      value,
      ccr:
        preservedUndefined |
        (carry ? FLAG_X | FLAG_C : 0) |
        (value === 0 && stickyZero ? FLAG_Z : 0),
    };
  }

  private rotateThroughExtend(
    value: number,
    size: 1 | 2 | 4,
    count: number,
    direction: 'left' | 'right'
  ): { value: number; ccr: number } {
    let result = truncate(value, size);
    let extend = (this.state.ccr & FLAG_X) !== 0 ? 1 : 0;
    const normalizedCount = count & 0x3f;

    for (let index = 0; index < normalizedCount; index += 1) {
      if (direction === 'left') {
        const nextExtend = (result & signBit(size)) !== 0 ? 1 : 0;
        result = truncate(result * 2 + extend, size);
        extend = nextExtend;
      } else {
        const nextExtend = result & 1;
        result = (result >>> 1) | (extend ? signBit(size) : 0);
        result = truncate(result, size);
        extend = nextExtend;
      }
    }

    const effectiveExtend = normalizedCount === 0 ? (this.state.ccr & FLAG_X ? 1 : 0) : extend;
    return {
      value: result,
      ccr:
        (effectiveExtend ? FLAG_X | FLAG_C : 0) |
        (result === 0 ? FLAG_Z : 0) |
        ((result & signBit(size)) !== 0 ? FLAG_N : 0),
    };
  }

  private shiftMemoryWord(
    value: number,
    operation: 'asr' | 'asl' | 'lsr' | 'lsl' | 'ror' | 'rol'
  ): { value: number; ccr: number } {
    const word = value & 0xffff;
    const preserveX = operation === 'ror' || operation === 'rol';
    let result: number;
    let carry: boolean;
    let overflow = false;

    switch (operation) {
      case 'asr':
        carry = (word & 1) !== 0;
        result = ((word >>> 1) | (word & 0x8000)) & 0xffff;
        break;
      case 'asl':
        carry = (word & 0x8000) !== 0;
        result = (word << 1) & 0xffff;
        overflow = ((word ^ result) & 0x8000) !== 0;
        break;
      case 'lsr':
        carry = (word & 1) !== 0;
        result = word >>> 1;
        break;
      case 'lsl':
        carry = (word & 0x8000) !== 0;
        result = (word << 1) & 0xffff;
        break;
      case 'ror':
        carry = (word & 1) !== 0;
        result = (word >>> 1) | (carry ? 0x8000 : 0);
        break;
      case 'rol':
        carry = (word & 0x8000) !== 0;
        result = ((word << 1) & 0xffff) | (carry ? 1 : 0);
        break;
    }

    return {
      value: result,
      ccr:
        (preserveX ? this.state.ccr & FLAG_X : carry ? FLAG_X : 0) |
        (carry ? FLAG_C : 0) |
        (overflow ? FLAG_V : 0) |
        (result === 0 ? FLAG_Z : 0) |
        ((result & 0x8000) !== 0 ? FLAG_N : 0),
    };
  }

  step(): StepResult {
    if (this.stopped) {
      return {
        kind: 'halted',
        pc: this.state.pc,
      };
    }

    const pcBefore = this.state.pc >>> 0;

    try {
      const opcode = this.bus.read16(pcBefore, 'fetch');
      const needsExtension =
        opcode === 0x4e72 || ((opcode & 0xf000) === 0x6000 && (opcode & 0xff) === 0);
      const extension = needsExtension ? this.bus.read16(pcBefore + 2, 'fetch') : 0;
      const instructionBytes = Uint8Array.of(
        (opcode >>> 8) & 0xff,
        opcode & 0xff,
        (extension >>> 8) & 0xff,
        extension & 0xff
      );
      const instruction = decodeBinaryInstruction(instructionBytes);
      const nextPc = (pcBefore + instruction.length) & 0x00ff_ffff;
      const stream = new InstructionStream(this.bus, pcBefore + 2);

      switch (instruction.kind) {
        case 'nop':
          this.state.pc = nextPc;
          return { kind: 'executed', pcBefore, pcAfter: nextPc, cycles: 4 };
        case 'moveq': {
          const value = instruction.immediate | 0;
          this.state.d[instruction.register] = value;
          const preservedX = this.state.ccr & FLAG_X;
          this.state.ccr = preservedX | (value === 0 ? FLAG_Z : 0) | (value < 0 ? FLAG_N : 0);
          this.state.pc = nextPc;
          return { kind: 'executed', pcBefore, pcAfter: nextPc, cycles: 4 };
        }
        case 'branch': {
          const taken = evaluateBranchCondition(instruction.condition, this.state.sr);
          if (instruction.condition === 'bsr') {
            this.push32(nextPc);
          }
          this.state.pc = taken ? (pcBefore + 2 + instruction.displacement) & 0x00ff_ffff : nextPc;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles:
              instruction.condition === 'bsr' ? 18 : taken ? 10 : instruction.length === 2 ? 8 : 12,
          };
        }
        case 'pea': {
          const allowed = [
            'address-indirect',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
            'pc-displacement',
            'pc-indexed',
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'PEA requires a control addressing mode',
              vector: 4,
            });
          }
          const operand = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 4,
            access: 'address',
          });
          this.push32(operand.resolveAddress());
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'dbcc': {
          const displacement = stream.readSignedWord();
          if (evaluateConditionCode(instruction.condition, this.state.sr)) {
            this.state.pc = stream.cursor;
            return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
          }
          const decremented = ((this.state.d[instruction.register] & 0xffff) - 1) & 0xffff;
          this.state.d[instruction.register] =
            (this.state.d[instruction.register] & 0xffff_0000) | decremented | 0;
          this.state.pc =
            decremented === 0xffff ? stream.cursor : (pcBefore + 2 + displacement) & 0x00ff_ffff;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles: decremented === 0xffff ? 14 : 10,
          };
        }
        case 'scc': {
          const allowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'Scc requires a data-alterable destination',
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 1,
            access: 'write',
          });
          destination.write(evaluateConditionCode(instruction.condition, this.state.sr) ? 0xff : 0);
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'bit': {
          const destinationClass = classifyEffectiveAddress(instruction.mode, instruction.register);
          const allowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (!allowed.includes(destinationClass as (typeof allowed)[number])) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: `${instruction.operation.toUpperCase()} requires a data destination`,
              vector: 4,
            });
          }
          const bitNumber =
            instruction.source.kind === 'register'
              ? this.state.d[instruction.source.register] >>> 0
              : stream.readWord();
          const size = destinationClass === 'data-register' ? 4 : 1;
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size,
            access: instruction.operation === 'btst' ? 'read' : 'readwrite',
          });
          const value = destination.read();
          const bit = bitNumber % (size === 4 ? 32 : 8);
          const bitMask = 2 ** bit;
          const bitWasZero = (value & bitMask) === 0;
          this.state.ccr = (this.state.ccr & ~FLAG_Z) | (bitWasZero ? FLAG_Z : 0);
          if (instruction.operation !== 'btst') {
            const nextValue =
              instruction.operation === 'bchg'
                ? value ^ bitMask
                : instruction.operation === 'bclr'
                  ? value & ~bitMask
                  : value | bitMask;
            destination.write(nextValue);
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'extend-arithmetic': {
          const source = resolveEffectiveAddress(
            instruction.memory ? 4 : 0,
            instruction.sourceRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: instruction.size,
              access: 'read',
            }
          );
          const sourceValue = source.read();
          const destination = resolveEffectiveAddress(
            instruction.memory ? 4 : 0,
            instruction.destinationRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: instruction.size,
              access: 'readwrite',
            }
          );
          const destinationValue = destination.read();
          const extend = (this.state.ccr & FLAG_X) !== 0 ? 1 : 0;
          const result =
            instruction.operation === 'addx'
              ? addResult(
                  destinationValue,
                  sourceValue,
                  instruction.size,
                  this.state.ccr,
                  extend,
                  true
                )
              : subResult(
                  destinationValue,
                  sourceValue,
                  instruction.size,
                  this.state.ccr,
                  extend,
                  true
                );
          destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles: instruction.memory ? 18 : 8,
          };
        }
        case 'bcd': {
          const source = resolveEffectiveAddress(
            instruction.memory ? 4 : 0,
            instruction.sourceRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: 1,
              access: 'read',
            }
          );
          const sourceValue = source.read();
          const destination = resolveEffectiveAddress(
            instruction.memory ? 4 : 0,
            instruction.destinationRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: 1,
              access: 'readwrite',
            }
          );
          const result = this.bcdResult(
            destination.read(),
            sourceValue,
            instruction.operation === 'sbcd'
          );
          destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles: instruction.memory ? 18 : 6,
          };
        }
        case 'unary-extend': {
          const allowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: `${instruction.operation.toUpperCase()} requires a data-alterable operand`,
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'readwrite',
          });
          const destinationValue = destination.read();
          const result =
            instruction.operation === 'nbcd'
              ? this.bcdResult(0, destinationValue, true)
              : subResult(
                  0,
                  destinationValue,
                  instruction.size,
                  this.state.ccr,
                  (this.state.ccr & FLAG_X) !== 0 ? 1 : 0,
                  true
                );
          destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'cmpm': {
          const source = resolveEffectiveAddress(3, instruction.sourceRegister, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'read',
          });
          const sourceValue = source.read();
          const destination = resolveEffectiveAddress(3, instruction.destinationRegister, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'read',
          });
          const result = compareResult(
            destination.read(),
            sourceValue,
            instruction.size,
            this.state.ccr
          );
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'rotate-extend': {
          const allowed = [
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (
            instruction.memory &&
            !isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)
          ) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'Memory ROX requires a memory-alterable operand',
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(
            instruction.memory ? instruction.mode : 0,
            instruction.register,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: instruction.size,
              access: 'readwrite',
            }
          );
          const count =
            instruction.count.kind === 'register'
              ? this.state.d[instruction.count.register] & 0x3f
              : instruction.count.value;
          const result = this.rotateThroughExtend(
            destination.read(),
            instruction.size,
            count,
            instruction.direction
          );
          destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 + count * 2 };
        }
        case 'immediate-status': {
          const immediate = stream.readWord();
          if (instruction.target === 'sr' && !this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: `${instruction.operation.toUpperCase()}I to SR requires supervisor mode`,
              vector: 8,
            });
          }
          const current = instruction.target === 'ccr' ? this.state.ccr : this.state.sr;
          const mask = instruction.target === 'ccr' ? 0x1f : 0xffff;
          const operand = immediate & mask;
          const result =
            instruction.operation === 'and'
              ? current & operand
              : instruction.operation === 'or'
                ? current | operand
                : current ^ operand;
          if (instruction.target === 'ccr') this.state.ccr = result;
          else this.state.sr = result;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 20 };
        }
        case 'memory-shift': {
          const allowed = [
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'Memory shifts require a memory-alterable operand',
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 2,
            access: 'readwrite',
          });
          const result = this.shiftMemoryWord(destination.read(), instruction.operation);
          destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'link': {
          const displacement = stream.readSignedWord();
          this.push32(this.state.a[instruction.register] >>> 0);
          this.state.a[instruction.register] = this.state.a[7];
          this.state.a[7] = ((this.state.a[7] >>> 0) + displacement) | 0;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 16 };
        }
        case 'unlk':
          this.state.a[7] = this.state.a[instruction.register];
          this.state.a[instruction.register] = this.pop32() | 0;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        case 'move-usp':
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'MOVE USP requires supervisor mode',
              vector: 8,
            });
          }
          if (instruction.direction === 'to-usp') {
            this.state.usp = this.state.a[instruction.register] >>> 0;
          } else {
            this.state.a[instruction.register] = this.state.usp | 0;
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 4 };
        case 'rtr': {
          const restoredCcr = this.pop16();
          const restoredPc = this.pop32();
          this.state.ccr = restoredCcr;
          this.state.pc = restoredPc & 0x00ff_ffff;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 20 };
        }
        case 'move-status': {
          const dataSource = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
            'pc-displacement',
            'pc-indexed',
            'immediate',
          ] as const;
          const dataAlterable = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (instruction.direction === 'to-sr' && !this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'MOVE to SR requires supervisor mode',
              vector: 8,
            });
          }
          const allowed = instruction.direction === 'from-sr' ? dataAlterable : dataSource;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: `Illegal effective address for MOVE ${instruction.direction}`,
              vector: 4,
            });
          }
          if (instruction.direction === 'from-sr') {
            const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
              state: this.state,
              bus: this.bus,
              stream,
              size: 2,
              access: 'write',
            });
            destination.write(this.state.sr);
          } else {
            const source = resolveEffectiveAddress(instruction.mode, instruction.register, {
              state: this.state,
              bus: this.bus,
              stream,
              size: 2,
              access: 'read',
            });
            const value = source.read();
            if (instruction.direction === 'to-ccr') this.state.ccr = value;
            else this.state.sr = value;
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'movep': {
          const displacement = stream.readSignedWord();
          const address =
            ((this.state.a[instruction.addressRegister] >>> 0) + displacement) & 0x00ff_ffff;
          if (instruction.direction === 'memory-to-register') {
            let value = 0;
            for (let index = 0; index < instruction.size; index += 1) {
              value = (value * 0x100 + this.bus.read8(address + index * 2)) >>> 0;
            }
            this.state.d[instruction.dataRegister] =
              instruction.size === 2
                ? (this.state.d[instruction.dataRegister] & 0xffff_0000) | value | 0
                : value | 0;
          } else {
            const value = this.state.d[instruction.dataRegister] >>> 0;
            for (let index = 0; index < instruction.size; index += 1) {
              const shift = (instruction.size - index - 1) * 8;
              this.bus.write8(address + index * 2, value >>> shift);
            }
          }
          this.state.pc = stream.cursor;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles: instruction.size === 2 ? 16 : 24,
          };
        }
        case 'chk': {
          const allowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
            'pc-displacement',
            'pc-indexed',
            'immediate',
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'CHK requires a data source',
              vector: 4,
            });
          }
          const source = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 2,
            access: 'read',
          });
          const upperBound = signExtend(source.read(), 2);
          const checked = signExtend(this.state.d[instruction.dataRegister], 2);
          if (checked < 0 || checked > upperBound) {
            this.state.ccr = (this.state.ccr & ~FLAG_N) | (checked < 0 ? FLAG_N : 0);
            return this.faultResult({
              code: 'chk-exception',
              message: `CHK value ${checked} is outside 0..${upperBound}`,
              vector: 6,
            });
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 10 };
        }
        case 'tas': {
          const allowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'TAS requires a data-alterable operand',
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 1,
            access: 'readwrite',
          });
          const value = destination.read();
          this.state.ccr = logicResult(value, 1, this.state.ccr).ccr;
          destination.write(value | 0x80);
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 14 };
        }
        case 'trapv':
          if ((this.state.ccr & FLAG_V) !== 0) {
            return this.faultResult({
              code: 'trapv',
              message: 'TRAPV overflow exception',
              vector: 7,
            });
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 4 };
        case 'rts':
          this.state.pc = this.pop32() & 0x00ff_ffff;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 16 };
        case 'stop':
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'STOP requires supervisor mode',
              vector: 8,
            });
          }
          this.state.sr = instruction.statusRegister;
          this.state.pc = nextPc;
          this.stopped = true;
          return { kind: 'halted', pc: this.state.pc };
        case 'reset':
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'RESET requires supervisor mode',
              vector: 8,
            });
          }
          this.state.pc = nextPc;
          return { kind: 'executed', pcBefore, pcAfter: nextPc, cycles: 132 };
        case 'illegal':
          return this.faultResult({
            code: 'illegal-instruction',
            message: 'ILLEGAL instruction',
            vector: 4,
          });
        case 'trap':
          return this.faultResult({
            code: 'trap',
            message: `TRAP #${instruction.vector}`,
            vector: 32 + instruction.vector,
          });
        case 'rte':
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'RTE requires supervisor mode',
              vector: 8,
            });
          }
          return this.faultResult({
            code: 'unimplemented-instruction',
            message: 'RTE stack-frame restoration is not implemented in the binary core',
          });
        case 'unimplemented':
          return this.faultResult({
            code: 'unimplemented-instruction',
            message: `Opcode ${instruction.opcode.toString(16).padStart(4, '0')} is not implemented`,
          });
      }
    } catch (error) {
      if (error instanceof BusFault) {
        return this.busFaultResult(error);
      }
      throw error;
    }
  }
}
