import type { ProgramImage } from '../assembler/programImage';
import type { CpuFault, StepResult } from '../core/execution';
import { evaluateBranchCondition } from './conditions';
import { decodeBinaryInstruction } from './decoder';
import { BusFault, type MemoryBus, RamBus } from './memoryBus';
import { M68000State, type M68000StateOptions } from './state';

const FLAG_X = 0x10;
const FLAG_N = 0x08;
const FLAG_Z = 0x04;

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
