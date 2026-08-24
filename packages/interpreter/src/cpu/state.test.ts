import { describe, expect, it } from 'vitest';
import { M68000State } from './state';

describe('MC68000 register state', () => {
  it('masks unimplemented status-register bits on writes', () => {
    const state = new M68000State({ sr: 0x2000 });

    state.sr = 0xffff;

    expect(state.sr).toBe(0xa71f);
  });

  it('reports the active A7 value through the selected stack-pointer bank', () => {
    const state = new M68000State({ sr: 0x2000, usp: 0x1000, ssp: 0x2000 });
    state.a[7] = 0x1ff0;
    expect(state.snapshot()).toMatchObject({ usp: 0x1000, ssp: 0x1ff0 });

    state.sr = 0;
    state.a[7] = 0x0ff0;
    expect(state.snapshot()).toMatchObject({ usp: 0x0ff0, ssp: 0x1ff0 });
  });

  it('snapshots and restores MC68010 control state without reallocating a checkpoint', () => {
    const state = new M68000State({ vbr: 0x1234_0000, sfc: 9, dfc: 6 });
    const checkpoint = state.snapshot();
    state.vbr = 0;
    state.sfc = 0;
    state.dfc = 0;

    expect(state.snapshot(checkpoint)).toBe(checkpoint);
    expect(checkpoint).toMatchObject({ vbr: 0, sfc: 0, dfc: 0 });

    state.restore({ ...checkpoint, vbr: 0x1234_0000, sfc: 7, dfc: 6 });
    expect(state.snapshot()).toMatchObject({ vbr: 0x1234_0000, sfc: 7, dfc: 6 });
  });

  it('switches independently between MC68020 user, interrupt, and master stacks', () => {
    const state = new M68000State({
      cpuModel: 'm68020',
      sr: 0,
      usp: 0x1000,
      isp: 0x2000,
      msp: 0x3000,
    });
    state.a[7] = 0x1010;
    state.sr = 0x2000;
    expect(state.a[7] >>> 0).toBe(0x2000);
    state.a[7] = 0x2020;
    state.sr = 0x3000;
    expect(state.a[7] >>> 0).toBe(0x3000);
    state.a[7] = 0x3030;
    state.sr = 0;
    expect(state.a[7] >>> 0).toBe(0x1010);
    expect(state.snapshot()).toMatchObject({ usp: 0x1010, isp: 0x2020, msp: 0x3030 });
  });

  it('round trips MC68020 cache and stack-bank state through versioned snapshots', () => {
    const state = new M68000State({
      cpuModel: 'm68020',
      sr: 0x3000,
      isp: 0x2000,
      msp: 0x3000,
      cacr: 9,
      caar: 0x1234,
    });
    const snapshot = state.snapshot();
    expect(snapshot).toMatchObject({ version: 2, isp: 0x2000, msp: 0x3000, cacr: 9 });
    state.restore({ ...snapshot, cacr: 0xf, caar: 0xfc });
    expect(state.snapshot()).toMatchObject({ cacr: 0xf, caar: 0xfc });
  });
});
