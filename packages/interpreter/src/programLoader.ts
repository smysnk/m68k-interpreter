import { CODE_BYTE, CODE_LONG, CODE_WORD } from './core/operations';
import { Strings } from './core/strings';
import { decodeLoadedInstructions, type DecodedInstruction } from './instructionDecoder';

export type ProgramSource = string | Uint8Array;

export interface ProgramLoadResult {
  instructions: Array<[string, number, boolean]>;
  decodedInstructions: DecodedInstruction[];
  sourceLines: string[];
  codeLabels: Record<string, number>;
  codeLabelLookup: Record<string, number>;
  symbols: Record<string, number>;
  symbolLookup: Record<string, number>;
  memoryImage: Record<number, number>;
  endPointer?: [number, number];
  entryLabel?: string;
  orgAddress?: number;
  errors: string[];
  exception?: string;
}

interface PendingLabel {
  name: string;
  line: number;
}

const DIRECTIVES = new Set(['ORG', 'END', 'EQU', 'DC.B', 'DC.W', 'DC.L', 'DS.B', 'DS.W', 'DS.L']);
const SYMBOL_PATTERN = /^[_A-Za-z.$][_A-Za-z0-9.$]*$/;

export function loadProgramSource(source: ProgramSource): ProgramLoadResult {
  const sourceLines = decodeProgramSource(source).replace(/\r\n?/g, '\n').split('\n');
  const instructions: Array<[string, number, boolean]> = [];
  const codeLabels: Record<string, number> = {};
  const symbols: Record<string, number> = {};
  const symbolLookup: Record<string, number> = {};
  const memoryImage: Record<number, number> = {};
  const errors: string[] = [];

  let currentAddress = 0;
  let orgAddress: number | undefined;
  let endPointer: [number, number] | undefined;
  let entryLabel: string | undefined;
  let exception: string | undefined;
  let pendingLabels: PendingLabel[] = [];

  for (let index = 0; index < sourceLines.length; index++) {
    const lineNumber = index + 1;
    const stripped = stripComments(sourceLines[index]);

    if (!stripped.trim()) {
      continue;
    }

    const parsedLine = parseStructuredLine(stripped, lineNumber);
    const attachedLabels = [...pendingLabels, ...parsedLine.labels];
    pendingLabels = [];

    if (!parsedLine.content) {
      pendingLabels = attachedLabels;
      continue;
    }

    const [mnemonic, operandText = ''] = splitFirstToken(parsedLine.content);
    const upperMnemonic = mnemonic.toUpperCase();

    if (upperMnemonic === 'EQU') {
      if (attachedLabels.length !== 1) {
        errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + lineNumber);
        continue;
      }

      const value = resolveExpression(operandText, symbolLookup);
      if (value === undefined) {
        errors.push(Strings.UNKNOWN_LABEL + operandText.trim() + Strings.AT_LINE + lineNumber);
        continue;
      }

      if (!registerSymbol(attachedLabels[0].name, value, symbols, symbolLookup)) {
        exception = Strings.DUPLICATE_LABEL + attachedLabels[0].name + Strings.AT_LINE + attachedLabels[0].line;
        break;
      }

      instructions.push([parsedLine.content.trim(), lineNumber, true]);
      continue;
    }

    if (upperMnemonic === 'ORG') {
      const value = resolveExpression(operandText, symbolLookup);
      if (value === undefined) {
        errors.push(Strings.UNKNOWN_LABEL + operandText.trim() + Strings.AT_LINE + lineNumber);
        continue;
      }

      currentAddress = value >>> 0;
      if (orgAddress === undefined) {
        orgAddress = currentAddress;
      }

      for (const label of attachedLabels) {
        if (!registerSymbol(label.name, currentAddress, symbols, symbolLookup)) {
          exception = Strings.DUPLICATE_LABEL + label.name + Strings.AT_LINE + label.line;
          break;
        }
      }

      if (exception) {
        break;
      }

      instructions.push([parsedLine.content.trim(), lineNumber, true]);
      continue;
    }

    if (upperMnemonic === 'END') {
      if (endPointer !== undefined) {
        exception = Strings.DUPLICATE_END + Strings.AT_LINE + lineNumber;
        break;
      }

      entryLabel = operandText.trim() || undefined;
      instructions.push([parsedLine.content.trim(), lineNumber, true]);
      endPointer = [instructions.length, lineNumber];
      break;
    }

    if (upperMnemonic.startsWith('DC.')) {
      for (const label of attachedLabels) {
        if (!registerSymbol(label.name, currentAddress, symbols, symbolLookup)) {
          exception = Strings.DUPLICATE_LABEL + label.name + Strings.AT_LINE + label.line;
          break;
        }
      }

      if (exception) {
        break;
      }

      currentAddress = writeDefinedData(
        currentAddress,
        upperMnemonic,
        operandText,
        memoryImage,
        symbolLookup,
        errors,
        lineNumber
      );
      instructions.push([parsedLine.content.trim(), lineNumber, true]);
      continue;
    }

    if (upperMnemonic.startsWith('DS.')) {
      for (const label of attachedLabels) {
        if (!registerSymbol(label.name, currentAddress, symbols, symbolLookup)) {
          exception = Strings.DUPLICATE_LABEL + label.name + Strings.AT_LINE + label.line;
          break;
        }
      }

      if (exception) {
        break;
      }

      currentAddress = reserveDefinedStorage(
        currentAddress,
        upperMnemonic,
        operandText,
        memoryImage,
        symbolLookup,
        errors,
        lineNumber
      );
      instructions.push([parsedLine.content.trim(), lineNumber, true]);
      continue;
    }

    for (const label of attachedLabels) {
      if (!registerSymbol(label.name, currentAddress, symbols, symbolLookup)) {
        exception = Strings.DUPLICATE_LABEL + label.name + Strings.AT_LINE + label.line;
        break;
      }
      codeLabels[label.name] = instructions.length;
    }

    if (exception) {
      break;
    }

    instructions.push([parsedLine.content.trim(), lineNumber, false]);
    currentAddress += 4;
  }

  return {
    instructions,
    decodedInstructions: decodeLoadedInstructions(instructions, symbolLookup),
    sourceLines,
    codeLabels,
    codeLabelLookup: buildCodeLabelLookup(codeLabels),
    symbols,
    symbolLookup,
    memoryImage,
    endPointer,
    entryLabel,
    orgAddress,
    errors,
    exception,
  };
}

function buildCodeLabelLookup(codeLabels: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(codeLabels).map(([label, instructionIndex]) => [
      label.trim().toLowerCase(),
      instructionIndex,
    ])
  );
}

function decodeProgramSource(source: ProgramSource): string {
  if (typeof source === 'string') {
    return source;
  }

  let decoded = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < source.length; index += chunkSize) {
    const chunk = source.subarray(index, index + chunkSize);
    decoded += String.fromCharCode(...chunk);
  }

  return decoded;
}

function stripComments(line: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ';') {
      return line.slice(0, index).trimEnd();
    }
  }

  if (line.trimStart().startsWith('*')) {
    return '';
  }

  return line.trimEnd();
}

function parseStructuredLine(line: string, lineNumber: number): { labels: PendingLabel[]; content?: string } {
  const hasLeadingWhitespace = /^\s/.test(line);
  const trimmed = line.trim();

  if (trimmed === '') {
    return { labels: [] };
  }

  if (hasLeadingWhitespace) {
    return { labels: [], content: trimmed };
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex !== -1) {
    const labelName = trimmed.slice(0, colonIndex).trim();
    const remainder = trimmed.slice(colonIndex + 1).trim();

    if (SYMBOL_PATTERN.test(labelName)) {
      return remainder === ''
        ? { labels: [{ name: labelName, line: lineNumber }] }
        : { labels: [{ name: labelName, line: lineNumber }], content: remainder };
    }
  }

  const [firstToken, remainder = ''] = splitFirstToken(trimmed);
  if (DIRECTIVES.has(firstToken.toUpperCase())) {
    return { labels: [], content: trimmed };
  }

  if (remainder === '') {
    return { labels: [{ name: firstToken, line: lineNumber }] };
  }

  const [secondToken] = splitFirstToken(remainder);
  if (DIRECTIVES.has(secondToken.toUpperCase())) {
    return {
      labels: [{ name: firstToken, line: lineNumber }],
      content: remainder,
    };
  }

  return {
    labels: [{ name: firstToken, line: lineNumber }],
    content: remainder,
  };
}

function splitFirstToken(value: string): [string, string?] {
  const trimmed = value.trim();
  const firstSpace = trimmed.search(/\s/);

  if (firstSpace === -1) {
    return [trimmed];
  }

  return [trimmed.slice(0, firstSpace), trimmed.slice(firstSpace).trim()];
}

function registerSymbol(
  name: string,
  value: number,
  symbols: Record<string, number>,
  symbolLookup: Record<string, number>
): boolean {
  const normalized = normalizeSymbol(name);
  if (symbolLookup[normalized] !== undefined) {
    return false;
  }

  symbols[name] = value >>> 0;
  symbolLookup[normalized] = value >>> 0;
  return true;
}

function normalizeSymbol(name: string): string {
  return name.trim().toLowerCase();
}

function writeDefinedData(
  startAddress: number,
  directive: string,
  operandText: string,
  memoryImage: Record<number, number>,
  symbolLookup: Record<string, number>,
  errors: string[],
  lineNumber: number
): number {
  const sizeCode = directiveToSizeCode(directive);
  let currentAddress = startAddress;

  for (const token of splitCommaSeparated(operandText)) {
    if (token === '') {
      continue;
    }

    if (isQuoted(token)) {
      const value = token.slice(1, -1);
      for (let index = 0; index < value.length; index++) {
        currentAddress = writeScalar(memoryImage, currentAddress, value.charCodeAt(index), sizeCode);
      }
      continue;
    }

    const resolved = resolveExpression(token, symbolLookup);
    if (resolved === undefined) {
      errors.push(Strings.UNKNOWN_LABEL + token.trim() + Strings.AT_LINE + lineNumber);
      continue;
    }

    currentAddress = writeScalar(memoryImage, currentAddress, resolved, sizeCode);
  }

  return currentAddress;
}

function reserveDefinedStorage(
  startAddress: number,
  directive: string,
  operandText: string,
  memoryImage: Record<number, number>,
  symbolLookup: Record<string, number>,
  errors: string[],
  lineNumber: number
): number {
  const sizeCode = directiveToSizeCode(directive);
  const units = resolveExpression(operandText, symbolLookup);

  if (units === undefined) {
    errors.push(Strings.UNKNOWN_LABEL + operandText.trim() + Strings.AT_LINE + lineNumber);
    return startAddress;
  }

  const byteCount = Math.max(units, 0) * sizeToBytes(sizeCode);
  for (let offset = 0; offset < byteCount; offset++) {
    memoryImage[(startAddress + offset) >>> 0] = 0;
  }

  return startAddress + byteCount;
}

function directiveToSizeCode(directive: string): number {
  switch (directive.toUpperCase()) {
    case 'DC.L':
    case 'DS.L':
      return CODE_LONG;
    case 'DC.B':
    case 'DS.B':
      return CODE_BYTE;
    default:
      return CODE_WORD;
  }
}

function sizeToBytes(sizeCode: number): number {
  switch (sizeCode) {
    case CODE_LONG:
      return 4;
    case CODE_WORD:
      return 2;
    default:
      return 1;
  }
}

function writeScalar(
  memoryImage: Record<number, number>,
  address: number,
  value: number,
  sizeCode: number
): number {
  const normalizedValue = value >>> 0;

  if (sizeCode === CODE_LONG) {
    memoryImage[address >>> 0] = (normalizedValue >>> 24) & 0xff;
    memoryImage[(address + 1) >>> 0] = (normalizedValue >>> 16) & 0xff;
    memoryImage[(address + 2) >>> 0] = (normalizedValue >>> 8) & 0xff;
    memoryImage[(address + 3) >>> 0] = normalizedValue & 0xff;
    return address + 4;
  }

  if (sizeCode === CODE_WORD) {
    memoryImage[address >>> 0] = (normalizedValue >>> 8) & 0xff;
    memoryImage[(address + 1) >>> 0] = normalizedValue & 0xff;
    return address + 2;
  }

  memoryImage[address >>> 0] = normalizedValue & 0xff;
  return address + 1;
}

function splitCommaSeparated(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let activeQuote: "'" | '"' | undefined;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];

    if ((char === "'" || char === '"') && activeQuote === undefined) {
      activeQuote = char;
      current += char;
      continue;
    }

    if (activeQuote !== undefined && char === activeQuote) {
      activeQuote = undefined;
      current += char;
      continue;
    }

    if (char === ',' && activeQuote === undefined) {
      tokens.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '' || value.endsWith(',')) {
    tokens.push(current.trim());
  }

  return tokens;
}

function isQuoted(value: string): boolean {
  return (
    value.length >= 2 &&
    ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))
  );
}

function resolveExpression(expression: string, symbolLookup: Record<string, number>): number | undefined {
  const trimmed = expression.trim();
  if (trimmed === '') {
    return undefined;
  }

  const withoutImmediatePrefix = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;

  if (isQuoted(withoutImmediatePrefix)) {
    const content = withoutImmediatePrefix.slice(1, -1);
    if (content.length === 0) {
      return 0;
    }
    return content.charCodeAt(0) & 0xff;
  }

  if (/^\$[0-9a-f]+$/i.test(withoutImmediatePrefix)) {
    return parseInt(withoutImmediatePrefix.slice(1), 16) >>> 0;
  }

  if (/^0x[0-9a-f]+$/i.test(withoutImmediatePrefix)) {
    return parseInt(withoutImmediatePrefix.slice(2), 16) >>> 0;
  }

  if (/^%[01]+$/i.test(withoutImmediatePrefix)) {
    return parseInt(withoutImmediatePrefix.slice(1), 2) >>> 0;
  }

  if (/^[+-]?\d+$/.test(withoutImmediatePrefix)) {
    return parseInt(withoutImmediatePrefix, 10) >>> 0;
  }

  const normalized = normalizeSymbol(withoutImmediatePrefix);
  return symbolLookup[normalized];
}
