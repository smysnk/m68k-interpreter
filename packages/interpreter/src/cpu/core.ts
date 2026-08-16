import type { ProgramImage } from '../assembler/programImage';
import type { CpuFault, StepResult } from '../core/execution';
import { cpuSupports, getCpuCapabilities, type CpuCapabilities } from '../isa/cpuCapabilities';
import type { CoprocessorId, CpuModel } from '../isa/types';
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
import {
  controlRegisterFromSelector,
  maskControlRegisterValue,
  type M68kControlRegister,
} from './controlRegisters';
import { createAddressSpacePolicy, type AddressSpacePolicy } from './addressSpace';
import {
  AddressTranslationFault,
  TranslatingMemoryBus,
  type AddressTranslationPort,
} from './addressTranslation';
import {
  CoprocessorRegistry,
  type CoprocessorDevice,
  type CoprocessorStateSnapshot,
} from './coprocessor';
import { decodeBinaryInstruction, type DecodedBinaryInstruction } from './decoder';
import {
  classifyEffectiveAddress,
  isEffectiveAddressAllowed,
  resolveEffectiveAddress,
} from './effectiveAddress';
import { InstructionStream } from './instructionStream';
import { NO_MODULE_ACCESS, type ModuleAccessPort } from './moduleAccess';
import { decodeExceptionFrame, encodeExceptionFrame } from './exceptionFrames';
import {
  SUPERVISOR_DATA_READ,
  SUPERVISOR_DATA_WRITE,
  SUPERVISOR_PROGRAM_FETCH,
  USER_DATA_READ,
  USER_DATA_WRITE,
  USER_PROGRAM_FETCH,
  BusFault,
  type BusAccessContext,
  type BusFunctionCode,
  type MemoryBus,
  RamBus,
  SparseRamBus,
} from './memoryBus';
import { M68kCpuState, type CpuStateSnapshot, type M68kCpuStateOptions } from './state';

const FUNCTION_CODE_READ = Array.from(
  { length: 8 },
  (_, functionCode) =>
    ({ operation: 'read', functionCode: functionCode as BusFunctionCode }) as const
);
const FUNCTION_CODE_WRITE = Array.from(
  { length: 8 },
  (_, functionCode) =>
    ({ operation: 'write', functionCode: functionCode as BusFunctionCode }) as const
);

export interface StrictM68000CoreOptions {
  bus?: MemoryBus;
  state?: M68kCpuStateOptions;
  cpuModel?: CpuModel;
  coprocessors?: readonly CoprocessorDevice[];
  moduleAccess?: ModuleAccessPort;
  addressTranslator?: AddressTranslationPort;
  /** @deprecated Use cpuModel. */
  profile?: CpuModel;
}

export interface M68kSystemSnapshot {
  readonly version: 1;
  readonly cpuModel: CpuModel;
  readonly cpu: CpuStateSnapshot;
  readonly coprocessors: Readonly<Record<number, CoprocessorStateSnapshot>>;
  readonly addressTranslation?: ReturnType<AddressTranslationPort['snapshot']>;
  readonly execution: {
    readonly stopped: boolean;
    readonly pendingInterruptLevel: number;
    readonly programEndAddress?: number;
  };
}

export class StrictM68000Core {
  readonly bus: MemoryBus;
  readonly state: M68kCpuState;
  readonly cpuModel: CpuModel;
  readonly capabilities: CpuCapabilities;
  readonly addressSpace: AddressSpacePolicy;
  readonly coprocessors: CoprocessorRegistry;
  readonly moduleAccess: ModuleAccessPort;
  readonly addressTranslator: AddressTranslationPort | undefined;
  step: () => StepResult;
  private readonly isM68020: boolean;
  private readonly addressMask: number;
  private stopped = false;
  private pendingInterruptLevel = 0;
  private programEndAddress: number | undefined;
  private readonly decodeCache = new Map<
    number,
    {
      opcode: number;
      extension: number;
      extension2: number;
      instruction: DecodedBinaryInstruction;
      requiresTransaction: boolean;
    }
  >();
  private readonly instructionCheckpoint: CpuStateSnapshot = {
    d: new Array<number>(8).fill(0),
    a: new Array<number>(8).fill(0),
    pc: 0,
    sr: 0,
    usp: 0,
    ssp: 0,
    vbr: 0,
    sfc: 0,
    dfc: 0,
  };
  private instructionTransactionActive = false;
  private instructionTransaction: unknown;

  constructor(options: StrictM68000CoreOptions = {}) {
    this.cpuModel = options.cpuModel ?? options.profile ?? 'm68000';
    this.isM68020 = this.cpuModel === 'm68020';
    this.capabilities = getCpuCapabilities(this.cpuModel);
    this.addressSpace = createAddressSpacePolicy(this.cpuModel);
    this.addressMask = this.addressSpace.mask;
    const physicalBus =
      options.bus ??
      (this.cpuModel === 'm68020'
        ? new SparseRamBus(this.addressSpace)
        : new RamBus({ addressSpace: this.addressSpace }));
    this.bus = options.addressTranslator
      ? new TranslatingMemoryBus(physicalBus, options.addressTranslator)
      : physicalBus;
    this.addressTranslator = options.addressTranslator;
    this.state = new M68kCpuState({ ...options.state, cpuModel: this.cpuModel });
    this.coprocessors = new CoprocessorRegistry(options.coprocessors);
    this.moduleAccess = options.moduleAccess ?? NO_MODULE_ACCESS;
    this.step = this.executeStep;
  }

  loadProgram(image: ProgramImage): void {
    const segments = image.segments ?? [{ address: image.loadAddress, bytes: image.bytes }];
    for (const segment of segments) {
      if (this.bus.load !== undefined) this.bus.load(segment.address, segment.bytes);
      else segment.bytes.forEach((byte, offset) => this.bus.write8(segment.address + offset, byte));
    }
    this.state.pc = this.addressSpace.normalize(image.entryPoint);
    this.programEndAddress = this.addressSpace.normalize(image.endAddress);
  }

  normalizeAddress(address: number): number {
    return this.addressSpace.normalize(address);
  }

  invalidateInstructionCache(address?: number): void {
    if (address === undefined) this.decodeCache.clear();
    else this.decodeCache.delete(this.addressSpace.normalize(address) & ~1);
  }

  snapshotSystem(): M68kSystemSnapshot {
    return Object.freeze({
      version: 1,
      cpuModel: this.cpuModel,
      cpu: this.state.snapshot(),
      coprocessors: this.coprocessors.snapshot(),
      addressTranslation: this.addressTranslator?.snapshot(),
      execution: Object.freeze({
        stopped: this.stopped,
        pendingInterruptLevel: this.pendingInterruptLevel,
        programEndAddress: this.programEndAddress,
      }),
    });
  }

  restoreSystem(snapshot: M68kSystemSnapshot): void {
    if (snapshot.version !== 1 || snapshot.cpuModel !== this.cpuModel) {
      throw new Error(
        `Cannot restore ${snapshot.cpuModel} system snapshot into ${this.cpuModel} core`
      );
    }
    if (snapshot.addressTranslation !== undefined) {
      if (this.addressTranslator === undefined) {
        throw new Error('Cannot restore address-translation state without an attached translator');
      }
      if (this.addressTranslator.device !== snapshot.addressTranslation.device) {
        throw new Error(
          `Address translator ${this.addressTranslator.device} does not match snapshot device ${snapshot.addressTranslation.device}`
        );
      }
    }
    this.state.restore(snapshot.cpu);
    this.coprocessors.restore(snapshot.coprocessors);
    if (snapshot.addressTranslation !== undefined) {
      this.addressTranslator?.restore(snapshot.addressTranslation);
    }
    this.stopped = snapshot.execution.stopped;
    this.pendingInterruptLevel = snapshot.execution.pendingInterruptLevel;
    this.programEndAddress = snapshot.execution.programEndAddress;
    this.instructionTransactionActive = false;
    this.instructionTransaction = undefined;
    this.step = this.executeStep;
    this.invalidateInstructionCache();
  }

  private fetchAccess(): BusAccessContext {
    return this.state.isSupervisor() ? SUPERVISOR_PROGRAM_FETCH : USER_PROGRAM_FETCH;
  }

  private dataReadAccess(): BusAccessContext {
    return this.state.isSupervisor() ? SUPERVISOR_DATA_READ : USER_DATA_READ;
  }

  private dataWriteAccess(): BusAccessContext {
    return this.state.isSupervisor() ? SUPERVISOR_DATA_WRITE : USER_DATA_WRITE;
  }

  private vectorAddress(vector: number): number {
    const base = this.capabilities.hasVectorBaseRegister ? this.state.vbr : 0;
    return this.addressSpace.add(base, vector * 4);
  }

  private pushNormalExceptionFrame(vector: number, stackedPc: number, oldSr: number): void {
    if (this.capabilities.exceptionFrameFamily !== 'm68000') this.push16(vector << 2);
    this.push32(stackedPc >>> 0);
    this.push16(oldSr);
  }

  private pushFaultExceptionFrame(
    vector: number,
    stackedPc: number,
    oldSr: number,
    fault: BusFault
  ): void {
    if (this.capabilities.exceptionFrameFamily === 'm68000') {
      this.pushNormalExceptionFrame(vector, stackedPc, oldSr);
      return;
    }

    const functionCode =
      fault.functionCode ??
      (fault.access === 'fetch'
        ? this.fetchAccess().functionCode
        : fault.access === 'write'
          ? this.dataWriteAccess().functionCode
          : this.dataReadAccess().functionCode) ??
      0;
    const frame = encodeExceptionFrame({
      cpuModel: this.cpuModel,
      vector,
      statusRegister: oldSr,
      programCounter: stackedPc,
      faultAddress: fault.address,
      functionCode,
      write: fault.access === 'write',
      instruction: fault.access === 'fetch',
    });
    const frameAddress = ((this.state.a[7] >>> 0) - frame.length) >>> 0;
    this.state.a[7] = frameAddress | 0;
    for (let offset = 0; offset < frame.length; offset += 1) {
      this.bus.write8(frameAddress + offset, frame[offset], this.dataWriteAccess());
    }
  }

  private faultResult(fault: CpuFault, stackedPc = this.state.pc, busFault?: BusFault): StepResult {
    if (fault.vector !== undefined) {
      const snapshot = this.state.snapshot();
      const wasStopped = this.stopped;
      try {
        const oldSr = this.state.sr;
        this.state.sr = (oldSr | 0x2000) & 0x7fff & (this.cpuModel === 'm68020' ? ~0x1000 : 0xffff);
        if (busFault !== undefined) {
          this.pushFaultExceptionFrame(fault.vector, stackedPc, oldSr, busFault);
        } else {
          this.pushNormalExceptionFrame(fault.vector, stackedPc, oldSr);
        }
        this.state.pc = this.addressSpace.normalize(
          this.bus.read32(this.vectorAddress(fault.vector), this.fetchAccess())
        );
        this.stopped = false;
      } catch (error) {
        // A fault while building an exception frame would halt a physical
        // MC68000. Preserve the original structured fault for the caller.
        this.state.restore(snapshot);
        this.stopped = wasStopped;
        if (this.capabilities.hasRestartableFaults && error instanceof BusFault) throw error;
      }
    }
    return {
      kind: 'exception',
      pc: this.state.pc,
      fault,
    };
  }

  private busFaultResult(error: BusFault, stackedPc = this.state.pc): StepResult {
    return this.faultResult(
      {
        code: error.code,
        message: error.message,
        vector: error.code === 'address-error' ? 3 : 2,
        address: error.address,
        origin: { kind: 'machine-bus' },
      },
      stackedPc,
      error
    );
  }

  private push32(value: number): void {
    this.state.a[7] = (this.state.a[7] - 4) | 0;
    this.bus.write32(this.state.a[7] >>> 0, value, this.dataWriteAccess());
  }

  private push16(value: number): void {
    this.state.a[7] = (this.state.a[7] - 2) | 0;
    this.bus.write16(this.state.a[7] >>> 0, value, this.dataWriteAccess());
  }

  private pop32(): number {
    const value = this.bus.read32(this.state.a[7] >>> 0, this.dataReadAccess());
    this.state.a[7] = (this.state.a[7] + 4) | 0;
    return value;
  }

  private pop16(): number {
    const value = this.bus.read16(this.state.a[7] >>> 0, this.dataReadAccess());
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

    if (this.capabilities.hasRestartableFaults) this.beginInstructionTransaction();
    this.pendingInterruptLevel = 0;
    const oldSr = this.state.sr;
    this.state.sr = ((oldSr | 0x2000) & 0x78ff) | (level << 8);
    this.pushNormalExceptionFrame(24 + level, this.state.pc, oldSr);
    this.state.pc = this.addressSpace.normalize(
      this.bus.read32(this.vectorAddress(24 + level), this.fetchAccess())
    );
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

  private readControlRegister(register: M68kControlRegister): number {
    switch (register) {
      case 'sfc':
        return this.state.sfc;
      case 'dfc':
        return this.state.dfc;
      case 'usp':
        return this.state.usp >>> 0;
      case 'vbr':
        return this.state.vbr >>> 0;
      case 'cacr':
        return this.state.cacr >>> 0;
      case 'caar':
        return this.state.caar >>> 0;
      case 'msp':
        return this.state.msp >>> 0;
      case 'isp':
        return this.state.isp >>> 0;
    }
  }

  private writeControlRegister(register: M68kControlRegister, value: number): void {
    const masked = maskControlRegisterValue(register, value);
    switch (register) {
      case 'sfc':
        this.state.sfc = masked;
        break;
      case 'dfc':
        this.state.dfc = masked;
        break;
      case 'usp':
        this.state.usp = masked;
        break;
      case 'vbr':
        this.state.vbr = masked;
        break;
      case 'cacr':
        if ((masked & 0x0008) !== 0) this.invalidateInstructionCache();
        if ((masked & 0x0004) !== 0) this.invalidateInstructionCache(this.state.caar);
        this.state.cacr = masked & 0x0003;
        break;
      case 'caar':
        this.state.caar = masked;
        break;
      case 'msp':
        this.state.msp = masked;
        break;
      case 'isp':
        this.state.isp = masked;
        break;
    }
  }

  private instructionRequiresTransaction(instruction: DecodedBinaryInstruction): boolean {
    const directOrImmediate = (mode: number, register: number): boolean => {
      const eaClass = classifyEffectiveAddress(mode, register);
      return (
        eaClass === 'data-register' || eaClass === 'address-register' || eaClass === 'immediate'
      );
    };

    switch (instruction.kind) {
      case 'nop':
      case 'moveq':
      case 'dbcc':
      case 'register-shift':
      case 'exg':
      case 'ext':
      case 'swap':
      case 'immediate-status':
      case 'movec':
      case 'stop':
      case 'reset':
        return false;
      case 'rtd':
      case 'rts':
      case 'rte':
      case 'illegal':
      case 'trap':
      case 'trapv':
      case 'unimplemented':
      case 'bkpt':
        return true;
      case 'branch':
        return instruction.condition === 'bsr';
      case 'move':
        return !(
          directOrImmediate(instruction.sourceMode, instruction.sourceRegister) &&
          directOrImmediate(instruction.destinationMode, instruction.destinationRegister)
        );
      case 'movea':
        return !directOrImmediate(instruction.sourceMode, instruction.sourceRegister);
      case 'binary-alu':
      case 'address-alu':
      case 'immediate-data':
      case 'quick':
      case 'unary':
      case 'unary-extend':
      case 'multiply-divide':
      case 'chk':
      case 'tas':
      case 'scc':
      case 'bit':
        return !directOrImmediate(instruction.mode, instruction.register);
      case 'rotate-extend':
        return instruction.memory;
      case 'move-status':
      case 'move-from-ccr':
        return !directOrImmediate(instruction.mode, instruction.register);
      default:
        return true;
    }
  }

  private beginInstructionTransaction(): void {
    if (this.instructionTransactionActive) return;
    this.state.snapshot(this.instructionCheckpoint);
    this.instructionTransactionActive = true;
    this.instructionTransaction = this.bus.beginInstructionTransaction?.();
    this.step = this.commitTransactionThenExecuteStep;
  }

  private commitTransactionThenExecuteStep(): StepResult {
    this.bus.commitInstructionTransaction?.(this.instructionTransaction);
    this.instructionTransactionActive = false;
    this.instructionTransaction = undefined;
    this.step = this.executeStep;
    return this.executeStep();
  }

  private beginRestartableInstructionForSelectedModel(): void {
    if (this.capabilities.hasRestartableFaults) this.beginInstructionTransaction();
  }

  private decodeAndCacheInstruction(
    address: number,
    opcode: number,
    extension: number,
    extension2: number
  ): {
    opcode: number;
    extension: number;
    extension2: number;
    instruction: DecodedBinaryInstruction;
    requiresTransaction: boolean;
  } {
    const instructionBytes = Uint8Array.of(
      (opcode >>> 8) & 0xff,
      opcode & 0xff,
      (extension >>> 8) & 0xff,
      extension & 0xff,
      (extension2 >>> 8) & 0xff,
      extension2 & 0xff
    );
    const instruction = decodeBinaryInstruction(instructionBytes, 0, this.cpuModel);
    const entry = {
      opcode,
      extension,
      extension2,
      instruction,
      requiresTransaction: this.instructionRequiresTransaction(instruction),
    };
    if (this.cpuModel !== 'm68020' || (this.state.cacr & 1) !== 0) {
      this.decodeCache.set(address, entry);
    }
    return entry;
  }

  /**
   * Keep the optional MC68020 coprocessor protocol outside the legacy
   * instruction dispatcher. Besides keeping the device boundary explicit,
   * this lets V8 continue optimizing the hot MC68000/MC68010 dispatch path.
   */
  private executeCoprocessorInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'coprocessor' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const longBranch = instruction.operation === 'branch' && ((instruction.opcode >>> 6) & 7) === 3;
    const extensionWords: number[] = [];
    let commandWord: number;
    let branchDisplacement: number | undefined;
    let conditionalOperand: number | undefined;
    let coprocessorEa:
      | {
          readonly mode: number;
          readonly register: number;
          readonly address: number;
          read(length: number): Uint8Array;
          write(bytes: Uint8Array): void;
        }
      | undefined;
    if (instruction.operation === 'branch') {
      commandWord = instruction.opcode & 0x3f;
      const highOrWord = stream.readWord();
      extensionWords.push(highOrWord);
      if (longBranch) {
        const low = stream.readWord();
        extensionWords.push(low);
        branchDisplacement = (highOrWord << 16) | low | 0;
      } else {
        branchDisplacement = signExtend(highOrWord, 2);
      }
    } else if (instruction.operation === 'save' || instruction.operation === 'restore') {
      commandWord = 0;
    } else {
      commandWord = stream.readWord();
      extensionWords.push(commandWord);
      if (instruction.operation === 'decrement-branch') {
        const displacement = stream.readWord();
        extensionWords.push(displacement);
        branchDisplacement = signExtend(displacement, 2);
      } else if (instruction.operation === 'trap-condition') {
        const operandWords = instruction.register === 2 ? 1 : instruction.register === 3 ? 2 : 0;
        if (operandWords === 1) {
          conditionalOperand = stream.readWord();
          extensionWords.push(conditionalOperand);
        } else if (operandWords === 2) {
          const high = stream.readWord();
          const low = stream.readWord();
          extensionWords.push(high, low);
          conditionalOperand = ((high << 16) | low) >>> 0;
        }
      }
    }
    if (
      instruction.operation === 'save' ||
      instruction.operation === 'restore' ||
      instruction.operation === 'set-condition'
    ) {
      const operand = resolveEffectiveAddress(instruction.mode, instruction.register, {
        state: this.state,
        bus: this.bus,
        stream,
        size: 1,
        access: instruction.operation === 'set-condition' ? 'write' : 'address',
        addressSpace: this.addressSpace,
      });
      const address = operand.resolveAddress();
      coprocessorEa = {
        mode: instruction.mode,
        register: instruction.register,
        address,
        read: (length) =>
          Uint8Array.from({ length }, (_, offset) =>
            this.bus.read8(this.addressSpace.add(address, offset), this.dataReadAccess())
          ),
        write: (bytes) => {
          bytes.forEach((byte, offset) =>
            this.bus.write8(this.addressSpace.add(address, offset), byte, this.dataWriteAccess())
          );
        },
      };
    }
    const result = this.coprocessors.execute(
      {
        id: instruction.coprocessorId as CoprocessorId,
        operation: instruction.operation,
        commandWord,
        extensionWords,
        instructionAddress: pcBefore,
        functionCode: this.fetchAccess().functionCode ?? 6,
        supervisor: this.state.isSupervisor(),
        effectiveAddress: coprocessorEa,
      },
      this.cpuModel
    );
    if (result.kind === 'exception') {
      return this.faultResult(
        {
          code: 'coprocessor-exception',
          message: result.message,
          vector: result.vector,
          origin: {
            kind: 'coprocessor',
            slot: instruction.coprocessorId,
            device: this.coprocessors.get(instruction.coprocessorId as CoprocessorId)?.device,
          },
        },
        stream.cursor
      );
    }
    if (result.kind === 'protocol-violation') {
      return this.faultResult(
        {
          code: 'coprocessor-protocol',
          message: result.message,
          vector: 11,
          origin: {
            kind: 'coprocessor',
            slot: instruction.coprocessorId,
            device: this.coprocessors.get(instruction.coprocessorId as CoprocessorId)?.device,
          },
        },
        stream.cursor
      );
    }
    if (result.kind === 'suspended') {
      return { kind: 'waiting', pc: pcBefore };
    }
    if (
      result.kind === 'operand-transfer' &&
      instruction.operation === 'save' &&
      coprocessorEa !== undefined
    ) {
      coprocessorEa.write(result.value);
    }
    if (result.kind === 'condition' && instruction.operation === 'set-condition') {
      coprocessorEa?.write(Uint8Array.of(result.true ? 0xff : 0));
    }
    if (result.kind === 'condition' && instruction.operation === 'decrement-branch') {
      if (!result.true) {
        const registerValue = this.state.d[instruction.register] >>> 0;
        const counter = ((registerValue & 0xffff) - 1) & 0xffff;
        this.state.d[instruction.register] = (registerValue & 0xffff_0000) | counter;
        if (counter !== 0xffff && branchDisplacement !== undefined) {
          this.state.pc = this.addressSpace.add(pcBefore + 2, branchDisplacement);
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
        }
      }
    }
    if (result.kind === 'condition' && instruction.operation === 'trap-condition' && result.true) {
      return this.faultResult(
        {
          code: 'coprocessor-trap',
          message: `Coprocessor conditional trap${conditionalOperand === undefined ? '' : ` operand $${conditionalOperand.toString(16)}`}`,
          vector: 7,
          origin: {
            kind: 'coprocessor',
            slot: instruction.coprocessorId,
            device: this.coprocessors.get(instruction.coprocessorId as CoprocessorId)?.device,
          },
        },
        stream.cursor
      );
    }
    if (
      result.kind === 'condition' &&
      instruction.operation === 'branch' &&
      result.true &&
      branchDisplacement !== undefined
    ) {
      this.state.pc = this.addressSpace.add(pcBefore + 2, branchDisplacement);
    } else {
      this.state.pc = stream.cursor;
    }
    return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 12 };
  }

  private executeBitfieldInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'bitfield' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const extension = stream.readWord();
    const destinationRegister = (extension >>> 12) & 7;
    const offsetValue =
      (extension & 0x0800) !== 0
        ? this.state.d[(extension >>> 6) & 7] | 0
        : (extension >>> 6) & 0x1f;
    const rawWidth = (extension & 0x0020) !== 0 ? this.state.d[extension & 7] : extension & 0x1f;
    const width = ((rawWidth - 1) & 0x1f) + 1;
    const writesField = ['bfchg', 'bfclr', 'bfset', 'bfins'].includes(instruction.operation);
    const registerOperand = instruction.mode === 0;
    if (
      registerOperand &&
      !isEffectiveAddressAllowed(instruction.mode, instruction.register, ['data-register'])
    ) {
      return this.faultResult({
        code: 'illegal-instruction',
        message: 'Illegal bitfield register operand',
        vector: 4,
      });
    }
    if (
      !registerOperand &&
      !isEffectiveAddressAllowed(
        instruction.mode,
        instruction.register,
        writesField
          ? ['address-indirect', 'displacement', 'indexed', 'absolute-short', 'absolute-long']
          : [
              'address-indirect',
              'displacement',
              'indexed',
              'absolute-short',
              'absolute-long',
              'pc-displacement',
              'pc-indexed',
            ]
      )
    ) {
      return this.faultResult({
        code: 'illegal-instruction',
        message: 'Illegal bitfield memory operand',
        vector: 4,
      });
    }

    let field = 0;
    const writeBits: Array<[address: number, mask: number, set: boolean]> = [];
    const sourceInsert = this.state.d[destinationRegister] >>> 0;
    if (registerOperand) {
      const value = this.state.d[instruction.register] >>> 0;
      const offset = offsetValue & 31;
      for (let bitIndex = 0; bitIndex < width; bitIndex += 1) {
        const sourceBit = (offset + bitIndex) & 31;
        field = (field * 2 + ((value >>> (31 - sourceBit)) & 1)) >>> 0;
      }
      if (writesField) {
        let result = value;
        for (let bitIndex = 0; bitIndex < width; bitIndex += 1) {
          const targetBit = (offset + bitIndex) & 31;
          const mask = (1 << (31 - targetBit)) >>> 0;
          const insertBit = (sourceInsert >>> (width - bitIndex - 1)) & 1;
          if (instruction.operation === 'bfchg') result = (result ^ mask) >>> 0;
          else if (instruction.operation === 'bfclr') result = (result & ~mask) >>> 0;
          else if (instruction.operation === 'bfset' || insertBit !== 0)
            result = (result | mask) >>> 0;
          else result = (result & ~mask) >>> 0;
        }
        this.state.d[instruction.register] = result | 0;
      }
    } else {
      const operand = resolveEffectiveAddress(instruction.mode, instruction.register, {
        state: this.state,
        bus: this.bus,
        stream,
        size: 1,
        access: writesField ? 'readwrite' : 'read',
        addressSpace: this.addressSpace,
      });
      const baseAddress = operand.resolveAddress();
      const byteOffset = Math.floor(offsetValue / 8);
      const bitOffset = ((offsetValue % 8) + 8) % 8;
      for (let bitIndex = 0; bitIndex < width; bitIndex += 1) {
        const absoluteBit = bitOffset + bitIndex;
        const address = this.addressSpace.add(
          baseAddress,
          byteOffset + Math.floor(absoluteBit / 8)
        );
        const mask = 1 << (7 - (absoluteBit & 7));
        const value = this.bus.read8(address, this.dataReadAccess());
        field = (field * 2 + ((value & mask) !== 0 ? 1 : 0)) >>> 0;
        if (writesField) {
          const insertBit = (sourceInsert >>> (width - bitIndex - 1)) & 1;
          writeBits.push([
            address,
            mask,
            instruction.operation === 'bfchg'
              ? (value & mask) === 0
              : instruction.operation === 'bfclr'
                ? false
                : instruction.operation === 'bfset' || insertBit !== 0,
          ]);
        }
      }
      const changedBytes = new Map<number, number>();
      for (const [address, mask, set] of writeBits) {
        const value = changedBytes.get(address) ?? this.bus.read8(address, this.dataReadAccess());
        changedBytes.set(address, set ? value | mask : value & ~mask);
      }
      for (const [address, value] of changedBytes)
        this.bus.write8(address, value, this.dataWriteAccess());
    }

    const fieldMask = width === 32 ? 0xffff_ffff : 2 ** width - 1;
    const normalizedField = width === 32 ? field >>> 0 : field & fieldMask;
    const flagSource =
      instruction.operation === 'bfins'
        ? width === 32
          ? sourceInsert >>> 0
          : sourceInsert & fieldMask
        : normalizedField;
    this.state.ccr =
      (this.state.ccr & FLAG_X) |
      (flagSource === 0 ? FLAG_Z : 0) |
      ((flagSource & (width === 32 ? 0x8000_0000 : 2 ** (width - 1))) !== 0 ? FLAG_N : 0);
    if (instruction.operation === 'bfextu') this.state.d[destinationRegister] = normalizedField | 0;
    else if (instruction.operation === 'bfexts') {
      const sign =
        width === 32
          ? normalizedField | 0
          : signExtend(normalizedField << (32 - width), 4) >> (32 - width);
      this.state.d[destinationRegister] = sign | 0;
    } else if (instruction.operation === 'bfffo') {
      let first = 0;
      while (first < width && (normalizedField & (2 ** (width - first - 1))) === 0) first += 1;
      this.state.d[destinationRegister] = (offsetValue + first) | 0;
    }
    this.state.pc = stream.cursor;
    return {
      kind: 'executed',
      pcBefore,
      pcAfter: this.state.pc,
      cycles: registerOperand ? 12 : 24,
    };
  }

  private executeCasInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'cas' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const extension = stream.readWord();
    if ((extension & 0xfe38) !== 0) {
      return this.faultResult({
        code: 'illegal-instruction',
        message: 'Reserved CAS extension bits',
        vector: 4,
      });
    }
    const compareRegister = extension & 7;
    const updateRegister = (extension >>> 6) & 7;
    const operand = resolveEffectiveAddress(instruction.mode, instruction.register, {
      state: this.state,
      bus: this.bus,
      stream,
      size: instruction.size,
      access: 'address',
      addressSpace: this.addressSpace,
    });
    const address = operand.resolveAddress();
    if (this.bus.atomicCompareExchange === undefined) {
      return this.faultResult({
        code: 'illegal-instruction',
        message: 'CAS requires an atomic memory bus',
        vector: 4,
      });
    }
    const atomic = this.bus.atomicCompareExchange(
      address,
      instruction.size,
      this.state.d[compareRegister],
      this.state.d[updateRegister],
      this.dataWriteAccess()
    );
    this.state.ccr = compareResult(
      atomic.value,
      this.state.d[compareRegister],
      instruction.size,
      this.state.ccr
    ).ccr;
    if (!atomic.exchanged) {
      const mask = instruction.size === 1 ? 0xff : instruction.size === 2 ? 0xffff : 0xffff_ffff;
      this.state.d[compareRegister] =
        instruction.size === 4
          ? atomic.value | 0
          : ((this.state.d[compareRegister] >>> 0) & ~mask) | (atomic.value & mask);
    }
    this.state.pc = stream.cursor;
    return {
      kind: 'executed',
      pcBefore,
      pcAfter: this.state.pc,
      cycles: atomic.exchanged ? 19 : 16,
    };
  }

  private executeCas2Instruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'cas2' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const extension = stream.readLong() >>> 0;
    if ((extension & 0x0e38_0e38) !== 0) {
      return this.faultResult({
        code: 'illegal-instruction',
        message: 'Reserved CAS2 extension bits',
        vector: 4,
      });
    }
    const compare1 = (extension >>> 16) & 7;
    const update1 = (extension >>> 22) & 7;
    const addressRegister1 = (extension >>> 28) & 0xf;
    const compare2 = extension & 7;
    const update2 = (extension >>> 6) & 7;
    const addressRegister2 = (extension >>> 12) & 0xf;
    const address1 = this.readRegister(addressRegister1) >>> 0;
    const address2 = this.readRegister(addressRegister2) >>> 0;
    const read = (address: number): number =>
      instruction.size === 2
        ? this.bus.read16(address, this.dataReadAccess())
        : this.bus.read32(address, this.dataReadAccess());
    const write = (address: number, value: number): void =>
      instruction.size === 2
        ? this.bus.write16(address, value, this.dataWriteAccess())
        : this.bus.write32(address, value, this.dataWriteAccess());
    const value1 = read(address1);
    const value2 = read(address2);
    const first = compareResult(value1, this.state.d[compare1], instruction.size, this.state.ccr);
    this.state.ccr = first.ccr;
    const firstEqual = (first.ccr & FLAG_Z) !== 0;
    const second = firstEqual
      ? compareResult(value2, this.state.d[compare2], instruction.size, this.state.ccr)
      : undefined;
    if (second !== undefined) this.state.ccr = second.ccr;
    const equal = firstEqual && second !== undefined && (second.ccr & FLAG_Z) !== 0;
    if (equal) {
      write(address1, this.state.d[update1]);
      write(address2, this.state.d[update2]);
    } else {
      const assign = (register: number, value: number): void => {
        this.state.d[register] =
          instruction.size === 4
            ? value | 0
            : (this.state.d[register] & 0xffff_0000) | (value & 0xffff);
      };
      assign(compare1, value1);
      assign(compare2, value2);
    }
    this.state.pc = stream.cursor;
    return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: equal ? 28 : 24 };
  }

  private executeChk2Cmp2Instruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'chk2-cmp2' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const extension = stream.readWord();
    const generalRegister = (extension >>> 12) & 0xf;
    const unsigned = (extension & 0x8000) !== 0;
    const trap = (extension & 0x0800) !== 0;
    const operand = resolveEffectiveAddress(instruction.mode, instruction.register, {
      state: this.state,
      bus: this.bus,
      stream,
      size: instruction.size,
      access: 'address',
      addressSpace: this.addressSpace,
    });
    const address = operand.resolveAddress();
    const read = (at: number): number =>
      instruction.size === 1
        ? this.bus.read8(at, this.dataReadAccess())
        : instruction.size === 2
          ? this.bus.read16(at, this.dataReadAccess())
          : this.bus.read32(at, this.dataReadAccess());
    const normalize = (value: number): number =>
      unsigned ? truncate(value, instruction.size) : signExtend(value, instruction.size);
    const lower = normalize(read(address));
    const upper = normalize(read(this.addressSpace.add(address, instruction.size)));
    const checked = normalize(this.readRegister(generalRegister));
    const outside =
      lower <= upper ? checked < lower || checked > upper : checked > upper || checked < lower;
    const equalBound = checked === lower || checked === upper;
    this.state.ccr =
      (this.state.ccr & ~(FLAG_C | FLAG_Z)) | (outside ? FLAG_C : 0) | (equalBound ? FLAG_Z : 0);
    if (trap && outside) {
      return this.faultResult(
        { code: 'chk-exception', message: 'CHK2 bounds exception', vector: 6 },
        stream.cursor
      );
    }
    this.state.pc = stream.cursor;
    return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 22 };
  }

  private executePackUnpkInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'pack-unpk' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const adjustment = stream.readSignedWord();
    const sourceRegister = instruction.sourceRegister;
    const destinationRegister = instruction.destinationRegister;
    if (!instruction.memory) {
      const source = this.state.d[sourceRegister] & 0xffff;
      const result =
        instruction.operation === 'pack'
          ? ((((source + adjustment) >>> 4) & 0xf0) | ((source + adjustment) & 0xf)) & 0xff
          : ((((source << 4) & 0x0f00) | (source & 0x0f)) + adjustment) & 0xffff;
      const mask = instruction.operation === 'pack' ? 0xffff_ff00 : 0xffff_0000;
      this.state.d[destinationRegister] =
        ((this.state.d[destinationRegister] >>> 0) & mask) | result;
    } else if (instruction.operation === 'pack') {
      const sourceStep = sourceRegister === 7 ? 2 : 1;
      this.state.a[sourceRegister] = ((this.state.a[sourceRegister] >>> 0) - sourceStep) | 0;
      const high = this.bus.read8(this.state.a[sourceRegister] >>> 0, this.dataReadAccess());
      this.state.a[sourceRegister] = ((this.state.a[sourceRegister] >>> 0) - sourceStep) | 0;
      const low = this.bus.read8(this.state.a[sourceRegister] >>> 0, this.dataReadAccess());
      const adjusted = (((high << 8) | low) + adjustment) & 0xffff;
      const packed = ((adjusted >>> 4) & 0xf0) | (adjusted & 0xf);
      const destinationStep = destinationRegister === 7 ? 2 : 1;
      this.state.a[destinationRegister] =
        ((this.state.a[destinationRegister] >>> 0) - destinationStep) | 0;
      this.bus.write8(this.state.a[destinationRegister] >>> 0, packed, this.dataWriteAccess());
    } else {
      const sourceStep = sourceRegister === 7 ? 2 : 1;
      this.state.a[sourceRegister] = ((this.state.a[sourceRegister] >>> 0) - sourceStep) | 0;
      const packed = this.bus.read8(this.state.a[sourceRegister] >>> 0, this.dataReadAccess());
      const unpacked = ((((packed << 4) & 0x0f00) | (packed & 0x0f)) + adjustment) & 0xffff;
      const destinationStep = destinationRegister === 7 ? 2 : 1;
      this.state.a[destinationRegister] =
        ((this.state.a[destinationRegister] >>> 0) - destinationStep) | 0;
      this.bus.write8(
        this.state.a[destinationRegister] >>> 0,
        unpacked >>> 8,
        this.dataWriteAccess()
      );
      this.state.a[destinationRegister] =
        ((this.state.a[destinationRegister] >>> 0) - destinationStep) | 0;
      this.bus.write8(this.state.a[destinationRegister] >>> 0, unpacked, this.dataWriteAccess());
    }
    this.state.pc = stream.cursor;
    return {
      kind: 'executed',
      pcBefore,
      pcAfter: this.state.pc,
      cycles: instruction.memory ? 13 : 8,
    };
  }

  private executeLongMultiplyDivideInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'long-multiply-divide' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const extension = stream.readWord();
    const signed = (extension & 0x0800) !== 0;
    const doubleWidth = (extension & 0x0400) !== 0;
    const lowRegister = (extension >>> 12) & 7;
    const highRegister = extension & 7;
    const source =
      resolveEffectiveAddress(instruction.mode, instruction.register, {
        state: this.state,
        bus: this.bus,
        stream,
        size: 4,
        access: 'read',
        addressSpace: this.addressSpace,
      }).read() >>> 0;
    const unsigned32 = (value: number): bigint => BigInt(value >>> 0);
    const signed32 = (value: number): bigint => BigInt(value | 0);
    const asUint32 = (value: bigint): number => Number(BigInt.asUintN(32, value)) >>> 0;

    if (instruction.operation === 'multiply') {
      const left = signed ? signed32(source) : unsigned32(source);
      const right = signed
        ? signed32(this.state.d[lowRegister])
        : unsigned32(this.state.d[lowRegister]);
      const product = left * right;
      const low = asUint32(product);
      const high = asUint32(product >> 32n);
      this.state.d[lowRegister] = low | 0;
      if (doubleWidth) this.state.d[highRegister] = high | 0;
      const overflow =
        !doubleWidth && (signed ? product !== BigInt.asIntN(32, product) : product > 0xffff_ffffn);
      this.state.ccr =
        (this.state.ccr & FLAG_X) |
        (overflow ? FLAG_V : 0) |
        (product === 0n ? FLAG_Z : 0) |
        ((doubleWidth ? (high & 0x8000_0000) !== 0 : (low & 0x8000_0000) !== 0) ? FLAG_N : 0);
    } else {
      const divisor = signed ? signed32(source) : unsigned32(source);
      if (divisor === 0n) {
        return this.faultResult(
          { code: 'divide-by-zero', message: 'divide by zero', vector: 5 },
          stream.cursor
        );
      }
      const dividend = doubleWidth
        ? signed
          ? BigInt.asIntN(
              64,
              (unsigned32(this.state.d[highRegister]) << 32n) |
                unsigned32(this.state.d[lowRegister])
            )
          : (unsigned32(this.state.d[highRegister]) << 32n) | unsigned32(this.state.d[lowRegister])
        : signed
          ? signed32(this.state.d[lowRegister])
          : unsigned32(this.state.d[lowRegister]);
      const quotient = dividend / divisor;
      const remainder = dividend % divisor;
      const overflow = signed
        ? quotient < -0x8000_0000n || quotient > 0x7fff_ffffn
        : quotient < 0n || quotient > 0xffff_ffffn;
      if (overflow) {
        this.state.ccr = (this.state.ccr & FLAG_X) | FLAG_V;
      } else {
        const quotient32 = asUint32(quotient);
        this.state.d[lowRegister] = quotient32 | 0;
        this.state.d[highRegister] = asUint32(remainder) | 0;
        this.state.ccr =
          (this.state.ccr & FLAG_X) |
          (quotient32 === 0 ? FLAG_Z : 0) |
          ((quotient32 & 0x8000_0000) !== 0 ? FLAG_N : 0);
      }
    }
    this.state.pc = stream.cursor;
    return {
      kind: 'executed',
      pcBefore,
      pcAfter: this.state.pc,
      cycles: instruction.operation === 'multiply' ? 43 : 84,
    };
  }

  private executeCallmInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'callm' }>,
    stream: InstructionStream,
    pcBefore: number
  ): StepResult {
    const module = stream.readWord() & 0xff;
    const target = resolveEffectiveAddress(instruction.mode, instruction.register, {
      state: this.state,
      bus: this.bus,
      stream,
      size: 4,
      access: 'address',
      addressSpace: this.addressSpace,
    }).resolveAddress();
    const result = this.moduleAccess.call({
      module,
      entryAddress: target,
      returnAddress: stream.cursor,
      stackPointer: this.state.a[7] >>> 0,
    });
    if (result.kind === 'exception') {
      return this.faultResult(
        { code: 'module-access', message: result.message, vector: result.vector },
        stream.cursor
      );
    }
    if (result.stackPointer !== undefined) this.state.a[7] = result.stackPointer | 0;
    this.state.pc = this.addressSpace.normalize(result.programCounter);
    return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 64 };
  }

  private executeRtmInstruction(
    instruction: Extract<DecodedBinaryInstruction, { kind: 'rtm' }>,
    pcBefore: number,
    nextPc: number
  ): StepResult {
    const result = this.moduleAccess.return({
      generalRegister: instruction.generalRegister,
      registerValue: this.readRegister(instruction.generalRegister),
      stackPointer: this.state.a[7] >>> 0,
    });
    if (result.kind === 'exception') {
      return this.faultResult(
        { code: 'module-access', message: result.message, vector: result.vector },
        nextPc
      );
    }
    if (result.stackPointer !== undefined) this.state.a[7] = result.stackPointer | 0;
    this.state.pc = this.addressSpace.normalize(result.programCounter);
    return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 19 };
  }

  private executeStep(): StepResult {
    try {
      const interrupt = this.servicePendingInterrupt();
      if (interrupt !== undefined) return interrupt;
    } catch (error) {
      if (error instanceof BusFault) {
        if (this.capabilities.hasRestartableFaults && this.instructionTransactionActive) {
          this.bus.rollbackInstructionTransaction?.(this.instructionTransaction);
          const stackedPc = this.instructionCheckpoint.pc;
          this.state.restore(this.instructionCheckpoint);
          this.instructionTransactionActive = false;
          this.instructionTransaction = undefined;
          this.step = this.executeStep;
          return this.busFaultResult(error, stackedPc);
        }
        return this.busFaultResult(error);
      }
      if (error instanceof AddressTranslationFault) {
        return this.faultResult({
          code: error.code,
          message: error.message,
          vector: error.vector,
          address: error.logicalAddress,
          origin: { kind: 'translator', device: this.addressTranslator?.device },
        });
      }
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
      const fetchAccess = this.fetchAccess();
      const instructionCacheHit =
        this.isM68020 && (this.state.cacr & 1) !== 0 ? this.decodeCache.get(pcBefore) : undefined;
      const opcode = instructionCacheHit?.opcode ?? this.bus.read16(pcBefore, fetchAccess);
      const needsExtension =
        opcode === 0x4e72 ||
        (opcode & 0xfffe) === 0x4e7a ||
        (opcode & 0xff00) === 0x0e00 ||
        ((opcode & 0xf000) === 0x6000 &&
          ((opcode & 0xff) === 0 || (this.isM68020 && (opcode & 0xff) === 0xff)));
      const extension =
        instructionCacheHit?.extension ??
        (needsExtension ? this.bus.read16(pcBefore + 2, fetchAccess) : 0);
      const extension2 =
        instructionCacheHit?.extension2 ??
        (this.isM68020 && (opcode & 0xf000) === 0x6000 && (opcode & 0xff) === 0xff
          ? this.bus.read16(pcBefore + 4, fetchAccess)
          : 0);
      const cached =
        instructionCacheHit ??
        (this.isM68020 && (this.state.cacr & 1) === 0 ? undefined : this.decodeCache.get(pcBefore));
      let instruction: DecodedBinaryInstruction;
      let requiresTransaction: boolean;
      if (
        cached?.opcode === opcode &&
        cached.extension === extension &&
        cached.extension2 === extension2
      ) {
        instruction = cached.instruction;
        requiresTransaction = cached.requiresTransaction;
      } else {
        const decoded = this.decodeAndCacheInstruction(pcBefore, opcode, extension, extension2);
        instruction = decoded.instruction;
        requiresTransaction = decoded.requiresTransaction;
      }
      if (requiresTransaction) {
        this.beginRestartableInstructionForSelectedModel();
      }
      const nextPc = ((pcBefore + instruction.length) & this.addressMask) >>> 0;
      const stream = new InstructionStream(
        this.bus,
        ((pcBefore + 2) & this.addressMask) >>> 0,
        fetchAccess,
        this.addressSpace
      );

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
        case 'extb': {
          const value = signExtend(this.state.d[instruction.register], 1);
          this.state.d[instruction.register] = value;
          this.state.ccr = logicResult(value, 4, this.state.ccr).ccr;
          this.state.pc = nextPc;
          return { kind: 'executed', pcBefore, pcAfter: nextPc, cycles: 4 };
        }
        case 'trapcc': {
          if (instruction.operandBytes === 2) stream.readWord();
          else if (instruction.operandBytes === 4) stream.readLong();
          if (evaluateConditionCode(instruction.condition, this.state.sr)) {
            return this.faultResult(
              { code: 'trapv-exception', message: 'TRAPcc condition is true', vector: 7 },
              stream.cursor
            );
          }
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 4 };
        }
        case 'branch': {
          const taken = evaluateBranchCondition(instruction.condition, this.state.sr);
          if (instruction.condition === 'bsr') {
            this.push32(nextPc);
          }
          this.state.pc = taken
            ? this.addressSpace.add(pcBefore + 2, instruction.displacement)
            : nextPc;
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
            decremented === 0xffff
              ? stream.cursor
              : this.addressSpace.add(pcBefore + 2, displacement);
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
        case 'bitfield':
          return this.executeBitfieldInstruction(instruction, stream, pcBefore);
        case 'cas':
          return this.executeCasInstruction(instruction, stream, pcBefore);
        case 'cas2':
          return this.executeCas2Instruction(instruction, stream, pcBefore);
        case 'chk2-cmp2':
          return this.executeChk2Cmp2Instruction(instruction, stream, pcBefore);
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
          const baseAllowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          const allowed =
            instruction.operation === 'cmp' && this.cpuModel === 'm68020'
              ? ([...baseAllowed, 'pc-displacement', 'pc-indexed'] as const)
              : baseAllowed;
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
          const baseAllowed = [
            'data-register',
            'address-indirect',
            'postincrement',
            'predecrement',
            'displacement',
            'indexed',
            'absolute-short',
            'absolute-long',
          ] as const;
          const allowed =
            instruction.operation === 'tst' && this.cpuModel === 'm68020'
              ? ([
                  ...baseAllowed,
                  'address-register',
                  'pc-displacement',
                  'pc-indexed',
                  'immediate',
                ] as const)
              : baseAllowed;
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
        case 'pack-unpk':
          return this.executePackUnpkInstruction(instruction, stream, pcBefore);
        case 'long-multiply-divide':
          return this.executeLongMultiplyDivideInstruction(instruction, stream, pcBefore);
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
            this.state.pc = this.addressSpace.normalize(resolvedAddress);
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
              if (instruction.size === 2) {
                this.bus.write16(address, value, this.dataWriteAccess());
              } else {
                this.bus.write32(address, value, this.dataWriteAccess());
              }
            } else {
              const value =
                instruction.size === 2
                  ? signExtend(this.bus.read16(address, this.dataReadAccess()), 2)
                  : this.bus.read32(address, this.dataReadAccess()) | 0;
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
        case 'link-long': {
          const displacement = stream.readLong() | 0;
          this.push32(this.state.a[instruction.register] >>> 0);
          this.state.a[instruction.register] = this.state.a[7];
          this.state.a[7] = ((this.state.a[7] >>> 0) + displacement) | 0;
          this.state.pc = stream.cursor;
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 6 };
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
          this.state.pc = this.addressSpace.normalize(restoredPc);
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 20 };
        }
        case 'rtd': {
          if (!cpuSupports(this.cpuModel, 'rtd')) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'RTD requires the MC68010 CPU model',
              vector: 4,
            });
          }
          const displacement = stream.readSignedWord();
          const restoredPc = this.pop32();
          this.state.a[7] = ((this.state.a[7] >>> 0) + displacement) | 0;
          this.state.pc = this.addressSpace.normalize(restoredPc);
          return { kind: 'executed', pcBefore, pcAfter: this.state.pc, cycles: 16 };
        }
        case 'callm':
          return this.executeCallmInstruction(instruction, stream, pcBefore);
        case 'rtm':
          return this.executeRtmInstruction(instruction, pcBefore, nextPc);
        case 'coprocessor':
          return this.executeCoprocessorInstruction(instruction, stream, pcBefore);
        case 'bkpt':
          if (!cpuSupports(this.cpuModel, 'bkpt')) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'BKPT requires the MC68010 CPU model',
              vector: 4,
            });
          }
          this.bus.breakpointAcknowledge?.(instruction.vector);
          return this.faultResult({
            code: 'illegal-instruction',
            message: `BKPT #${instruction.vector} breakpoint acknowledge was not externally handled`,
            vector: 4,
          });
        case 'movec': {
          if (!cpuSupports(this.cpuModel, 'movec')) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'MOVEC requires the MC68010 CPU model',
              vector: 4,
            });
          }
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'MOVEC requires supervisor mode',
              vector: 8,
            });
          }
          stream.readWord();
          const controlRegister = controlRegisterFromSelector(
            instruction.controlRegister,
            this.cpuModel
          );
          if (controlRegister === undefined) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: `Illegal ${this.cpuModel} control-register selector $${instruction.controlRegister
                .toString(16)
                .padStart(3, '0')}`,
              vector: 4,
            });
          }
          if (instruction.direction === 'control-to-register') {
            this.writeRegister(
              instruction.generalRegister,
              this.readControlRegister(controlRegister)
            );
          } else {
            this.writeControlRegister(
              controlRegister,
              this.readRegister(instruction.generalRegister)
            );
          }
          this.state.pc = stream.cursor;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles: instruction.direction === 'control-to-register' ? 12 : 10,
          };
        }
        case 'moves': {
          if (!cpuSupports(this.cpuModel, 'moves')) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'MOVES requires the MC68010 CPU model',
              vector: 4,
            });
          }
          if (!this.state.isSupervisor()) {
            return this.faultResult({
              code: 'privilege-violation',
              message: 'MOVES requires supervisor mode',
              vector: 8,
            });
          }
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
              message: 'MOVES requires a memory-alterable effective address',
              vector: 4,
            });
          }
          stream.readWord();
          const readContext = FUNCTION_CODE_READ[this.state.sfc];
          const writeContext = FUNCTION_CODE_WRITE[this.state.dfc];
          const operand = resolveEffectiveAddress(instruction.mode, instruction.register, {
            state: this.state,
            bus: this.bus,
            stream,
            size: instruction.size,
            access: instruction.direction === 'memory-to-register' ? 'read' : 'write',
            readContext,
            writeContext,
          });
          if (instruction.direction === 'memory-to-register') {
            const value = operand.read();
            if (instruction.generalRegister < 8) {
              const registerValue = this.state.d[instruction.generalRegister];
              this.state.d[instruction.generalRegister] =
                instruction.size === 4
                  ? value | 0
                  : instruction.size === 2
                    ? (registerValue & 0xffff_0000) | (value & 0xffff)
                    : (registerValue & 0xffff_ff00) | (value & 0xff);
            } else {
              this.state.a[instruction.generalRegister - 8] =
                instruction.size === 4 ? value | 0 : signExtend(value, instruction.size);
            }
          } else {
            let value = this.readRegister(instruction.generalRegister);
            const sameAddressRegister = instruction.generalRegister === instruction.register + 8;
            if (sameAddressRegister && (instruction.mode === 3 || instruction.mode === 4)) {
              const step =
                instruction.size === 1 && instruction.register === 7 ? 2 : instruction.size;
              value = instruction.mode === 3 ? value + step : value - step;
            }
            operand.write(value);
          }
          this.state.pc = stream.cursor;
          return {
            kind: 'executed',
            pcBefore,
            pcAfter: this.state.pc,
            cycles: instruction.size === 4 ? 22 : 18,
          };
        }
        case 'move-from-ccr': {
          if (!cpuSupports(this.cpuModel, 'move-from-ccr')) {
            return this.faultResult({
              code: 'illegal-instruction',
              message: 'MOVE from CCR requires the MC68010 CPU model',
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
          if (
            (instruction.direction === 'to-sr' ||
              (instruction.direction === 'from-sr' && this.cpuModel !== 'm68000')) &&
            !this.state.isSupervisor()
          ) {
            return this.faultResult({
              code: 'privilege-violation',
              message: `MOVE ${instruction.direction === 'from-sr' ? 'from' : 'to'} SR requires supervisor mode`,
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
          const address = this.addressSpace.add(
            this.state.a[instruction.addressRegister] >>> 0,
            displacement
          );
          if (instruction.direction === 'memory-to-register') {
            let value = 0;
            for (let index = 0; index < instruction.size; index += 1) {
              value =
                (value * 0x100 + this.bus.read8(address + index * 2, this.dataReadAccess())) >>> 0;
            }
            this.state.d[instruction.dataRegister] =
              instruction.size === 2
                ? (this.state.d[instruction.dataRegister] & 0xffff_0000) | value | 0
                : value | 0;
          } else {
            const value = this.state.d[instruction.dataRegister] >>> 0;
            for (let index = 0; index < instruction.size; index += 1) {
              const shift = (instruction.size - index - 1) * 8;
              this.bus.write8(address + index * 2, value >>> shift, this.dataWriteAccess());
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
            size: instruction.size,
            access: 'read',
          });
          const upperBound = signExtend(source.read(), instruction.size);
          const checked = signExtend(this.state.d[instruction.dataRegister], instruction.size);
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
          this.state.pc = this.addressSpace.normalize(this.pop32());
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
            if (this.capabilities.exceptionFrameFamily !== 'm68000') {
              const frameAddress = this.state.a[7] >>> 0;
              let frame;
              try {
                frame = decodeExceptionFrame(this.bus, frameAddress, this.cpuModel);
              } catch (error) {
                return this.faultResult({
                  code: 'format-error',
                  message: error instanceof Error ? error.message : 'Malformed exception frame',
                  vector: 14,
                });
              }
              this.state.a[7] = (frameAddress + frame.size) | 0;
              this.state.sr = frame.statusRegister;
              this.state.pc = this.addressSpace.normalize(frame.programCounter);
              return {
                kind: 'executed',
                pcBefore,
                pcAfter: this.state.pc,
                cycles: frame.format === 0 ? 20 : 38,
              };
            }
            const restoredSr = this.pop16();
            const restoredPc = this.pop32();
            this.state.sr = restoredSr;
            this.state.pc = this.addressSpace.normalize(restoredPc);
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
        if (this.capabilities.hasRestartableFaults && this.instructionTransactionActive) {
          this.bus.rollbackInstructionTransaction?.(this.instructionTransaction);
          const stackedPc = this.instructionCheckpoint.pc;
          this.state.restore(this.instructionCheckpoint);
          this.instructionTransactionActive = false;
          this.instructionTransaction = undefined;
          this.step = this.executeStep;
          return this.busFaultResult(error, stackedPc);
        }
        return this.busFaultResult(error);
      }
      if (error instanceof AddressTranslationFault) {
        if (this.capabilities.hasRestartableFaults && this.instructionTransactionActive) {
          this.bus.rollbackInstructionTransaction?.(this.instructionTransaction);
          const stackedPc = this.instructionCheckpoint.pc;
          this.state.restore(this.instructionCheckpoint);
          this.instructionTransactionActive = false;
          this.instructionTransaction = undefined;
          this.step = this.executeStep;
          return this.faultResult(
            {
              code: error.code,
              message: error.message,
              vector: error.vector,
              address: error.logicalAddress,
              origin: { kind: 'translator', device: this.addressTranslator?.device },
            },
            stackedPc
          );
        }
        return this.faultResult({
          code: error.code,
          message: error.message,
          vector: error.vector,
          address: error.logicalAddress,
          origin: { kind: 'translator', device: this.addressTranslator?.device },
        });
      }
      throw error;
    }
  }
}
