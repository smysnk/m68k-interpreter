import { describe, expect, it } from 'vitest';
import { decodeTerminalByte } from './terminalCharset';

describe('terminalCharset', () => {
  it('keeps ASCII bytes unchanged', () => {
    expect(decodeTerminalByte('A'.charCodeAt(0))).toBe('A');
    expect(decodeTerminalByte(' '.charCodeAt(0))).toBe(' ');
  });

  it('maps CP437 box and block drawing bytes to the intended Unicode glyphs', () => {
    expect(decodeTerminalByte(0xb2)).toBe('▓');
    expect(decodeTerminalByte(0xb3)).toBe('│');
    expect(decodeTerminalByte(0xc4)).toBe('─');
    expect(decodeTerminalByte(0xda)).toBe('┌');
    expect(decodeTerminalByte(0xbf)).toBe('┐');
    expect(decodeTerminalByte(0xc0)).toBe('└');
    expect(decodeTerminalByte(0xd9)).toBe('┘');
    expect(decodeTerminalByte(0xdb)).toBe('█');
  });
});

