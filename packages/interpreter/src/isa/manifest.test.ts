import { describe, expect, it } from 'vitest';
import { M68000_ISA_MANIFEST, summarizeIsaCoverage, validateIsaManifest } from './manifest';

describe('MC68000 ISA manifest', () => {
  it('contains unique and structurally valid instruction forms', () => {
    expect(validateIsaManifest()).toEqual([]);
  });

  it('classifies strict, extension, and compatibility behavior explicitly', () => {
    expect(
      M68000_ISA_MANIFEST.find((instruction) => instruction.id === 'rtd.displacement')
    ).toMatchObject({
      minimumProfile: 'm68010',
      support: 'extension-only',
    });
    expect(
      M68000_ISA_MANIFEST.find((instruction) => instruction.id === 'mode.easy68k-pseudo')
    ).toMatchObject({
      minimumProfile: 'easy68k',
      support: 'compatibility-only',
    });
    expect(
      M68000_ISA_MANIFEST.find((instruction) => instruction.id === 'illegal.implied')
    ).toMatchObject({
      minimumProfile: 'm68000',
      support: 'conformant',
    });
  });

  it('covers the complete strict mnemonic inventory targeted by the plan', () => {
    const strictMnemonics = new Set(
      M68000_ISA_MANIFEST.filter((instruction) => instruction.minimumProfile === 'm68000').map(
        (instruction) => instruction.mnemonic
      )
    );

    for (const mnemonic of ['ABCD', 'SBCD', 'NBCD', 'MOVE', 'ILLEGAL', 'TAS', 'TRAPV']) {
      expect(strictMnemonics.has(mnemonic)).toBe(true);
    }
  });

  it('produces stable support totals for generated reporting', () => {
    const summary = summarizeIsaCoverage();

    expect(summary.totalForms).toBe(M68000_ISA_MANIFEST.length);
    expect(summary.uniqueMnemonics).toBeGreaterThan(50);
    expect(summary.byProfile.m68000).toBeGreaterThan(100);
    expect(summary.byProfile.m68010).toBe(2);
    expect(summary.byProfile.easy68k).toBe(1);
    expect(summary.bySupport['legacy-only']).toBe(0);
    expect(summary.bySupport['strict-core-partial']).toBe(0);
    expect(summary.bySupport['integrated-needs-audit']).toBe(0);
    expect(summary.bySupport.missing).toBe(0);
    expect(summary.bySupport.conformant).toBe(summary.byProfile.m68000);
    expect(Object.values(summary.bySupport).reduce((total, count) => total + count, 0)).toBe(
      summary.totalForms
    );
  });
});
