import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveDecodedInstruction } from './instructionDecoder';
import { loadProgramSource } from './programLoader';

const nibblesPath = fileURLToPath(
  new URL('../../../packages/ide/src/fixtures/nibbles.asm', import.meta.url)
);

function readBytes(memory: Record<number, number>, address: number, length: number): number[] {
  return Array.from({ length }, (_, index) => memory[address + index] ?? 0);
}

describe('loadProgramSource', () => {
  it('normalizes labels, END labels, EQU constants, DS directives, and mixed DC.B data', () => {
    const source = `CONST EQU $10
START
  MOVEA.L #MSG,A1
MSG DC.B 'H',"I",0
BUFFER DS.W CONST
END START
`;

    const result = loadProgramSource(source);

    expect(result.exception).toBeUndefined();
    expect(result.codeLabels.START).toBe(1);
    expect(result.codeLabelLookup.start).toBe(1);
    expect(result.decodedInstructions[1]?.operation).toBe('movea');
    expect(result.decodedInstructions[1]?.operandsResolved).toBe(false);
    expect(
      resolveDecodedInstruction(result.decodedInstructions[1]!, result.symbolLookup).operands
    ).toHaveLength(2);
    expect(result.symbols.START).toBe(0);
    expect(result.symbols.MSG).toBe(4);
    expect(result.symbols.BUFFER).toBe(7);
    expect(result.endPointer).toEqual([5, 6]);
    expect(readBytes(result.memoryImage, result.symbols.MSG, 3)).toEqual([72, 73, 0]);
    expect(result.memoryImage[result.symbols.BUFFER]).toBe(0);
    expect(result.memoryImage[result.symbols.BUFFER + 31]).toBe(0);
  });

  it('loads nibbles.asm from bytes and emits stable symbol addresses plus a readable splash string', () => {
    const sourceBytes = new Uint8Array(readFileSync(nibblesPath));
    const result = loadProgramSource(sourceBytes);

    expect(result.exception).toBeUndefined();
    expect(result.errors).toEqual([]);
    expect(result.endPointer).toBeDefined();
    expect(result.decodedInstructions.length).toBe(result.instructions.length);
    expect(result.symbols.SCORE).toBe(result.symbols.RAND_MEM + 2);
    expect(result.symbols.SNK_SCR).toBe(result.symbols.TIMER + 4);
    expect(result.symbols.STR_SPLASH_SCR).toBeGreaterThan(result.symbols.SNK_SCR);
    expect(readBytes(result.memoryImage, result.symbols.STR_ESC, 3)).toEqual([0x1b, 0x5b, 0x00]);
    expect(readBytes(result.memoryImage, result.symbols.STR_SPLASH_SCR, 7)).toEqual([
      0x1b,
      0x5b,
      0x32,
      0x4a,
      0x1b,
      0x5b,
      0x32,
    ]);
  });
});
