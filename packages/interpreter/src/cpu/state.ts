const SUPERVISOR_FLAG = 0x2000;

export interface M68000StateOptions {
  dataRegisters?: ArrayLike<number>;
  addressRegisters?: ArrayLike<number>;
  pc?: number;
  sr?: number;
  usp?: number;
  ssp?: number;
}

export class M68000State {
  readonly d = new Int32Array(8);
  readonly a = new Int32Array(8);
  pc: number;
  private statusRegister: number;
  usp: number;
  ssp: number;

  constructor(options: M68000StateOptions = {}) {
    if (options.dataRegisters !== undefined) {
      this.d.set(Array.from(options.dataRegisters).slice(0, 8));
    }
    if (options.addressRegisters !== undefined) {
      this.a.set(Array.from(options.addressRegisters).slice(0, 8));
    }
    this.pc = options.pc ?? 0;
    this.statusRegister = options.sr ?? 0x2700;
    this.usp = options.usp ?? 0;
    this.ssp = options.ssp ?? this.a[7];
    this.a[7] = this.isSupervisor() ? this.ssp : this.usp;
  }

  get sr(): number {
    return this.statusRegister;
  }

  set sr(value: number) {
    const wasSupervisor = this.isSupervisor();
    const next = value & 0xffff;
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

  snapshot(): {
    d: number[];
    a: number[];
    pc: number;
    sr: number;
    usp: number;
    ssp: number;
  } {
    return {
      d: Array.from(this.d),
      a: Array.from(this.a),
      pc: this.pc >>> 0,
      sr: this.sr,
      usp: this.usp >>> 0,
      ssp: this.ssp >>> 0,
    };
  }
}
