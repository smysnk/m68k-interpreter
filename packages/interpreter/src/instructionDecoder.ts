import { CODE_BYTE, CODE_LONG, CODE_WORD } from './core/operations';
import { Strings } from './core/strings';

const TOKEN_IMMEDIATE = 0;
const TOKEN_OFFSET = 1;
const TOKEN_REG_ADDR = 2;
const TOKEN_REG_DATA = 3;
const TOKEN_OFFSET_ADDR = 4;
const TOKEN_LABEL = 5;
const TOKEN_REGISTER_LIST = 6;

const BYTE_MASK = 0xff;
const SYMBOL_REGEX = /^[_a-zA-Z.$][_a-zA-Z0-9.$]*$/;

export interface DecodedOperand {
  value: number;
  type: number;
  offset?: number;
  label?: string;
  indexRegister?: number;
  indexSize?: number;
  preDecrement?: boolean;
  postIncrement?: boolean;
  registerList?: number[];
}

export interface DecodedInstruction {
  raw: string;
  line: number;
  isDirective: boolean;
  bareToken: string;
  operation: string;
  size: number;
  hasOperandSection: boolean;
  operandTokens: string[];
  operands: DecodedOperand[];
  decodeErrors: string[];
  operandsResolved: boolean;
}

interface OperandParseResult {
  operand?: DecodedOperand;
  errors: string[];
}

interface IndexRegisterParseResult {
  indexRegister?: number;
  indexSize?: number;
  error?: string;
}

export function decodeLoadedInstructions(
  instructions: Array<[string, number, boolean]>,
  _symbolLookup: Record<string, number>
): DecodedInstruction[] {
  return instructions.map(([raw, line, isDirective]) => decodeInstruction(raw, line, isDirective));
}

export function cloneDecodedInstruction(
  instruction: DecodedInstruction
): DecodedInstruction {
  return {
    raw: instruction.raw,
    line: instruction.line,
    isDirective: instruction.isDirective,
    bareToken: instruction.bareToken,
    operation: instruction.operation,
    size: instruction.size,
    hasOperandSection: instruction.hasOperandSection,
    operandTokens: [...instruction.operandTokens],
    operands: instruction.operands.map(cloneDecodedOperand),
    decodeErrors: [...instruction.decodeErrors],
    operandsResolved: instruction.operandsResolved,
  };
}

function cloneDecodedOperand(operand: DecodedOperand): DecodedOperand {
  return {
    value: operand.value,
    type: operand.type,
    offset: operand.offset,
    label: operand.label,
    indexRegister: operand.indexRegister,
    indexSize: operand.indexSize,
    preDecrement: operand.preDecrement,
    postIncrement: operand.postIncrement,
    registerList: operand.registerList ? [...operand.registerList] : undefined,
  };
}

function decodeInstruction(
  raw: string,
  line: number,
  isDirective: boolean
): DecodedInstruction {
  const bareToken = raw.trim().toLowerCase();
  const firstWhitespaceIndex = raw.search(/\s/);
  const hasOperandSection = firstWhitespaceIndex !== -1;
  const operationToken = hasOperandSection ? raw.slice(0, firstWhitespaceIndex).trim() : raw.trim();
  const dotIndex = operationToken.indexOf('.');
  const operation =
    (dotIndex === -1 ? operationToken : operationToken.slice(0, dotIndex)).trim().toLowerCase();
  const operandStr = hasOperandSection ? raw.slice(firstWhitespaceIndex).trim() : '';
  const operandTokens = operandStr === '' ? [] : splitOperands(operandStr);
  const { size, error: sizeError } = parseOpSize(raw);

  return {
    raw,
    line,
    isDirective,
    bareToken,
    operation,
    size,
    hasOperandSection,
    operandTokens,
    operands: [],
    decodeErrors: sizeError ? [sizeError] : [],
    operandsResolved: false,
  };
}

export function resolveDecodedInstruction(
  instruction: DecodedInstruction,
  symbolLookup: Record<string, number>
): DecodedInstruction {
  if (instruction.operandsResolved) {
    return instruction;
  }

  const operands: DecodedOperand[] = [];
  const decodeErrors = [...instruction.decodeErrors];

  for (const token of instruction.operandTokens) {
    if (instruction.operation === 'movem') {
      const registerList = parseRegisterList(token);
      if (registerList !== undefined) {
        operands.push(registerList);
        continue;
      }
    }

    const parsed = parseOperandToken(token, symbolLookup);
    if (parsed.operand !== undefined) {
      operands.push(parsed.operand);
    }

    decodeErrors.push(...parsed.errors);
  }

  return {
    ...instruction,
    operands,
    decodeErrors,
    operandsResolved: true,
  };
}

function parseOpSize(instr: string): { size: number; error?: string } {
  const dotIndex = instr.indexOf('.');
  if (dotIndex === -1 || dotIndex === instr.length - 1) {
    return {
      size: CODE_WORD,
    };
  }

  switch (instr.charAt(dotIndex + 1).toLowerCase()) {
    case 'b':
      return {
        size: CODE_BYTE,
      };
    case 'w':
      return {
        size: CODE_WORD,
      };
    case 'l':
      return {
        size: CODE_LONG,
      };
    default:
      return {
        size: CODE_WORD,
        error: Strings.INVALID_OP_SIZE,
      };
  }
}

function splitOperands(operandStr: string): string[] {
  const operands: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of operandStr) {
    if (char === '(') {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }

    if (char === ',' && parenDepth === 0) {
      operands.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') {
    operands.push(current.trim());
  }

  return operands;
}

function parseOperandToken(
  token: string,
  symbolLookup: Record<string, number>
): OperandParseResult {
  const trimmed = token.trim();

  if (trimmed.includes('/') || /^[adsp][0-7]?\s*-\s*[adsp][0-7]?/i.test(trimmed)) {
    const registerList = parseRegisterList(trimmed);
    if (registerList !== undefined) {
      return {
        operand: registerList,
        errors: [],
      };
    }
  }

  if (trimmed.startsWith('-(') && trimmed.endsWith(')')) {
    const registerOperand = parseOperandToken(trimmed.slice(2, -1), symbolLookup).operand;
    if (registerOperand?.type !== TOKEN_REG_ADDR) {
      return {
        errors: [Strings.NOT_AN_ADDRESS_REGISTER],
      };
    }

    return {
      operand: {
        value: registerOperand.value,
        type: TOKEN_OFFSET_ADDR,
        offset: 0,
        preDecrement: true,
      },
      errors: [],
    };
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')+')) {
    const registerOperand = parseOperandToken(trimmed.slice(1, -2), symbolLookup).operand;
    if (registerOperand?.type !== TOKEN_REG_ADDR) {
      return {
        errors: [Strings.NOT_AN_ADDRESS_REGISTER],
      };
    }

    return {
      operand: {
        value: registerOperand.value,
        type: TOKEN_OFFSET_ADDR,
        offset: 0,
        postIncrement: true,
      },
      errors: [],
    };
  }

  if (trimmed.includes('(') && trimmed.includes(')')) {
    if (trimmed.startsWith('(')) {
      const registerOperand = parseOperandToken(
        trimmed.slice(1, trimmed.indexOf(')')),
        symbolLookup
      ).operand;
      if (registerOperand?.type !== TOKEN_REG_ADDR) {
        return {
          errors: [Strings.NOT_AN_ADDRESS_REGISTER],
        };
      }

      return {
        operand: {
          value: registerOperand.value,
          type: TOKEN_OFFSET_ADDR,
          offset: 0,
        },
        errors: [],
      };
    }

    const displacementToken = trimmed.slice(0, trimmed.indexOf('(')).trim();
    const innerToken = trimmed.slice(trimmed.indexOf('(') + 1, trimmed.indexOf(')'));
    const [registerToken, indexToken] = innerToken.split(',').map((part) => part.trim());
    const displacementValue =
      displacementToken === ''
        ? 0
        : (parseNumericValue(displacementToken) ??
          resolveSymbolAddress(symbolLookup, displacementToken));
    const registerOperand = parseOperandToken(registerToken, symbolLookup).operand;

    if (registerOperand?.type !== TOKEN_REG_ADDR) {
      return {
        errors: [Strings.NOT_AN_ADDRESS_REGISTER],
      };
    }

    if (displacementValue === undefined) {
      return {
        errors: [Strings.UNKNOWN_OPERAND],
      };
    }

    if (!indexToken) {
      return {
        operand: {
          value: registerOperand.value,
          type: TOKEN_OFFSET_ADDR,
          offset: displacementValue,
        },
        errors: [],
      };
    }

    const indexedOperand = parseIndexRegister(indexToken);
    if (indexedOperand.error !== undefined) {
      return {
        errors: [indexedOperand.error],
      };
    }

    return {
      operand: {
        value: registerOperand.value,
        type: TOKEN_OFFSET_ADDR,
        offset: displacementValue,
        indexRegister: indexedOperand.indexRegister,
        indexSize: indexedOperand.indexSize,
      },
      errors: [],
    };
  }

  if (/^(a[0-7]|sp)$/i.test(trimmed)) {
    const register = parseRegister(trimmed);
    return {
      operand:
        register === undefined
          ? undefined
          : {
              value: register,
              type: TOKEN_REG_ADDR,
            },
      errors: register === undefined ? [Strings.INVALID_REGISTER] : [],
    };
  }

  if (/^d[0-7]$/i.test(trimmed)) {
    const register = parseRegister(trimmed);
    return {
      operand:
        register === undefined
          ? undefined
          : {
              value: register,
              type: TOKEN_REG_DATA,
            },
      errors: register === undefined ? [Strings.INVALID_REGISTER] : [],
    };
  }

  if (trimmed.startsWith('#')) {
    const immediateToken = trimmed.slice(1).trim();

    if (
      immediateToken.length >= 3 &&
      immediateToken.startsWith("'") &&
      immediateToken.endsWith("'")
    ) {
      return {
        operand: {
          value: immediateToken.charCodeAt(1) & BYTE_MASK,
          type: TOKEN_IMMEDIATE,
        },
        errors: [],
      };
    }

    if (SYMBOL_REGEX.test(immediateToken)) {
      const symbolAddress = resolveSymbolAddress(symbolLookup, immediateToken);
      if (symbolAddress !== undefined) {
        return {
          operand: {
            value: symbolAddress,
            type: TOKEN_IMMEDIATE,
          },
          errors: [],
        };
      }
    }

    const numericValue = parseNumericValue(immediateToken);
    if (numericValue !== undefined) {
      return {
        operand: {
          value: numericValue,
          type: TOKEN_IMMEDIATE,
        },
        errors: [],
      };
    }
  }

  const directValue = parseNumericValue(trimmed);
  if (directValue !== undefined) {
    return {
      operand: {
        value: directValue,
        type: TOKEN_OFFSET,
      },
      errors: [],
    };
  }

  if (SYMBOL_REGEX.test(trimmed)) {
    const symbolAddress = resolveSymbolAddress(symbolLookup, trimmed);
    if (symbolAddress !== undefined) {
      return {
        operand: {
          value: symbolAddress,
          type: TOKEN_OFFSET,
          label: trimmed,
        },
        errors: [],
      };
    }

    return {
      operand: {
        value: 0,
        type: TOKEN_LABEL,
        label: trimmed,
      },
      errors: [],
    };
  }

  return {
    errors: [Strings.UNKNOWN_OPERAND],
  };
}

function parseRegisterList(token: string): DecodedOperand | undefined {
  if (
    !/^(?:(?:a[0-7]|d[0-7]|sp)(?:\s*-\s*(?:a[0-7]|d[0-7]|sp))?)(?:\s*\/\s*(?:(?:a[0-7]|d[0-7]|sp)(?:\s*-\s*(?:a[0-7]|d[0-7]|sp))?))*$/i.test(
      token.trim()
    )
  ) {
    return undefined;
  }

  const registerList: number[] = [];
  const segments = token
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');

  for (const segment of segments) {
    if (segment.includes('-')) {
      const [startToken, endToken] = segment.split('-').map((part) => part.trim());
      const start = parseRegister(startToken);
      const end = parseRegister(endToken);

      if (start === undefined || end === undefined) {
        return undefined;
      }

      const step = start <= end ? 1 : -1;
      for (let register = start; register !== end + step; register += step) {
        registerList.push(register);
      }
      continue;
    }

    const register = parseRegister(segment);
    if (register === undefined) {
      return undefined;
    }

    registerList.push(register);
  }

  return {
    value: 0,
    type: TOKEN_REGISTER_LIST,
    registerList,
  };
}

function parseIndexRegister(token: string): IndexRegisterParseResult {
  const [registerToken, sizeToken] = token.split('.').map((part) => part.trim());
  const register = parseRegister(registerToken);

  if (register === undefined) {
    return {
      error: Strings.INVALID_REGISTER,
    };
  }

  let indexSize = CODE_WORD;
  if (sizeToken) {
    if (sizeToken.toLowerCase() === 'l') {
      indexSize = CODE_LONG;
    } else if (sizeToken.toLowerCase() !== 'w') {
      return {
        error: Strings.UNKNOWN_OPERAND,
      };
    }
  }

  return {
    indexRegister: register,
    indexSize,
  };
}

function parseRegister(register: string): number | undefined {
  switch (register.toLowerCase()) {
    case 'a0':
      return 0;
    case 'a1':
      return 1;
    case 'a2':
      return 2;
    case 'a3':
      return 3;
    case 'a4':
      return 4;
    case 'a5':
      return 5;
    case 'a6':
      return 6;
    case 'a7':
    case 'sp':
      return 7;
    case 'd0':
      return 8;
    case 'd1':
      return 9;
    case 'd2':
      return 10;
    case 'd3':
      return 11;
    case 'd4':
      return 12;
    case 'd5':
      return 13;
    case 'd6':
      return 14;
    case 'd7':
      return 15;
    default:
      return undefined;
  }
}

function parseNumericValue(token: string): number | undefined {
  if (token.startsWith('$')) {
    return parseInt(token.slice(1), 16) >>> 0;
  }

  if (token.startsWith('%')) {
    return parseInt(token.slice(1), 2) >>> 0;
  }

  if (/^[+-]?\d+$/.test(token)) {
    return parseInt(token, 10) >>> 0;
  }

  return undefined;
}

function resolveSymbolAddress(
  symbolLookup: Record<string, number>,
  symbol: string
): number | undefined {
  return symbolLookup[symbol.trim().toLowerCase()];
}
