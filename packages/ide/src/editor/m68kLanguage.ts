import {
  StreamLanguage,
  StringStream,
  type StreamParser,
} from '@codemirror/language';

export type M68kTokenStyle =
  | 'atom'
  | 'comment'
  | 'def'
  | 'keyword'
  | 'meta'
  | 'number'
  | 'operator'
  | 'string'
  | 'variable'
  | null;

interface M68kParserState {
  canDefineLabel: boolean;
}

export interface M68kToken {
  lexeme: string;
  style: M68kTokenStyle;
}

const CONDITION_CODES = [
  'T',
  'F',
  'HI',
  'LS',
  'CC',
  'CS',
  'NE',
  'EQ',
  'VC',
  'VS',
  'PL',
  'MI',
  'GE',
  'LT',
  'GT',
  'LE',
  'HS',
  'LO',
] as const;

const BRANCH_CONDITION_CODES = [
  'HI',
  'LS',
  'CC',
  'CS',
  'NE',
  'EQ',
  'VC',
  'VS',
  'PL',
  'MI',
  'GE',
  'LT',
  'GT',
  'LE',
  'HS',
  'LO',
] as const;

const CORE_INSTRUCTIONS = [
  'ABCD',
  'ADD',
  'ADDA',
  'ADDI',
  'ADDQ',
  'ADDX',
  'AND',
  'ANDI',
  'ASL',
  'ASR',
  'BCHG',
  'BCLR',
  'BRA',
  'BSET',
  'BSR',
  'BTST',
  'CHK',
  'CLR',
  'CMP',
  'CMPA',
  'CMPI',
  'CMPM',
  'DIVS',
  'DIVU',
  'EOR',
  'EORI',
  'EXG',
  'EXT',
  'ILLEGAL',
  'JMP',
  'JSR',
  'LEA',
  'LINK',
  'LSL',
  'LSR',
  'MOVE',
  'MOVEA',
  'MOVEM',
  'MOVEP',
  'MOVEQ',
  'MULS',
  'MULU',
  'NBCD',
  'NEG',
  'NEGX',
  'NOP',
  'NOT',
  'OR',
  'ORI',
  'PEA',
  'RESET',
  'ROL',
  'ROR',
  'ROXL',
  'ROXR',
  'RTE',
  'RTR',
  'RTS',
  'SBCD',
  'STOP',
  'SUB',
  'SUBA',
  'SUBI',
  'SUBQ',
  'SUBX',
  'SWAP',
  'TAS',
  'TRAP',
  'TRAPV',
  'TST',
  'UNLK',
] as const;

const DIRECTIVES = [
  'ALIGN',
  'CNOP',
  'DC',
  'DCB',
  'DS',
  'ELSE',
  'END',
  'ENDC',
  'ENDIF',
  'ENDM',
  'ENDR',
  'EQU',
  'EVEN',
  'FAIL',
  'IDNT',
  'IF',
  'INCBIN',
  'INCLUDE',
  'LIST',
  'MACRO',
  'NOLIST',
  'OFFSET',
  'OPT',
  'ORG',
  'PAGE',
  'REPT',
  'SECTION',
  'SEG',
  'SET',
  'TTL',
  'XDEF',
  'XREF',
] as const;

const REGISTERS = [
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'A7',
  'CCR',
  'D0',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'D6',
  'D7',
  'PC',
  'SP',
  'SR',
  'USP',
] as const;

export const M68K_INSTRUCTIONS = new Set<string>([
  ...CORE_INSTRUCTIONS,
  ...BRANCH_CONDITION_CODES.map((code) => `B${code}`),
  ...CONDITION_CODES.map((code) => `DB${code}`),
  ...CONDITION_CODES.map((code) => `S${code}`),
  'DBRA',
]);

export const M68K_DIRECTIVES = new Set<string>(DIRECTIVES);
export const M68K_REGISTERS = new Set<string>(REGISTERS);

const IDENTIFIER_REGEX = /[A-Za-z_.@$][A-Za-z0-9_.@$]*/;
const DECIMAL_NUMBER_REGEX = /\d+/;
const HEX_NUMBER_REGEX = /\$[0-9A-Fa-f]+/;
const BINARY_NUMBER_REGEX = /%[01]+/;
const DOUBLE_QUOTED_STRING_REGEX = /"(?:[^"\\]|\\.)*"?/;
const SINGLE_QUOTED_STRING_REGEX = /'(?:[^'\\]|\\.)*'?/;
const OPERATOR_REGEX = /[:#(),+\-/*[\]=]/;

function normalizeAssemblerWord(word: string): string {
  return word.toUpperCase().replace(/\.(B|W|L|S)$/i, '');
}

export function classifyM68kIdentifier(
  identifier: string,
  options: { canDefineLabel?: boolean } = {}
): Exclude<M68kTokenStyle, 'comment' | 'number' | 'operator' | 'string' | null> {
  const normalized = normalizeAssemblerWord(identifier);

  if (M68K_REGISTERS.has(normalized)) {
    return 'atom';
  }

  if (M68K_DIRECTIVES.has(normalized)) {
    return 'meta';
  }

  if (M68K_INSTRUCTIONS.has(normalized)) {
    return 'keyword';
  }

  if (options.canDefineLabel) {
    return 'def';
  }

  return 'variable';
}

export const m68kStreamParser: StreamParser<M68kParserState> = {
  startState() {
    return {
      canDefineLabel: true,
    };
  },

  token(stream, state) {
    if (stream.sol()) {
      state.canDefineLabel = true;
    }

    if (stream.eatSpace()) {
      return null;
    }

    const isFirstTokenOnLine = stream.string.slice(0, stream.pos).trim().length === 0;
    const nextCharacter = stream.peek();

    if (nextCharacter === ';' || (nextCharacter === '*' && isFirstTokenOnLine)) {
      stream.skipToEnd();
      state.canDefineLabel = false;
      return 'comment';
    }

    if (stream.match(DOUBLE_QUOTED_STRING_REGEX) || stream.match(SINGLE_QUOTED_STRING_REGEX)) {
      state.canDefineLabel = false;
      return 'string';
    }

    if (
      stream.match(HEX_NUMBER_REGEX) ||
      stream.match(BINARY_NUMBER_REGEX) ||
      stream.match(DECIMAL_NUMBER_REGEX)
    ) {
      state.canDefineLabel = false;
      return 'number';
    }

    if (stream.match(IDENTIFIER_REGEX)) {
      const style = classifyM68kIdentifier(stream.current(), {
        canDefineLabel: state.canDefineLabel && isFirstTokenOnLine,
      });

      if (style === 'def' && stream.peek() === ':') {
        stream.next();
      }

      state.canDefineLabel = false;
      return style;
    }

    if (stream.match(OPERATOR_REGEX)) {
      state.canDefineLabel = false;
      return 'operator';
    }

    stream.next();
    state.canDefineLabel = false;
    return null;
  },
};

export const m68kLanguage = StreamLanguage.define(m68kStreamParser);

export function tokenizeM68kLine(line: string): M68kToken[] {
  const stream = new StringStream(line, 4, 2);
  const state = m68kStreamParser.startState?.(2) ?? { canDefineLabel: true };
  const tokens: M68kToken[] = [];

  while (!stream.eol()) {
    stream.start = stream.pos;
    const style = m68kStreamParser.token(stream, state) as M68kTokenStyle;

    if (stream.pos <= stream.start) {
      stream.next();
    }

    tokens.push({
      lexeme: line.slice(stream.start, stream.pos),
      style,
    });
  }

  return tokens;
}
