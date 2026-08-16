import type { CpuModel } from '../isa/types';
import { createAddressSpacePolicy, type AddressSpacePolicy } from './addressSpace';

const SUPERVISOR_FLAG = 0x2000;
const MASTER_FLAG = 0x1000;
const STATUS_REGISTER_MASK: Readonly<Record<CpuModel, number>> = {
  m68000: 0xa71f,
  m68010: 0xa71f,
  m68020: 0xf71f,
};

export interface M68kCpuStateOptions {
  cpuModel?: CpuModel;
  dataRegisters?: ArrayLike<number>;
  addressRegisters?: ArrayLike<number>;
  pc?: number;
  sr?: number;
  usp?: number;
  ssp?: number;
  isp?: number;
  msp?: number;
  vbr?: number;
  sfc?: number;
  dfc?: number;
  cacr?: number;
  caar?: number;
}

/** @deprecated Use M68kCpuStateOptions. */
export type M68000StateOptions = M68kCpuStateOptions;

export interface CpuStateSnapshot {
  version?: 1 | 2;
  d: number[];
  a: number[];
  pc: number;
  sr: number;
  usp: number;
  ssp: number;
  isp?: number;
  msp?: number;
  vbr: number;
  sfc: number;
  dfc: number;
  cacr?: number;
  caar?: number;
}

type StackBank = 'usp' | 'isp' | 'msp';

export class M68kCpuState {
  readonly d = new Int32Array(8);
  readonly a = new Int32Array(8);
  readonly cpuModel: CpuModel;
  readonly addressSpace: AddressSpacePolicy;
  pc: number;
  private statusRegister: number;
  usp: number;
  isp: number;
  msp: number;
  vbr: number;
  sfc: number;
  dfc: number;
  cacr: number;
  caar: number;

  constructor(options: M68kCpuStateOptions = {}) {
    this.cpuModel = options.cpuModel ?? 'm68000';
    this.addressSpace = createAddressSpacePolicy(this.cpuModel);
    if (options.dataRegisters !== undefined) {
      this.d.set(Array.from(options.dataRegisters).slice(0, 8));
    }
    if (options.addressRegisters !== undefined) {
      this.a.set(Array.from(options.addressRegisters).slice(0, 8));
    }
    this.pc = options.pc ?? 0;
    this.statusRegister = (options.sr ?? 0x2700) & STATUS_REGISTER_MASK[this.cpuModel];
    this.usp = options.usp ?? 0;
    this.isp = options.isp ?? options.ssp ?? this.a[7];
    this.msp = options.msp ?? this.isp;
    this.vbr = options.vbr ?? 0;
    this.sfc = (options.sfc ?? 0) & 0x7;
    this.dfc = (options.dfc ?? 0) & 0x7;
    this.cacr = options.cacr ?? 0;
    this.caar = options.caar ?? 0;
    this.a[7] = this.readBank(this.activeStackBank()) | 0;
  }

  private activeStackBank(sr = this.statusRegister): StackBank {
    if ((sr & SUPERVISOR_FLAG) === 0) return 'usp';
    if (this.cpuModel === 'm68020' && (sr & MASTER_FLAG) !== 0) return 'msp';
    return 'isp';
  }

  private readBank(bank: StackBank): number {
    return bank === 'usp' ? this.usp : bank === 'msp' ? this.msp : this.isp;
  }

  private writeBank(bank: StackBank, value: number): void {
    if (bank === 'usp') this.usp = value >>> 0;
    else if (bank === 'msp') this.msp = value >>> 0;
    else this.isp = value >>> 0;
  }

  private storedBankValue(bank: StackBank): number {
    return this.activeStackBank() === bank ? this.a[7] >>> 0 : this.readBank(bank) >>> 0;
  }

  get sr(): number {
    return this.statusRegister;
  }

  set sr(value: number) {
    const previousBank = this.activeStackBank();
    const next = value & STATUS_REGISTER_MASK[this.cpuModel];
    const nextBank = this.activeStackBank(next);
    if (previousBank !== nextBank) {
      this.writeBank(previousBank, this.a[7] >>> 0);
      this.a[7] = this.readBank(nextBank) | 0;
    }
    this.statusRegister = next;
  }

  /** Compatibility view of the interrupt-supervisor stack. */
  get ssp(): number {
    return this.storedBankValue('isp');
  }

  set ssp(value: number) {
    this.isp = value >>> 0;
    if (this.activeStackBank() === 'isp') this.a[7] = value | 0;
  }

  isSupervisor(): boolean {
    return (this.statusRegister & SUPERVISOR_FLAG) !== 0;
  }

  isMaster(): boolean {
    return (
      this.cpuModel === 'm68020' &&
      this.isSupervisor() &&
      (this.statusRegister & MASTER_FLAG) !== 0
    );
  }

  get ccr(): number {
    return this.statusRegister & 0x1f;
  }

  set ccr(value: number) {
    this.statusRegister = (this.statusRegister & 0xffe0) | (value & 0x1f);
  }

  snapshot(target?: CpuStateSnapshot): CpuStateSnapshot {
    const snapshot = target ?? {
      version: 2,
      d: new Array<number>(8),
      a: new Array<number>(8),
      pc: 0,
      sr: 0,
      usp: 0,
      ssp: 0,
      isp: 0,
      msp: 0,
      vbr: 0,
      sfc: 0,
      dfc: 0,
      cacr: 0,
      caar: 0,
    };
    for (let index = 0; index < 8; index += 1) {
      snapshot.d[index] = this.d[index];
      snapshot.a[index] = this.a[index];
    }
    snapshot.version = 2;
    snapshot.pc = this.pc >>> 0;
    snapshot.sr = this.sr;
    const activeBank = this.activeStackBank();
    snapshot.usp = activeBank === 'usp' ? this.a[7] >>> 0 : this.usp >>> 0;
    snapshot.isp = activeBank === 'isp' ? this.a[7] >>> 0 : this.isp >>> 0;
    snapshot.msp = activeBank === 'msp' ? this.a[7] >>> 0 : this.msp >>> 0;
    snapshot.ssp = snapshot.isp;
    snapshot.vbr = this.vbr >>> 0;
    snapshot.sfc = this.sfc & 0x7;
    snapshot.dfc = this.dfc & 0x7;
    snapshot.cacr = this.cacr >>> 0;
    snapshot.caar = this.caar >>> 0;
    return snapshot;
  }

  restore(snapshot: CpuStateSnapshot): void {
    this.d.set(snapshot.d);
    this.a.set(snapshot.a);
    this.pc = snapshot.pc >>> 0;
    this.statusRegister = snapshot.sr & STATUS_REGISTER_MASK[this.cpuModel];
    this.usp = snapshot.usp >>> 0;
    this.isp = (snapshot.isp ?? snapshot.ssp) >>> 0;
    this.msp = (snapshot.msp ?? snapshot.ssp) >>> 0;
    this.vbr = snapshot.vbr >>> 0;
    this.sfc = snapshot.sfc & 0x7;
    this.dfc = snapshot.dfc & 0x7;
    this.cacr = (snapshot.cacr ?? 0) >>> 0;
    this.caar = (snapshot.caar ?? 0) >>> 0;
    this.a[7] = this.readBank(this.activeStackBank()) | 0;
  }
}

/** @deprecated Use M68kCpuState. */
export class M68000State extends M68kCpuState {}
