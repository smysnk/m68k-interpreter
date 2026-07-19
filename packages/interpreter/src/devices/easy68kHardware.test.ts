import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  Easy68kHardware,
  getEasy68kDisplayAddress,
  getEasy68kInterruptVectorAddress,
  validateEasy68kHardwareConfig,
} from './easy68kHardware';

describe('Easy68kHardware', () => {
  it('keeps shared LED writes and switch reads direction-aware', () => {
    const hardware = new Easy68kHardware();
    hardware.setToggle(7, true);
    hardware.setToggle(0, true);

    expect(hardware.writeByte(0xe00010, 0x3c)).toBe(true);
    expect(hardware.readByte(0xe00010)).toBe(0x81);
    expect(hardware.getSnapshot().leds).toBe(0x3c);
  });

  it('reads momentary buttons as active-low inputs', () => {
    const hardware = new Easy68kHardware();
    expect(hardware.readByte(0xe00012)).toBe(0xff);
    hardware.setButton(3, true);
    expect(hardware.readByte(0xe00012)).toBe(0xf7);
    hardware.setButton(3, false);
    expect(hardware.readByte(0xe00012)).toBe(0xff);
  });

  it('maps all eight display digits at successive even addresses', () => {
    const hardware = new Easy68kHardware();
    for (let index = 0; index < 8; index += 1) {
      expect(hardware.writeByte(getEasy68kDisplayAddress(0xe00000, index), index + 1)).toBe(true);
    }
    expect(hardware.getSnapshot().display).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hardware.writeByte(0xe00001, 0xff)).toBe(false);
    expect(hardware.readByte(0x1234)).toBeUndefined();
  });

  it('validates even display bases and same-direction conflicts', () => {
    expect(validateEasy68kHardwareConfig(DEFAULT_EASY68K_HARDWARE_CONFIG).valid).toBe(true);
    expect(
      validateEasy68kHardwareConfig({
        ...DEFAULT_EASY68K_HARDWARE_CONFIG,
        displayBase: 0xe00001,
      }).errors
    ).toContain('The seven-segment base address must be even.');
    expect(
      validateEasy68kHardwareConfig({
        ...DEFAULT_EASY68K_HARDWARE_CONFIG,
        ledAddress: 0xe00000,
      }).conflicts
    ).toHaveLength(1);
  });

  it('computes the level autovector addresses', () => {
    expect(getEasy68kInterruptVectorAddress(1)).toBe(0x64);
    expect(getEasy68kInterruptVectorAddress(7)).toBe(0x7c);
  });
});
