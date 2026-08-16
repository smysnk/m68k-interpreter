const SUPERVISOR_FLAG = 0x2000;
const STATUS_REGISTER_MASK = 0xa71f;

export interface M68000StateOptions {
  dataRegisters?: ArrayLike<number>;
  addressRegisters?: ArrayLike<number>;
  pc?: number;
  sr?: number;
  usp?: number;
  ssp?: number;
  vbr?: number;
  sfc?: number;
  dfc?: number;
}

export interface CpuStateSnapshot {
  d: number[];
  a: number[];
  pc: number;
  sr: number;
  usp: number;
  ssp: number;
  vbr: number;
  sfc: number;
  dfc: number;
}

export class M68000State {
  readonly d = new Int32Array(8);
  readonly a = new Int32Array(8);
  pc: number;
  private statusRegister: number;
  usp: number;
  ssp: number;
  vbr: number;
  sfc: number;
  dfc: number;

  constructor(options: M68000StateOptions = {}) {
    if (options.dataRegisters !== undefined) {
      this.d.set(Array.from(options.dataRegisters).slice(0, 8));
    }
    if (options.addressRegisters !== undefined) {
      this.a.set(Array.from(options.addressRegisters).slice(0, 8));
    }
    this.pc = options.pc ?? 0;
    this.statusRegister = (options.sr ?? 0x2700) & STATUS_REGISTER_MASK;
    this.usp = options.usp ?? 0;
    this.ssp = options.ssp ?? this.a[7];
    this.vbr = options.vbr ?? 0;
    this.sfc = (options.sfc ?? 0) & 0x7;
    this.dfc = (options.dfc ?? 0) & 0x7;
    this.a[7] = this.isSupervisor() ? this.ssp : this.usp;
  }

  get sr(): number {
    return this.statusRegister;
  }

  set sr(value: number) {
    const wasSupervisor = this.isSupervisor();
    const next = value & STATUS_REGISTER_MASK;
    const willBeSupervisor = (next & SUPERVISOR_FLAG) !== 0;

    if (wasSupervisor !== willBeSupervisor) {
      if (wasSupervisor) {
        this.ssp = this.a[7] >>> 0;
        this.a[7] = this.usp;
      } else {
        this.usp = this.a[7] >>> 0;
        this.a[7] = this.ssp;
      }
    }

    this.statusRegister = next;
  }

  isSupervisor(): boolean {
    return (this.statusRegister & SUPERVISOR_FLAG) !== 0;
  }

  get ccr(): number {
    return this.statusRegister & 0x1f;
  }

  set ccr(value: number) {
    this.statusRegister = (this.statusRegister & 0xffe0) | (value & 0x1f);
  }

  snapshot(target?: CpuStateSnapshot): CpuStateSnapshot {
    const snapshot = target ?? {
      d: new Array<number>(8),
      a: new Array<number>(8),
      pc: 0,
      sr: 0,
      usp: 0,
      ssp: 0,
      vbr: 0,
      sfc: 0,
      dfc: 0,
    };
    for (let index = 0; index < 8; index += 1) {
      snapshot.d[index] = this.d[index];
      snapshot.a[index] = this.a[index];
    }
    snapshot.pc = this.pc >>> 0;
    snapshot.sr = this.sr;
    snapshot.usp = (this.isSupervisor() ? this.usp : this.a[7]) >>> 0;
    snapshot.ssp = (this.isSupervisor() ? this.a[7] : this.ssp) >>> 0;
    snapshot.vbr = this.vbr >>> 0;
    snapshot.sfc = this.sfc & 0x7;
    snapshot.dfc = this.dfc & 0x7;
    return snapshot;
  }

  restore(snapshot: CpuStateSnapshot): void {
    this.d.set(snapshot.d);
    this.a.set(snapshot.a);
    this.pc = snapshot.pc >>> 0;
    this.statusRegister = snapshot.sr & STATUS_REGISTER_MASK;
    this.usp = snapshot.usp >>> 0;
    this.ssp = snapshot.ssp >>> 0;
    this.vbr = snapshot.vbr >>> 0;
    this.sfc = snapshot.sfc & 0x7;
    this.dfc = snapshot.dfc & 0x7;
    this.a[7] = this.isSupervisor() ? this.ssp : this.usp;
  }
}
