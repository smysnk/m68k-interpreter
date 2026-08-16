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
});
