import { describe, expect, it } from 'vitest';
import { classifyOpcodeWord } from './opcodeClassifier';

describe('classifyOpcodeWord', () => {
  it('classifies every initial opcode word in every CPU model', () => {
    for (const profile of ['m68000', 'm68010'] as const) {
      const counts = { legal: 0, 'profile-illegal': 0, illegal: 0 };
      for (let opcode = 0; opcode <= 0xffff; opcode += 1) {
        counts[classifyOpcodeWord(opcode, profile).status] += 1;
      }
      expect(counts.legal + counts['profile-illegal'] + counts.illegal).toBe(0x1_0000);
      expect(counts.legal).toBeGreaterThan(0);
      expect(counts.illegal).toBeGreaterThan(0);
    }
  });

  it('gates MC68010-only opcodes by profile', () => {
    expect(classifyOpcodeWord(0x4e74, 'm68000').status).toBe('profile-illegal');
    expect(classifyOpcodeWord(0x42c0, 'm68000').status).toBe('profile-illegal');
    expect(classifyOpcodeWord(0x4848, 'm68000').status).toBe('profile-illegal');
    expect(classifyOpcodeWord(0x4e7a, 'm68000').status).toBe('profile-illegal');
    expect(classifyOpcodeWord(0x0e10, 'm68000').status).toBe('profile-illegal');
    expect(classifyOpcodeWord(0x4e74, 'm68010').status).toBe('legal');
    expect(classifyOpcodeWord(0x42c0, 'm68010').status).toBe('legal');
    expect(classifyOpcodeWord(0x484f, 'm68010').status).toBe('legal');
    expect(classifyOpcodeWord(0x4e7b, 'm68010').status).toBe('legal');
    expect(classifyOpcodeWord(0x0e90, 'm68010').status).toBe('legal');
  });
});
