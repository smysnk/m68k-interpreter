import { describe, expect, it } from 'vitest';
import {
  enterInterruptStatus,
  getInterruptMaskLevel,
  getStatusRegisterCCR,
  isInterruptLevelEligible,
  isSupervisorMode,
  setStatusRegisterCCR,
} from './statusRegister';

describe('status register helpers', () => {
  it('updates CCR without losing supervisor or interrupt-mask state', () => {
    const next = setStatusRegisterCCR(0x2500, 0x15);
    expect(next).toBe(0x2515);
    expect(getStatusRegisterCCR(next)).toBe(0x15);
    expect(isSupervisorMode(next)).toBe(true);
    expect(getInterruptMaskLevel(next)).toBe(5);
  });

  it('enters an interrupt by clearing trace and setting supervisor and mask', () => {
    expect(enterInterruptStatus(0x8004, 3)).toBe(0x2304);
  });

  it('honors mask priority while always allowing level seven', () => {
    expect(isInterruptLevelEligible(0x0500, 4)).toBe(false);
    expect(isInterruptLevelEligible(0x0500, 6)).toBe(true);
    expect(isInterruptLevelEligible(0x0700, 7)).toBe(true);
  });
});
