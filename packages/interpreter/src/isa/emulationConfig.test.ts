import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMULATION_CONFIG,
  normalizeEmulationConfig,
  toLegacyCpuProfile,
} from './emulationConfig';

describe('emulation configuration', () => {
  it('keeps the existing default behavior', () => {
    expect(normalizeEmulationConfig()).toEqual(DEFAULT_EMULATION_CONFIG);
  });

  it.each([
    ['m68000', { cpuModel: 'm68000', machineProfile: 'bare' }],
    ['m68010', { cpuModel: 'm68010', machineProfile: 'bare' }],
    ['easy68k', { cpuModel: 'm68000', machineProfile: 'easy68k' }],
  ] as const)('maps legacy %s without changing behavior', (legacy, expected) => {
    expect(normalizeEmulationConfig(undefined, legacy)).toEqual(expected);
  });

  it('normalizes both axes independently', () => {
    expect(normalizeEmulationConfig({ cpuModel: 'm68010', machineProfile: 'easy68k' })).toEqual({
      cpuModel: 'm68010',
      machineProfile: 'easy68k',
    });
  });

  it('does not invent a legacy value for MC68010 plus Easy68K', () => {
    expect(toLegacyCpuProfile({ cpuModel: 'm68010', machineProfile: 'easy68k' })).toBeUndefined();
  });
});
