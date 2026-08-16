import type { ProgramImage } from '../assembler/programImage';
import type { CpuFault, StepResult } from '../core/execution';
import type { CpuModel } from '../isa/types';
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
import { decodeBinaryInstruction, type DecodedBinaryInstruction } from './decoder';
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
  cpuModel?: CpuModel;
  /** @deprecated Use cpuModel. */
  profile?: CpuModel;
}

export class StrictM68000Core {
  readonly bus: MemoryBus;
  readonly state: M68000State;
  readonly cpuModel: CpuModel;
  private stopped = false;
  private pendingInterruptLevel = 0;
  private programEndAddress: number | undefined;
  private readonly decodeCache = new Map<
    number,
    { opcode: number; extension: number; instruction: DecodedBinaryInstruction }
  >();

  constructor(options: StrictM68000CoreOptions = {}) {
    this.bus = options.bus ?? new RamBus();
    this.state = new M68000State(options.state);
    this.cpuModel = options.cpuModel ?? options.profile ?? 'm68000';
  }

  loadProgram(image: ProgramImage): void {
    if (this.bus instanceof RamBus) this.bus.load(image.loadAddress, image.bytes);
    else image.bytes.forEach((byte, offset) => this.bus.write8(image.loadAddress + offset, byte));
    this.state.pc = image.entryPoint;
    this.programEndAddress = image.endAddress;
  }

  private faultResult(fault: CpuFault, stackedPc = this.state.pc): StepResult {
    if (fault.vector !== undefined) {
      const snapshot = this.state.snapshot();
      const wasStopped = this.stopped;
      try {
        const oldSr = this.state.sr;
        this.state.sr = (oldSr | 0x2000) & 0x7fff;
        this.push32(stackedPc >>> 0);
        this.push16(oldSr);
        this.state.pc = this.bus.read32(fault.vector * 4, 'fetch') & 0x00ff_ffff;
        this.stopped = false;
      } catch {
        // A fault while building an exception frame would halt a physical
        // MC68000. Preserve the original structured fault for the caller.
        this.state.sr = snapshot.sr;
        this.state.d.set(snapshot.d);
        this.state.a.set(snapshot.a);
        this.state.pc = snapshot.pc;
        this.state.usp = snapshot.usp;
        this.state.ssp = snapshot.ssp;
        this.stopped = wasStopped;
      }
    }
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

  private push16(value: number): void {
    this.state.a[7] = (this.state.a[7] - 2) | 0;
    this.bus.write16(this.state.a[7] >>> 0, value);
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

  requestInterrupt(level: number): void {
    if (!Number.isInteger(level) || level < 1 || level > 7) {
      throw new RangeError(`Interrupt level must be an integer from 1 through 7: ${level}`);
    }
    this.pendingInterruptLevel = Math.max(this.pendingInterruptLevel, level);
  }

  isProgramComplete(): boolean {
    return this.programEndAddress !== undefined && this.state.pc === this.programEndAddress;
  }

  private servicePendingInterrupt(): StepResult | undefined {
    const level = this.pendingInterruptLevel;
    const mask = (this.state.sr >>> 8) & 0x7;
    if (level === 0 || (level !== 7 && level <= mask)) return undefined;

    this.pendingInterruptLevel = 0;
    const oldSr = this.state.sr;
    this.state.sr = ((oldSr | 0x2000) & 0x78ff) | (level << 8);
    this.push32(this.state.pc);
    this.push16(oldSr);
    this.state.pc = this.bus.read32((24 + level) * 4, 'fetch') & 0x00ff_ffff;
    this.stopped = false;
    return {
      kind: 'exception',
      pc: this.state.pc,
      fault: {
        code: 'interrupt',
        message: `Autovector interrupt level ${level}`,
        vector: 24 + level,
      },
    };
  }

  private bcdResult(
    destination: number,
    source: number,
    subtract: boolean
  ): { value: number; ccr: number } {
    const extend = (this.state.ccr & FLAG_X) !== 0 ? 1 : 0;
    const stickyZero = (this.state.ccr & FLAG_Z) !== 0;
    let result: number;
    let intermediate: number;
    let carry: boolean;
    let overflow: boolean;

    if (subtract) {
      const low = (destination & 0x0f) - (source & 0x0f) - extend;
      const high = (destination & 0xf0) - (source & 0xf0);
      result = intermediate = high + low;
      if ((low & 0xf0) !== 0) {
        result -= 0x06;
        carry = ((destination - source - 6 - extend) & 0x300) >>> 0 > 0xff;
      } else {
        carry = ((destination - source - extend) & 0x300) >>> 0 > 0xff;
      }
      if (((destination - source - (carry ? 1 : 0)) & 0x100) !== 0) result -= 0x60;
      overflow = (intermediate & 0x80) !== 0 && (result & 0x80) === 0;
    } else {
      const low = (destination & 0x0f) + (source & 0x0f) + extend;
      const high = (destination & 0xf0) + (source & 0xf0);
      result = intermediate = high + low;
      if (low > 9) result += 0x06;
      carry = (result & 0x3f0) > 0x90;
      if (carry) result += 0x60;
      overflow = (intermediate & 0x80) === 0 && (result & 0x80) !== 0;
    }

    const value = result & 0xff;
    return {
      value,
      ccr:
        (carry ? FLAG_X | FLAG_C : 0) |
        (overflow ? FLAG_V : 0) |
        ((value & 0x80) !== 0 ? FLAG_N : 0) |
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

  private shiftRegisterValue(
    value: number,
    size: 1 | 2 | 4,
    count: number,
    operation: 'asr' | 'asl' | 'lsr' | 'lsl' | 'ror' | 'rol'
  ): { value: number; ccr: number } {
    let result = truncate(value, size);
    let carry = false;
    let overflow = false;
    const normalizedCount = count & 0x3f;

    for (let index = 0; index < normalizedCount; index += 1) {
      const previous = result;
      switch (operation) {
        case 'asr':
          carry = (result & 1) !== 0;
          result = truncate((result >>> 1) | (result & signBit(size)), size);
          break;
        case 'asl':
          carry = (result & signBit(size)) !== 0;
          result = truncate(result * 2, size);
          overflow ||= ((previous ^ result) & signBit(size)) !== 0;
          break;
        case 'lsr':
          carry = (result & 1) !== 0;
          result = result >>> 1;
          break;
        case 'lsl':
          carry = (result & signBit(size)) !== 0;
          result = truncate(result * 2, size);
          break;
        case 'ror':
          carry = (result & 1) !== 0;
          result = truncate((result >>> 1) | (carry ? signBit(size) : 0), size);
          break;
        case 'rol':
          carry = (result & signBit(size)) !== 0;
          result = truncate(result * 2 + (carry ? 1 : 0), size);
          break;
      }
    }

    const rotate = operation === 'ror' || operation === 'rol';
    return {
      value: result,
      ccr:
        (rotate || normalizedCount === 0 ? this.state.ccr & FLAG_X : carry ? FLAG_X : 0) |
        (carry ? FLAG_C : 0) |
        (overflow ? FLAG_V : 0) |
        (result === 0 ? FLAG_Z : 0) |
        ((result & signBit(size)) !== 0 ? FLAG_N : 0),
    };
  }

  private readRegister(index: number): number {
    return index < 8 ? this.state.d[index] : this.state.a[index - 8];
  }

  private writeRegister(index: number, value: number): void {
    if (index < 8) this.state.d[index] = value | 0;
    else this.state.a[index - 8] = value | 0;
  }

  step(): StepResult {
    try {
      const interrupt = this.servicePendingInterrupt();
      if (interrupt !== undefined) return interrupt;
    } catch (error) {
      if (error instanceof BusFault) return this.busFaultResult(error);
      throw error;
    }

    if (this.stopped) {
      return {
        kind: 'halted',
        pc: this.state.pc,
      };
    }

    if (this.isProgramComplete()) {
      return { kind: 'completed', pc: this.state.pc };
    }

    const pcBefore = this.state.pc >>> 0;

    try {
      const opcode = this.bus.read16(pcBefore, 'fetch');
      const needsExtension =
        opcode === 0x4e72 || ((opcode & 0xf000) === 0x6000 && (opcode & 0xff) === 0);
      const extension = needsExtension ? this.bus.read16(pcBefore + 2, 'fetch') : 0;
      const cached = this.decodeCache.get(pcBefore);
      let instruction: DecodedBinaryInstruction;
      if (cached?.opcode === opcode && cached.extension === extension) {
        instruction = cached.instruction;
      } else {
        const instructionBytes = Uint8Array.of(
          (opcode >>> 8) & 0xff,
          opcode & 0xff,
          (extension >>> 8) & 0xff,
          extension & 0xff
        );
        instruction = decodeBinaryInstruction(instructionBytes);
        this.decodeCache.set(pcBefore, { opcode, extension, instruction });
      }
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
            ...(instruction.operation === 'btst'
              ? (['pc-displacement', 'pc-indexed', 'immediate'] as const)
              : []),
          ] as const;
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
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
        case 'move': {
          const sourceAllowed = [
            'data-register',
            'address-register',
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
          const destinationAllowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (
            !isEffectiveAddressAllowed(
              instruction.sourceMode,
              instruction.sourceRegister,
              sourceAllowed
            ) ||
            !isEffectiveAddressAllowed(
              instruction.destinationMode,
              instruction.destinationRegister,
              destinationAllowed
            ) ||
            (instruction.size === 1 && instruction.sourceMode === 1)
          ) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'Illegal effective address for MOVE',
              vector: 4,
            });
          }
          const source = resolveEffectiveAddress(
            instruction.sourceMode,
            instruction.sourceRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: instruction.size,
              access: 'read',
            }
          );
          const value = source.read();
          const destination = resolveEffectiveAddress(
            instruction.destinationMode,
            instruction.destinationRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: instruction.size,
              access: 'write',
            }
          );
          destination.write(value);
          this.state.ccr = logicResult(value, instruction.size, this.state.ccr).ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'movea': {
          const allowed = [
            'data-register',
            'address-register',
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
          if (
            !isEffectiveAddressAllowed(instruction.sourceMode, instruction.sourceRegister, allowed)
          ) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'Illegal effective address for MOVEA',
              vector: 4,
            });
          }
          const source = resolveEffectiveAddress(
            instruction.sourceMode,
            instruction.sourceRegister,
            {
              state: this.state,
              bus: this.bus,
              stream,
              size: instruction.size,
              access: 'read',
            }
          );
          const value = source.read();
          this.state.a[instruction.destinationRegister] =
            instruction.size === 2 ? signExtend(value, 2) : value | 0;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'binary-alu': {
          const sourceAllowed = [
            'data-register',
            ...(instruction.size !== 1 &&
            (instruction.operation === 'add' ||
              instruction.operation === 'sub' ||
              instruction.operation === 'cmp')
              ? (['address-register'] as const)
              : []),
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
          const destinationAllowed = [
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          if (
            (instruction.direction === 'ea-to-register' &&
              !isEffectiveAddressAllowed(instruction.mode, instruction.register, sourceAllowed)) ||
            (instruction.direction === 'register-to-ea' &&
              !isEffectiveAddressAllowed(
                instruction.mode,
                instruction.register,
                instruction.operation === 'eor'
                  ? (['data-register', ...destinationAllowed] as const)
                  : destinationAllowed
              )) ||
            (instruction.operation === 'cmp' && instruction.direction !== 'ea-to-register')
          ) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: `Illegal effective address for ${instruction.operation.toUpperCase()}`,
              vector: 4,
            });
          }
          const registerValue = this.state.d[instruction.dataRegister];
          const ea = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: instruction.direction === 'ea-to-register' ? 'read' : 'readwrite',
          });
          const eaValue = ea.read();
          const destinationValue =
            instruction.direction === 'ea-to-register' ? registerValue : eaValue;
          const sourceValue = instruction.direction === 'ea-to-register' ? eaValue : registerValue;
          const result =
            instruction.operation === 'add'
              ? addResult(destinationValue, sourceValue, instruction.size, this.state.ccr)
              : instruction.operation === 'sub' || instruction.operation === 'cmp'
                ? instruction.operation === 'cmp'
                  ? compareResult(destinationValue, sourceValue, instruction.size, this.state.ccr)
                  : subResult(destinationValue, sourceValue, instruction.size, this.state.ccr)
                : logicResult(
                    instruction.operation === 'and'
                      ? destinationValue & sourceValue
                      : instruction.operation === 'or'
                        ? destinationValue | sourceValue
                        : destinationValue ^ sourceValue,
                    instruction.size,
                    this.state.ccr
                  );
          if (instruction.operation !== 'cmp') {
            if (instruction.direction === 'ea-to-register') {
              const destination = resolveEffectiveAddress(0, instruction.dataRegister, {
                state: this.state,
                bus: this.bus,
                stream,
                size: instruction.size,
                access: 'write',
              });
              destination.write(result.value);
            } else ea.write(result.value);
          }
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'address-alu': {
          const allowed = [
            'data-register',
            'address-register',
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
              message: `Illegal effective address for ${instruction.operation.toUpperCase()}`,
              vector: 4,
            });
          }
          const source = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'read',
          });
          const sourceValue =
            instruction.size === 2 ? signExtend(source.read(), 2) : source.read() | 0;
          const destination = this.state.a[instruction.addressRegister];
          if (instruction.operation === 'cmpa') {
            this.state.ccr = compareResult(destination, sourceValue, 4, this.state.ccr).ccr;
          } else {
            this.state.a[instruction.addressRegister] =
              instruction.operation === 'adda'
                ? (destination + sourceValue) | 0
                : (destination - sourceValue) | 0;
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'immediate-data': {
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
          const immediate =
            instruction.size === 4
              ? stream.readLong()
              : stream.readWord() & (instruction.size === 1 ? 0xff : 0xffff);
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: `Illegal effective address for immediate ${instruction.operation}`,
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: instruction.operation === 'cmp' ? 'read' : 'readwrite',
          });
          const value = destination.read();
          const result =
            instruction.operation === 'add'
              ? addResult(value, immediate, instruction.size, this.state.ccr)
              : instruction.operation === 'sub'
                ? subResult(value, immediate, instruction.size, this.state.ccr)
                : instruction.operation === 'cmp'
                  ? compareResult(value, immediate, instruction.size, this.state.ccr)
                  : logicResult(
                      instruction.operation === 'and'
                        ? value & immediate
                        : instruction.operation === 'or'
                          ? value | immediate
                          : value ^ immediate,
                      instruction.size,
                      this.state.ccr
                    );
          if (instruction.operation !== 'cmp') destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'quick': {
          const eaClass = classifyEffectiveAddress(instruction.mode, instruction.register);
          if (eaClass === 'address-register') {
            if (instruction.size === 1) {
              return this.faultResult({
                code: 'illegal-instruction',
                message: 'Byte-sized quick arithmetic is illegal on address registers',
                vector: 4,
              });
            }
            const current = this.state.a[instruction.register];
            this.state.a[instruction.register] =
              instruction.operation === 'add'
                ? (current + instruction.immediate) | 0
                : (current - instruction.immediate) | 0;
          } else {
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
                message: 'Illegal effective address for quick arithmetic',
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
            const value = destination.read();
            const result =
              instruction.operation === 'add'
                ? addResult(value, instruction.immediate, instruction.size, this.state.ccr)
                : subResult(value, instruction.immediate, instruction.size, this.state.ccr);
            destination.write(result.value);
            this.state.ccr = result.ccr;
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'unary': {
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
              message: `Illegal effective address for ${instruction.operation.toUpperCase()}`,
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: instruction.operation === 'tst' ? 'read' : 'readwrite',
          });
          const value = destination.read();
          const result =
            instruction.operation === 'neg'
              ? subResult(0, value, instruction.size, this.state.ccr)
              : logicResult(
                  instruction.operation === 'clr'
                    ? 0
                    : instruction.operation === 'not'
                      ? ~value
                      : value,
                  instruction.size,
                  this.state.ccr
                );
          if (instruction.operation !== 'tst') destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
        }
        case 'multiply-divide': {
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
              message: `Illegal source for ${instruction.operation.toUpperCase()}`,
              vector: 4,
            });
          }
          const source = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 2,
            access: 'read',
          }).read();
          const destination = this.state.d[instruction.dataRegister];
          if (instruction.operation === 'mulu' || instruction.operation === 'muls') {
            const product =
              instruction.operation === 'muls'
                ? Math.imul(signExtend(destination, 2), signExtend(source, 2))
                : ((destination & 0xffff) * (source & 0xffff)) >>> 0;
            this.state.d[instruction.dataRegister] = product | 0;
            this.state.ccr = logicResult(product, 4, this.state.ccr).ccr;
          } else {
            const divisor =
              instruction.operation === 'divs' ? signExtend(source, 2) : source & 0xffff;
            if (divisor === 0) {
              return this.faultResult(
                { code: 'divide-by-zero', message: 'divide by zero', vector: 5 },
                stream.cursor
              );
            }
            const dividend = instruction.operation === 'divs' ? destination | 0 : destination >>> 0;
            const quotient = Math.trunc(dividend / divisor);
            const signed = instruction.operation === 'divs';
            const overflow = signed
              ? quotient < -0x8000 || quotient > 0x7fff
              : quotient < 0 || quotient > 0xffff;
            if (overflow) {
              this.state.ccr = (this.state.ccr & FLAG_X) | FLAG_V;
            } else {
              const remainder = dividend - quotient * divisor;
              this.state.d[instruction.dataRegister] =
                ((remainder & 0xffff) << 16) | (quotient & 0xffff) | 0;
              this.state.ccr =
                (this.state.ccr & FLAG_X) |
                (quotient === 0 ? FLAG_Z : 0) |
                ((quotient & 0x8000) !== 0 ? FLAG_N : 0);
            }
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 70 };
        }
        case 'control-ea': {
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
              message: `Illegal control effective address for ${instruction.operation.toUpperCase()}`,
              vector: 4,
            });
          }
          const ea = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 4,
            access: 'address',
          });
          const resolvedAddress = ea.resolveAddress();
          if (instruction.operation === 'lea') {
            this.state.a[instruction.addressRegister ?? 0] = resolvedAddress | 0;
            this.state.pc = stream.cursor;
          } else {
            if (instruction.operation === 'jsr') this.push32(stream.cursor);
            this.state.pc = resolvedAddress & 0x00ff_ffff;
          }
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'movem': {
          const mask = stream.readWord();
          const predecrement = instruction.mode === 4;
          const postincrement = instruction.mode === 3;
          const allowed =
            instruction.direction === 'registers-to-memory'
              ? ([
                  'address-indirect',
                  'predecrement',
                  'displacement',
                  'indexed',
                  'absolute-short',
                  'absolute-long',
                ] as const)
              : ([
                  'address-indirect',
                  'postincrement',
                  'displacement',
                  'indexed',
                  'absolute-short',
                  'absolute-long',
                  'pc-displacement',
                  'pc-indexed',
                ] as const);
          if (!isEffectiveAddressAllowed(instruction.mode, instruction.register, allowed)) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'Illegal effective address for MOVEM',
              vector: 4,
            });
          }
          const ea = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'address',
          });
          let address = ea.resolveAddress();
          if (predecrement) {
            this.state.a[instruction.register] =
              ((this.state.a[instruction.register] >>> 0) + instruction.size) | 0;
            address = this.state.a[instruction.register] >>> 0;
          }
          for (let bit = 0; bit < 16; bit += 1) {
            if ((mask & (1 << bit)) === 0) continue;
            const registerIndex = predecrement ? 15 - bit : bit;
            if (predecrement) address = (address - instruction.size) >>> 0;
            if (instruction.direction === 'registers-to-memory') {
              const value = this.readRegister(registerIndex);
              if (instruction.size === 2) this.bus.write16(address, value);
              else this.bus.write32(address, value);
            } else {
              const value =
                instruction.size === 2
                  ? signExtend(this.bus.read16(address), 2)
                  : this.bus.read32(address) | 0;
              this.writeRegister(registerIndex, value);
            }
            if (!predecrement) address = (address + instruction.size) >>> 0;
          }
          if (predecrement || postincrement) this.state.a[instruction.register] = address | 0;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
        case 'exg': {
          const source =
            instruction.registerKind === 'address-address'
              ? this.state.a[instruction.sourceRegister]
              : this.state.d[instruction.sourceRegister];
          const destination =
            instruction.registerKind === 'data-data'
              ? this.state.d[instruction.destinationRegister]
              : this.state.a[instruction.destinationRegister];
          if (instruction.registerKind === 'address-address') {
            this.state.a[instruction.sourceRegister] = destination;
            this.state.a[instruction.destinationRegister] = source;
          } else if (instruction.registerKind === 'data-data') {
            this.state.d[instruction.sourceRegister] = destination;
            this.state.d[instruction.destinationRegister] = source;
          } else {
            this.state.d[instruction.sourceRegister] = destination;
            this.state.a[instruction.destinationRegister] = source;
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 6 };
        }
        case 'ext': {
          const value =
            instruction.size === 2
              ? signExtend(this.state.d[instruction.register], 1)
              : signExtend(this.state.d[instruction.register], 2);
          const destination = resolveEffectiveAddress(0, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'write',
          });
          destination.write(value);
          this.state.ccr = logicResult(value, instruction.size, this.state.ccr).ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 4 };
        }
        case 'swap': {
          const value = this.state.d[instruction.register] >>> 0;
          const result = ((value << 16) | (value >>> 16)) >>> 0;
          this.state.d[instruction.register] = result | 0;
          this.state.ccr = logicResult(result, 4, this.state.ccr).ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 4 };
        }
        case 'register-shift': {
          const count =
            instruction.count.kind === 'register'
              ? this.state.d[instruction.count.register] & 0x3f
              : instruction.count.value;
          const destination = resolveEffectiveAddress(0, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: 'readwrite',
          });
          const result = this.shiftRegisterValue(
            destination.read(),
            instruction.size,
            count,
            instruction.operation
          );
          destination.write(result.value);
          this.state.ccr = result.ccr;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 6 + count * 2 };
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
        case 'rtd': {
          if (this.cpuModel !== 'm68010') {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'RTD requires the MC68010 extension profile',
              vector: 4,
            });
          }
          const displacement = stream.readSignedWord();
          const restoredPc = this.pop32();
          this.state.a[7] = ((this.state.a[7] >>> 0) + displacement) | 0;
          this.state.pc = restoredPc & 0x00ff_ffff;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 16 };
        }
        case 'move-from-ccr': {
          if (this.cpuModel !== 'm68010') {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'MOVE from CCR requires the MC68010 extension profile',
              vector: 4,
            });
          }
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
              message: 'Illegal destination for MOVE from CCR',
              vector: 4,
            });
          }
          const destination = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: 2,
            access: 'write',
          });
          destination.write(this.state.ccr);
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 8 };
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
            return this.faultResult(
              {
                code: 'chk-exception',
                message: `CHK value ${checked} is outside 0..${upperBound}`,
                vector: 6,
              },
              stream.cursor
            );
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
            return this.faultResult(
              {
                code: 'trapv',
                message: 'TRAPV overflow exception',
                vector: 7,
              },
              stream.cursor
            );
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
          return this.faultResult(
            {
              code: 'trap',
              message: `TRAP #${instruction.vector}`,
              vector: 32 + instruction.vector,
            },
            nextPc
          );
        case 'rte':
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'RTE requires supervisor mode',
              vector: 8,
            });
          }
          {
            const restoredSr = this.pop16();
            const restoredPc = this.pop32();
            this.state.sr = restoredSr;
            this.state.pc = restoredPc & 0x00ff_ffff;
            return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 20 };
          }
        case 'unimplemented':
          if ((instruction.opcode & 0xf000) === 0xa000) {
            return this.faultResult({
              code: 'line-a-emulator',
              message: `Line-A opcode ${instruction.opcode.toString(16).padStart(4, '0')}`,
              vector: 10,
            });
          }
          if ((instruction.opcode & 0xf000) === 0xf000) {
            return this.faultResult({
              code: 'line-f-emulator',
              message: `Line-F opcode ${instruction.opcode.toString(16).padStart(4, '0')}`,
              vector: 11,
            });
          }
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
