import { describe, expect, it } from 'vitest';
import { M68000_ISA_MANIFEST, summarizeIsaCoverage } from './manifest';
import { MC68020_EXTENSION_LEGALITY, isMc68020ExtensionLegal } from './mc68020Inventory';

describe('MC68020 conformance denominator', () => {
  it('contains no missing or audit-pending forms', () => {
    const forms = M68000_ISA_MANIFEST.filter((form) => form.minimumCpuModel === 'm68020');
    expect(forms).toHaveLength(40);
    expect(forms.filter((form) => form.support === 'missing')).toEqual([]);
    expect(forms.filter((form) => form.support === 'integrated-needs-audit')).toEqual([]);
    expect(summarizeIsaCoverage().byCpuModel.m68020).toBe(40);
  });

  it.each(MC68020_EXTENSION_LEGALITY)('exhaustively classifies $family extension words', (rule) => {
    let legal = 0;
    for (let extension = 0; extension <= 0xffff; extension += 1) {
      if (isMc68020ExtensionLegal(rule, extension)) legal += 1;
    }
    expect(legal).toBeGreaterThan(0);
    expect(legal).toBeLessThan(0x1_0000);
  });
});
