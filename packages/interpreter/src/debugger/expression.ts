import type { DebuggerExpressionContext } from './types';

type TokenKind = 'number' | 'identifier' | 'operator' | 'left' | 'right' | 'dot-size' | 'eof';

interface Token {
  kind: TokenKind;
  text: string;
  value?: number;
}

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '<=': 7,
  '>': 7,
  '>=': 7,
  '<<': 8,
  '>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
};

const MAX_EXPRESSION_LENGTH = 512;
const MAX_EXPRESSION_DEPTH = 32;
const MAX_MEMORY_READS = 32;

function tokenize(input: string): Token[] {
  if (input.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression is too long');
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < input.length) {
    const rest = input.slice(offset);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }
    const hex = /^(?:\$|0x)([0-9a-f]+)/i.exec(rest);
    if (hex) {
      tokens.push({ kind: 'number', text: hex[0], value: Number.parseInt(hex[1], 16) >>> 0 });
      offset += hex[0].length;
      continue;
    }
    const binary = /^%([01]+)/.exec(rest);
    if (binary) {
      tokens.push({ kind: 'number', text: binary[0], value: Number.parseInt(binary[1], 2) >>> 0 });
      offset += binary[0].length;
      continue;
    }
    const decimal = /^\d+/.exec(rest);
    if (decimal) {
      tokens.push({ kind: 'number', text: decimal[0], value: Number.parseInt(decimal[0], 10) });
      offset += decimal[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identifier) {
      tokens.push({ kind: 'identifier', text: identifier[0] });
      offset += identifier[0].length;
      continue;
    }
    const size = /^\.(B|W|L)/i.exec(rest);
    if (size) {
      tokens.push({ kind: 'dot-size', text: size[1].toUpperCase() });
      offset += size[0].length;
      continue;
    }
    if (rest[0] === '(' || rest[0] === ')') {
      tokens.push({ kind: rest[0] === '(' ? 'left' : 'right', text: rest[0] });
      offset += 1;
      continue;
    }
    const operator = /^(?:\|\||&&|==|!=|<=|>=|<<|>>|[+\-*/%&|^~!<>])/.exec(rest);
    if (operator) {
      tokens.push({ kind: 'operator', text: operator[0] });
      offset += operator[0].length;
      continue;
    }
    throw new Error(`Unexpected token near "${rest.slice(0, 12)}"`);
  }
  tokens.push({ kind: 'eof', text: '' });
  return tokens;
}

class Parser {
  private offset = 0;
  private memoryReads = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly context: DebuggerExpressionContext
  ) {}

  parse(): number {
    const value = this.parseExpression(0, 0);
    if (this.peek().kind !== 'eof') throw new Error(`Unexpected token "${this.peek().text}"`);
    return value | 0;
  }

  private parseExpression(minimumPrecedence: number, depth: number): number {
    if (depth > MAX_EXPRESSION_DEPTH) throw new Error('Expression nesting is too deep');
    let left = this.parseUnary(depth + 1);
    while (true) {
      const token = this.peek();
      const precedence = token.kind === 'operator' ? BINARY_PRECEDENCE[token.text] : undefined;
      if (precedence === undefined || precedence < minimumPrecedence) break;
      this.offset += 1;
      const right = this.parseExpression(precedence + 1, depth + 1);
      left = this.applyBinary(token.text, left, right);
    }
    return left | 0;
  }

  private parseUnary(depth: number): number {
    const token = this.peek();
    if (token.kind === 'operator' && ['-', '~', '!', '+'].includes(token.text)) {
      this.offset += 1;
      const value = this.parseUnary(depth + 1);
      if (token.text === '-') return -value;
      if (token.text === '~') return ~value;
      if (token.text === '!') return value === 0 ? 1 : 0;
      return value;
    }
    return this.parsePrimary(depth + 1);
  }

  private parsePrimary(depth: number): number {
    const token = this.take();
    if (token.kind === 'number') return token.value ?? 0;
    if (token.kind === 'identifier') {
      const key = token.text.toUpperCase();
      const value = this.context.registers[key] ?? this.context.symbols[token.text.toLowerCase()];
      if (value === undefined) throw new Error(`Unknown register or symbol "${token.text}"`);
      return value;
    }
    if (token.kind !== 'left') throw new Error(`Expected a value, found "${token.text}"`);
    const value = this.parseExpression(0, depth + 1);
    if (this.take().kind !== 'right') throw new Error('Expected closing parenthesis');
    if (this.peek().kind !== 'dot-size') return value;
    const sizeToken = this.take().text;
    this.memoryReads += 1;
    if (this.memoryReads > MAX_MEMORY_READS) throw new Error('Expression reads too much memory');
    return this.context.readMemory(value >>> 0, sizeToken === 'B' ? 1 : sizeToken === 'W' ? 2 : 4);
  }

  private applyBinary(operator: string, left: number, right: number): number {
    switch (operator) {
      case '||':
        return left !== 0 || right !== 0 ? 1 : 0;
      case '&&':
        return left !== 0 && right !== 0 ? 1 : 0;
      case '|':
        return left | right;
      case '^':
        return left ^ right;
      case '&':
        return left & right;
      case '==':
        return left === right ? 1 : 0;
      case '!=':
        return left !== right ? 1 : 0;
      case '<':
        return left < right ? 1 : 0;
      case '<=':
        return left <= right ? 1 : 0;
      case '>':
        return left > right ? 1 : 0;
      case '>=':
        return left >= right ? 1 : 0;
      case '<<':
        return left << (right & 31);
      case '>>':
        return left >> (right & 31);
      case '+':
        return (left + right) | 0;
      case '-':
        return (left - right) | 0;
      case '*':
        return Math.imul(left, right);
      case '/':
        if (right === 0) throw new Error('Division by zero');
        return Math.trunc(left / right);
      case '%':
        if (right === 0) throw new Error('Division by zero');
        return left % right;
      default:
        throw new Error(`Unsupported operator "${operator}"`);
    }
  }

  private peek(): Token {
    return this.tokens[this.offset];
  }
  private take(): Token {
    return this.tokens[this.offset++];
  }
}

export function evaluateDebuggerExpression(
  expression: string,
  context: DebuggerExpressionContext
): number {
  return new Parser(tokenize(expression), context).parse();
}
