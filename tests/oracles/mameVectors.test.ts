import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMameVectorFile } from './mameVectors';

describe('pinned MAME M68000 vector corpus', () => {
  it('decodes NOP state and bus transactions from the binary corpus', () => {
    const bytes = new Uint8Array(
      readFileSync(resolve('references/m68000-vectors/v1/NOP.json.bin'))
    );
    const result = decodeMameVectorFile(bytes, { limit: 5 });

    expect(result.declaredCount).toBeGreaterThan(1000);
    expect(result.vectors).toHaveLength(5);
    for (const vector of result.vectors) {
      expect(vector.name).toContain('NOP');
      expect(vector.initial.ram.length).toBeGreaterThan(0);
      expect(vector.final.registers.pc).toBeTypeOf('number');
      expect(vector.cycles).toBeGreaterThan(0);
      expect(vector.transactions.length).toBeGreaterThan(0);
    }
  });

  it('rejects data without the corpus file header', () => {
    expect(() => decodeMameVectorFile(Uint8Array.of(0, 1, 2, 3))).toThrow(
      'Unexpected MAME vector file magic'
    );
  });
});
