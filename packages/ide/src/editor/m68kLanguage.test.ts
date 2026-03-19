import { describe, expect, it } from 'vitest';
import {
  M68K_DIRECTIVES,
  M68K_INSTRUCTIONS,
  M68K_REGISTERS,
  classifyM68kIdentifier,
  tokenizeM68kLine,
} from './m68kLanguage';

describe('m68kLanguage', () => {
  it('classifies core M68000 mnemonics and condition variants as keywords', () => {
    expect(M68K_INSTRUCTIONS.has('MOVEQ')).toBe(true);
    expect(M68K_INSTRUCTIONS.has('ROXL')).toBe(true);
    expect(M68K_INSTRUCTIONS.has('DBRA')).toBe(true);
    expect(M68K_INSTRUCTIONS.has('BCLR')).toBe(true);
    expect(classifyM68kIdentifier('MOVE.B', { canDefineLabel: true })).toBe('keyword');
    expect(classifyM68kIdentifier('ROXL.W', { canDefineLabel: true })).toBe('keyword');
    expect(classifyM68kIdentifier('DBRA', { canDefineLabel: true })).toBe('keyword');
    expect(classifyM68kIdentifier('SGE', { canDefineLabel: true })).toBe('keyword');
  });

  it('classifies assembler directives and registers distinctly', () => {
    expect(M68K_DIRECTIVES.has('ORG')).toBe(true);
    expect(M68K_DIRECTIVES.has('DC')).toBe(true);
    expect(M68K_REGISTERS.has('A7')).toBe(true);
    expect(M68K_REGISTERS.has('CCR')).toBe(true);
    expect(classifyM68kIdentifier('DC.B', { canDefineLabel: true })).toBe('meta');
    expect(classifyM68kIdentifier('ORG', { canDefineLabel: true })).toBe('meta');
    expect(classifyM68kIdentifier('A7', { canDefineLabel: true })).toBe('atom');
    expect(classifyM68kIdentifier('D0.W', { canDefineLabel: false })).toBe('atom');
  });

  it('treats leading identifiers as labels and later identifiers as symbols', () => {
    expect(classifyM68kIdentifier('START', { canDefineLabel: true })).toBe('def');
    expect(classifyM68kIdentifier('START', { canDefineLabel: false })).toBe('variable');
  });

  it('tokenizes m68k source lines with labels, operands, strings, and comments', () => {
    const tokens = tokenizeM68kLine("START MOVE.B #'A',D0 ; print a character").filter(
      (token) => token.lexeme.trim().length > 0
    );

    expect(tokens).toEqual([
      { lexeme: 'START', style: 'def' },
      { lexeme: 'MOVE.B', style: 'keyword' },
      { lexeme: '#', style: 'operator' },
      { lexeme: "'A'", style: 'string' },
      { lexeme: ',', style: 'operator' },
      { lexeme: 'D0', style: 'atom' },
      { lexeme: '; print a character', style: 'comment' },
    ]);
  });

  it('treats star-prefixed comment lines as comments in easy68k style', () => {
    const tokens = tokenizeM68kLine('    * splash screen').filter(
      (token) => token.lexeme.trim().length > 0
    );

    expect(tokens).toEqual([{ lexeme: '* splash screen', style: 'comment' }]);
  });
});
