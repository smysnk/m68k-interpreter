export interface Mc68020ExtensionLegalityRule {
  readonly family: string;
  readonly mask: number;
  readonly value: number;
  readonly notes: string;
}

/** Extension-word reserved-bit rules derived from the MC68020 instruction encodings. */
export const MC68020_EXTENSION_LEGALITY: readonly Mc68020ExtensionLegalityRule[] = [
  { family: 'bitfield-alter', mask: 0xf000, value: 0, notes: 'BFCHG/BFCLR/BFSET reserve destination-register bits.' },
  { family: 'bitfield-result', mask: 0x8000, value: 0, notes: 'Extract, insert, and find-first-one reserve bit 15.' },
  { family: 'cas', mask: 0xfe38, value: 0, notes: 'Only compare and update data-register fields are variable.' },
  { family: 'cas2-word-1', mask: 0x0e38, value: 0, notes: 'Each CAS2 extension word carries Rn, Du, and Dc.' },
  { family: 'cas2-word-2', mask: 0x0e38, value: 0, notes: 'Each CAS2 extension word carries Rn, Du, and Dc.' },
  { family: 'chk2', mask: 0x07ff, value: 0, notes: 'General-register, signedness, and trap-select fields only.' },
  { family: 'cmp2', mask: 0x0fff, value: 0, notes: 'General-register and signedness fields only.' },
  { family: 'mull', mask: 0x83f8, value: 0, notes: 'Destination pair, signedness, and width fields only.' },
  { family: 'divl', mask: 0x83f8, value: 0, notes: 'Quotient/remainder pair, signedness, and width fields only.' },
] as const;

export function isMc68020ExtensionLegal(rule: Mc68020ExtensionLegalityRule, extension: number): boolean {
  return Number.isInteger(extension) && extension >= 0 && extension <= 0xffff &&
    (extension & rule.mask) === rule.value;
}
