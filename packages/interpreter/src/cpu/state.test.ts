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
});
