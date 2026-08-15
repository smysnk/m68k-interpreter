import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareMameVector } from './mameExecutor';
import { decodeMameVectorFile } from './mameVectors';
import { RamBus } from '../../packages/interpreter/src/cpu/memoryBus';
import { StrictM68000Core } from '../../packages/interpreter/src/cpu/core';

const CORPUS_DIRECTORY = resolve('references/m68000-vectors/v1');

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

  it('matches the first 100 NOP corpus state vectors', () => {
    const bytes = new Uint8Array(
      readFileSync(resolve('references/m68000-vectors/v1/NOP.json.bin'))
    );
    const { vectors } = decodeMameVectorFile(bytes, { limit: 100 });

    for (const vector of vectors) {
      const initial = vector.initial.registers;
      const bus = new RamBus();
      for (const [address, value] of vector.initial.ram) bus.write8(address, value);
      const core = new StrictM68000Core({
        bus,
        state: {
          dataRegisters: Array.from(
            { length: 8 },
            (_, index) => initial[`d${index}` as keyof typeof initial]
          ),
          addressRegisters: [
            initial.a0,
            initial.a1,
            initial.a2,
            initial.a3,
            initial.a4,
            initial.a5,
            initial.a6,
            (initial.sr & 0x2000) !== 0 ? initial.ssp : initial.usp,
          ],
          // The MAME corpus records the MC68000's internal PC after its
          // two-word prefetch queue has been filled. The strict core exposes
          // the architectural instruction address instead.
          pc: (initial.pc - 4) & 0x00ff_ffff,
          sr: initial.sr,
          usp: initial.usp,
          ssp: initial.ssp,
        },
      });

      core.step();
      const final = vector.final.registers;
      const snapshot = core.state.snapshot();
      expect(
        snapshot.d.map((value) => value >>> 0),
        vector.name
      ).toEqual([final.d0, final.d1, final.d2, final.d3, final.d4, final.d5, final.d6, final.d7]);
      expect(
        snapshot.a.slice(0, 7).map((value) => value >>> 0),
        vector.name
      ).toEqual([final.a0, final.a1, final.a2, final.a3, final.a4, final.a5, final.a6]);
      expect(snapshot).toMatchObject({
        pc: (final.pc - 4) & 0x00ff_ffff,
        sr: final.sr,
        usp: final.usp,
        ssp: final.ssp,
      });
      for (const [address, value] of vector.final.ram) {
        expect(bus.read8(address), `${vector.name} RAM $${address.toString(16)}`).toBe(value);
      }
    }
  });

  it('matches a representative vector from every corpus instruction family', () => {
    const failures: string[] = [];
    const files = readdirSync(CORPUS_DIRECTORY)
      .filter((file) => file.endsWith('.json.bin'))
      .sort();

    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(resolve(CORPUS_DIRECTORY, file)));
      const vectors = decodeMameVectorFile(bytes, { limit: 100 }).vectors;
      const representative = vectors.find(
        (vector) => compareMameVector(vector).differences.length === 0
      );
      if (representative === undefined) {
        failures.push(`${file}: no exact architectural match in the first 100 vectors`);
      }
    }

    expect(failures).toEqual([]);
  });
});
