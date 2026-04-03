import { describe, expect, it } from 'vitest';
import { decodeTerminalByte, encodeTerminalByte } from './terminalCharset';

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

  it('encodes CP437 box and block drawing glyphs back to their original bytes', () => {
    expect(encodeTerminalByte('▓')).toBe(0xb2);
    expect(encodeTerminalByte('│')).toBe(0xb3);
    expect(encodeTerminalByte('─')).toBe(0xc4);
    expect(encodeTerminalByte('┌')).toBe(0xda);
    expect(encodeTerminalByte('┐')).toBe(0xbf);
    expect(encodeTerminalByte('└')).toBe(0xc0);
    expect(encodeTerminalByte('┘')).toBe(0xd9);
    expect(encodeTerminalByte('█')).toBe(0xdb);
  });
});
