import type { CpuDiagnostic } from '../core/execution';
import { loadProgramSource, type ProgramLoadResult, type ProgramSource } from '../programLoader';
import type { ProgramImage, ProgramSourceMapEntry } from './programImage';
import { encodeSourceInstruction } from './sourceEncoder';

export interface SourceAssemblyResult {
  image?: ProgramImage;
  symbols: Record<string, number>;
  diagnostics: CpuDiagnostic[];
}

function splitFirst(value: string): [string, string] {
  const trimmed = value.trim();
  const index = trimmed.search(/\s/);
  return index < 0 ? [trimmed, ''] : [trimmed.slice(0, index), trimmed.slice(index).trim()];
}

function splitValues(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote: string | undefined;
  for (const character of value) {
    if ((character === "'" || character === '"') && quote === undefined) quote = character;
    else if (character === quote) quote = undefined;
    if (character === ',' && quote === undefined) {
      result.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim() !== '' || value.endsWith(',')) result.push(current.trim());
  return result;
}

function expression(value: string, symbols: Record<string, number>): number | undefined {
  const token = value.trim().replace(/^#/, '');
  if (/^\$[0-9a-f]+$/i.test(token)) return Number.parseInt(token.slice(1), 16) >>> 0;
  if (/^0x[0-9a-f]+$/i.test(token)) return Number.parseInt(token.slice(2), 16) >>> 0;
  if (/^%[01]+$/.test(token)) return Number.parseInt(token.slice(1), 2) >>> 0;
  if (/^[+-]?\d+$/.test(token)) return Number.parseInt(token, 10) >>> 0;
  if (
    token.length >= 2 &&
    ((token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith('"') && token.endsWith('"')))
  ) {
    return token.length === 2 ? 0 : token.charCodeAt(1);
  }
  return symbols[token.toLowerCase()];
}

function directiveSize(mnemonic: string): number {
  return mnemonic.endsWith('.B') ? 1 : mnemonic.endsWith('.L') ? 4 : 2;
}

function directiveLength(
  mnemonic: string,
  operandText: string,
  symbols: Record<string, number>
): number {
  const size = directiveSize(mnemonic);
  if (mnemonic.startsWith('DS.')) return (expression(operandText, symbols) ?? 0) * size;
  if (mnemonic.startsWith('DCB.')) {
    return (expression(splitValues(operandText)[0] ?? '0', symbols) ?? 0) * size;
  }
  if (mnemonic.startsWith('DC.')) {
    return (
      splitValues(operandText).reduce((count, token) => {
        const quoted =
          token.length >= 2 &&
          ((token.startsWith("'") && token.endsWith("'")) ||
            (token.startsWith('"') && token.endsWith('"')));
        return count + (quoted ? token.slice(1, -1).length : 1);
      }, 0) * size
    );
  }
  return 0;
}

function writeScalar(
  target: Map<number, number>,
  address: number,
  value: number,
  size: number
): number {
  for (let offset = 0; offset < size; offset += 1) {
    const shift = (size - offset - 1) * 8;
    target.set((address + offset) >>> 0, (value >>> shift) & 0xff);
  }
  return address + size;
}

function emitDirective(
  target: Map<number, number>,
  address: number,
  mnemonic: string,
  operandText: string,
  symbols: Record<string, number>
): number {
  const size = directiveSize(mnemonic);
  if (mnemonic.startsWith('DS.')) {
    const count = expression(operandText, symbols) ?? 0;
    for (let index = 0; index < count * size; index += 1) target.set(address + index, 0);
    return address + count * size;
  }
  if (mnemonic.startsWith('DCB.')) {
    const [countToken = '0', valueToken = '0'] = splitValues(operandText);
    const count = expression(countToken, symbols) ?? 0;
    const value = expression(valueToken, symbols) ?? 0;
    for (let index = 0; index < count; index += 1) {
      address = writeScalar(target, address, value, size);
    }
    return address;
  }
  for (const token of splitValues(operandText)) {
    const quoted =
      token.length >= 2 &&
      ((token.startsWith("'") && token.endsWith("'")) ||
        (token.startsWith('"') && token.endsWith('"')));
    if (quoted) {
      for (const character of token.slice(1, -1)) {
        address = writeScalar(target, address, character.charCodeAt(0), size);
      }
    } else {
      address = writeScalar(target, address, expression(token, symbols) ?? 0, size);
    }
  }
  return address;
}

function normalizeSymbols(symbols: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(symbols).map(([name, value]) => [name.trim().toLowerCase(), value >>> 0])
  );
}

export function assembleProgramSource(source: ProgramSource): SourceAssemblyResult {
  return assembleLoadedProgram(loadProgramSource(source));
}

export function assembleLoadedProgram(loaded: ProgramLoadResult): SourceAssemblyResult {
  const diagnostics: CpuDiagnostic[] = loaded.errors.map((message) => ({
    code: 'source-load-error',
    severity: 'error',
    message,
  }));
  if (loaded.exception !== undefined) {
    diagnostics.push({
      code: 'source-load-exception',
      severity: 'error',
      message: loaded.exception,
    });
  }
  const symbols = normalizeSymbols(loaded.symbols);
  const instructionAddresses = new Array<number>(loaded.instructions.length).fill(0);

  for (let pass = 0; pass < 4; pass += 1) {
    let cursor = loaded.orgAddress ?? 0;
    for (let index = 0; index < loaded.instructions.length; index += 1) {
      const [raw, line, isDirective] = loaded.instructions[index];
      const [mnemonicToken, operandText] = splitFirst(raw);
      const mnemonic = mnemonicToken.toUpperCase();
      if (mnemonic === 'ORG') cursor = expression(operandText, symbols) ?? cursor;
      if (
        mnemonic !== 'END' &&
        mnemonic !== 'EQU' &&
        mnemonic !== 'ORG' &&
        (!isDirective || directiveSize(mnemonic) > 1) &&
        (cursor & 1) !== 0
      ) {
        cursor += 1;
      }
      instructionAddresses[index] = cursor;
      if (mnemonic === 'END' || mnemonic === 'EQU' || mnemonic === 'ORG') continue;
      if (isDirective) {
        cursor += directiveLength(mnemonic, operandText, symbols);
        continue;
      }
      try {
        cursor += encodeSourceInstruction(
          loaded.decodedInstructions[index],
          symbols,
          cursor
        ).length;
      } catch (error) {
        if (pass === 3) {
          diagnostics.push({
            code: 'encoding-error',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
            source: { line },
          });
        }
        cursor += 2;
      }
    }
    for (const [label, index] of Object.entries(loaded.addressLabels)) {
      symbols[label.toLowerCase()] = instructionAddresses[index] >>> 0;
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { symbols, diagnostics };
  }

  const output = new Map<number, number>();
  const sourceMap: ProgramSourceMapEntry[] = [];
  let cursor = loaded.orgAddress ?? 0;
  let loadAddress = cursor;
  let maximumAddress = cursor;
  for (let index = 0; index < loaded.instructions.length; index += 1) {
    const [raw, line, isDirective] = loaded.instructions[index];
    const [mnemonicToken, operandText] = splitFirst(raw);
    const mnemonic = mnemonicToken.toUpperCase();
    if (mnemonic === 'ORG') {
      cursor = expression(operandText, symbols) ?? cursor;
      loadAddress = Math.min(loadAddress, cursor);
      continue;
    }
    if (mnemonic === 'END' || mnemonic === 'EQU') continue;
    if ((!isDirective || directiveSize(mnemonic) > 1) && (cursor & 1) !== 0) {
      output.set(cursor, 0);
      cursor += 1;
    }
    const start = cursor;
    if (isDirective) {
      cursor = emitDirective(output, cursor, mnemonic, operandText, symbols);
    } else {
      const bytes = encodeSourceInstruction(loaded.decodedInstructions[index], symbols, cursor);
      bytes.forEach((byte, offset) => output.set(cursor + offset, byte));
      cursor += bytes.length;
    }
    if (cursor > start) sourceMap.push({ address: start, length: cursor - start, line });
    maximumAddress = Math.max(maximumAddress, cursor);
  }

  const bytes = new Uint8Array(Math.max(0, maximumAddress - loadAddress));
  for (const [address, value] of output) bytes[address - loadAddress] = value;
  const entryPoint =
    loaded.entryLabel !== undefined
      ? (symbols[loaded.entryLabel.toLowerCase()] ?? loadAddress)
      : loadAddress;
  return {
    symbols,
    diagnostics,
    image: { bytes, loadAddress, entryPoint, endAddress: maximumAddress, sourceMap },
  };
}
