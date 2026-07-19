import { describe, expect, it } from 'vitest';
import {
  findDeviceAddressConflicts,
  normalizeDeviceAddress,
  parseDeviceAddress,
} from './deviceAddressMap';

describe('deviceAddressMap', () => {
  it('normalizes numeric and textual addresses to the 24-bit bus', () => {
    expect(normalizeDeviceAddress(0x12e00010)).toBe(0xe00010);
    expect(parseDeviceAddress('$E00010')).toBe(0xe00010);
    expect(parseDeviceAddress('0xe00010')).toBe(0xe00010);
    expect(parseDeviceAddress('not-hex')).toBeUndefined();
  });

  it('accepts opposite-direction overlap and rejects same-direction overlap', () => {
    expect(
      findDeviceAddressConflicts([
        { device: 'leds', direction: 'write', addresses: [0xe00010] },
        { device: 'switches', direction: 'read', addresses: [0xe00010] },
      ])
    ).toEqual([]);
    expect(
      findDeviceAddressConflicts([
        { device: 'leds', direction: 'write', addresses: [0xe00010] },
        { device: 'display', direction: 'write', addresses: [0xe00010] },
      ])
    ).toEqual([
      {
        address: 0xe00010,
        direction: 'write',
        devices: ['leds', 'display'],
      },
    ]);
  });
});
