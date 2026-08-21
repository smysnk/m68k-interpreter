import { describe, expect, it } from 'vitest';
import { evaluateDebuggerExpression } from './expression';

const context = {
  registers: { D0: 10, A0: 0x2000, PC: 0x1000 },
  symbols: { score: 0x3000 },
  readMemory: (address: number, size: 1 | 2 | 4) => (address === 0x2000 && size === 2 ? 0x42 : 0),
};

describe('debugger expression evaluator', () => {
  it('evaluates registers, symbols, literals, operators, and sized memory reads', () => {
    expect(evaluateDebuggerExpression('D0 == 10 && (A0).W == $42', context)).toBe(1);
    expect(evaluateDebuggerExpression('score + %10', context)).toBe(0x3002);
    expect(evaluateDebuggerExpression('(D0 << 2) | 1', context)).toBe(41);
  });

  it('rejects unknown values, division by zero, and trailing input', () => {
    expect(() => evaluateDebuggerExpression('UNKNOWN', context)).toThrow('Unknown');
    expect(() => evaluateDebuggerExpression('1 / 0', context)).toThrow('Division by zero');
    expect(() => evaluateDebuggerExpression('D0 D0', context)).toThrow('Unexpected');
  });

  it('enforces bounded input and nesting', () => {
    expect(() => evaluateDebuggerExpression('1'.repeat(513), context)).toThrow('too long');
    expect(() =>
      evaluateDebuggerExpression(`${'('.repeat(40)}1${')'.repeat(40)}`, context)
    ).toThrow('too deep');
  });
});
