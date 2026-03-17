import {
  BYTE_MASK,
  CODE_BYTE,
  CODE_LONG,
  CODE_WORD,
  Strings,
  addOP,
  clrOP,
  cmpOP,
  loadProgramSource,
  moveOP,
  tstOP,
  type ProgramLoadResult,
  type ProgramSource,
} from '@m68k/interpreter';
import {
  createDiagnosticsState,
  createExecutionRuntimeState,
  createInitialInterpreterReducerState,
  createLoadedProgramState,
  type InterpreterReducerState,
  type LoadedProgramState,
} from './state';
import {
  getMemoryValue,
  type MemorySizeCode,
  setMemoryValue,
} from './memoryReducer';

const TOKEN_IMMEDIATE = 0;
const TOKEN_OFFSET = 1;
const TOKEN_REG_ADDR = 2;
const TOKEN_REG_DATA = 3;
const TOKEN_LABEL = 5;

const SYMBOL_REGEX = /^[_a-zA-Z.$][_a-zA-Z0-9.$]*$/;

interface ReducerOperand {
  value: number;
  type: number;
  label?: string;
}

function normalizeLoadedProgram(source: ProgramSource, loadedProgram: ProgramLoadResult): LoadedProgramState {
  return createLoadedProgramState({
    source: typeof source === 'string' ? source : loadedProgram.sourceLines.join('\n'),
    instructions: loadedProgram.instructions,
    sourceLines: loadedProgram.sourceLines,
    codeLabels: loadedProgram.codeLabels,
    symbols: loadedProgram.symbols,
    symbolLookup: loadedProgram.symbolLookup,
    memoryImage: loadedProgram.memoryImage,
    endPointer: loadedProgram.endPointer,
    entryLabel: loadedProgram.entryLabel,
    orgAddress: loadedProgram.orgAddress,
  });
}

export function createInterpreterReduxStateForProgram(
  source: ProgramSource,
  options: {
    columns?: number;
    rows?: number;
  } = {}
): InterpreterReducerState {
  const loadedProgram = loadProgramSource(source);
  const program = normalizeLoadedProgram(source, loadedProgram);
  const exception =
    loadedProgram.exception ??
    (loadedProgram.endPointer === undefined ? Strings.END_MISSING : undefined);

  return {
    ...createInitialInterpreterReducerState({
      program,
      initialMemory: loadedProgram.memoryImage,
      columns: options.columns,
      rows: options.rows,
    }),
    execution: createExecutionRuntimeState({
      currentLine: 0,
      lastInstruction:
        loadedProgram.instructions.length > 0
          ? loadedProgram.instructions[0][0]
          : Strings.LAST_INSTRUCTION_DEFAULT_TEXT,
      endPointer: loadedProgram.endPointer,
    }),
    diagnostics: createDiagnosticsState({
      exception,
      errors: loadedProgram.errors,
    }),
  };
}

function checkPC(pc: number): boolean {
  return 0 <= pc / 4 && pc % 4 === 0;
}

function parseOpSize(instr: string): MemorySizeCode {
  if (instr.indexOf('.') === -1) {
    return CODE_WORD;
  }

  const size = instr.charAt(instr.indexOf('.') + 1).toLowerCase();
  switch (size) {
    case 'b':
      return CODE_BYTE;
    case 'w':
      return CODE_WORD;
    case 'l':
      return CODE_LONG;
    default:
      return CODE_WORD;
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

function parseRegisters(register: string): number | undefined {
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
    return parseInt(token.substring(1), 16) >>> 0;
  }

  if (token.startsWith('%')) {
    return parseInt(token.substring(1), 2) >>> 0;
  }

  if (/^[+-]?\d+$/.test(token)) {
    return parseInt(token, 10) >>> 0;
  }

  return undefined;
}

function resolveSymbolAddress(state: InterpreterReducerState, symbol: string): number | undefined {
  return state.program.symbolLookup[symbol.trim().toLowerCase()];
}

function appendError(state: InterpreterReducerState, message: string): InterpreterReducerState {
  return {
    ...state,
    diagnostics: {
      ...state.diagnostics,
      errors: [...state.diagnostics.errors, message],
    },
  };
}

function setException(state: InterpreterReducerState, exception: string): InterpreterReducerState {
  return {
    ...state,
    diagnostics: {
      ...state.diagnostics,
      exception,
    },
  };
}

function updateCpuAndExecution(
  state: InterpreterReducerState,
  updates: {
    registers?: number[];
    pc?: number;
    ccr?: number;
    currentLine?: number;
    lastInstruction?: string;
    halted?: boolean;
  }
): InterpreterReducerState {
  return {
    ...state,
    cpu: {
      registers: updates.registers ?? [...state.cpu.registers],
      pc: updates.pc ?? state.cpu.pc,
      ccr: updates.ccr ?? state.cpu.ccr,
    },
    execution: {
      ...state.execution,
      currentLine: updates.currentLine ?? state.execution.currentLine,
      lastInstruction: updates.lastInstruction ?? state.execution.lastInstruction,
      halted: updates.halted ?? state.execution.halted,
    },
  };
}

function parseOperand(state: InterpreterReducerState, token: string): ReducerOperand | undefined {
  const trimmed = token.trim();

  if (/^(a[0-7]|sp)$/i.test(trimmed)) {
    const register = parseRegisters(trimmed);
    if (register === undefined) {
      return undefined;
    }

    return {
      value: register,
      type: TOKEN_REG_ADDR,
    };
  }

  if (/^d[0-7]$/i.test(trimmed)) {
    const register = parseRegisters(trimmed);
    if (register === undefined) {
      return undefined;
    }

    return {
      value: register,
      type: TOKEN_REG_DATA,
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
        value: immediateToken.charCodeAt(1) & BYTE_MASK,
        type: TOKEN_IMMEDIATE,
      };
    }

    if (SYMBOL_REGEX.test(immediateToken)) {
      const symbolAddress = resolveSymbolAddress(state, immediateToken);
      if (symbolAddress !== undefined) {
        return {
          value: symbolAddress,
          type: TOKEN_IMMEDIATE,
        };
      }
    }

    const numericValue = parseNumericValue(immediateToken);
    if (numericValue !== undefined) {
      return {
        value: numericValue,
        type: TOKEN_IMMEDIATE,
      };
    }
  }

  const directValue = parseNumericValue(trimmed);
  if (directValue !== undefined) {
    return {
      value: directValue,
      type: TOKEN_OFFSET,
    };
  }

  if (SYMBOL_REGEX.test(trimmed)) {
    const symbolAddress = resolveSymbolAddress(state, trimmed);
    if (symbolAddress !== undefined) {
      return {
        value: symbolAddress,
        type: TOKEN_OFFSET,
        label: trimmed,
      };
    }

    return {
      value: 0,
      type: TOKEN_LABEL,
      label: trimmed,
    };
  }

  return undefined;
}

function readOperandValue(
  state: InterpreterReducerState,
  operand: ReducerOperand,
  size: MemorySizeCode
): number | undefined {
  if (operand.type === TOKEN_IMMEDIATE) {
    return operand.value;
  }

  if (operand.type === TOKEN_REG_DATA || operand.type === TOKEN_REG_ADDR) {
    return state.cpu.registers[operand.value];
  }

  if (operand.type === TOKEN_OFFSET) {
    return getMemoryValue(state.memory, operand.value, size);
  }

  return undefined;
}

function writeOperandValue(
  state: InterpreterReducerState,
  operand: ReducerOperand,
  size: MemorySizeCode,
  value: number
): InterpreterReducerState {
  if (operand.type === TOKEN_REG_DATA || operand.type === TOKEN_REG_ADDR) {
    const registers = [...state.cpu.registers];
    registers[operand.value] = value;

    return updateCpuAndExecution(state, {
      registers,
    });
  }

  if (operand.type === TOKEN_OFFSET) {
    return {
      ...state,
      memory: setMemoryValue(state.memory, operand.value, value, size),
    };
  }

  return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
}

function branchToLabel(state: InterpreterReducerState, label: string): InterpreterReducerState {
  const normalizedLabel = label.trim().toLowerCase();
  const labelKey = Object.keys(state.program.codeLabels).find(
    (key) => key.toLowerCase() === normalizedLabel
  );

  if (labelKey === undefined || state.program.codeLabels[labelKey] === undefined) {
    return appendError(
      state,
      Strings.UNKNOWN_LABEL + normalizedLabel + Strings.AT_LINE + state.execution.currentLine
    );
  }

  return updateCpuAndExecution(state, {
    pc: state.program.codeLabels[labelKey] * 4,
  });
}

function executeMove(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const srcValue = readOperandValue(state, op1, size);
  if (srcValue === undefined) {
    return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
  }

  const destValue =
    op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR
      ? state.cpu.registers[op2.value]
      : 0;
  const [result, newCCR] = moveOP(srcValue, destValue, state.cpu.ccr, size);
  const nextState = writeOperandValue(state, op2, size, result);

  return updateCpuAndExecution(nextState, {
    ccr: newCCR,
  });
}

function executeAddLike(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand,
  isSub: boolean
): InterpreterReducerState {
  const srcValue = readOperandValue(state, op1, size);
  const destValue = readOperandValue(state, op2, size);

  if (srcValue === undefined || destValue === undefined) {
    return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
  }

  const [result, newCCR] = addOP(srcValue, destValue, state.cpu.ccr, size, isSub);
  const nextState = writeOperandValue(state, op2, size, result);

  return updateCpuAndExecution(nextState, {
    ccr: newCCR,
  });
}

function executeClr(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  operand: ReducerOperand
): InterpreterReducerState {
  const currentValue = readOperandValue(state, operand, size);
  if (currentValue === undefined) {
    return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
  }

  const [result, newCCR] = clrOP(size, currentValue, state.cpu.ccr);
  const nextState = writeOperandValue(state, operand, size, result);

  return updateCpuAndExecution(nextState, {
    ccr: newCCR,
  });
}

function executeCmp(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const srcValue = readOperandValue(state, op1, size);
  const destValue = readOperandValue(state, op2, size);

  if (srcValue === undefined || destValue === undefined) {
    return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
  }

  return updateCpuAndExecution(state, {
    ccr: cmpOP(srcValue, destValue, state.cpu.ccr, size),
  });
}

function executeTst(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  operand: ReducerOperand
): InterpreterReducerState {
  const value = readOperandValue(state, operand, size);
  if (value === undefined) {
    return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
  }

  return updateCpuAndExecution(state, {
    ccr: tstOP(value, state.cpu.ccr, size),
  });
}

function getZFlag(state: InterpreterReducerState): number {
  return (state.cpu.ccr & 0x04) >>> 2;
}

function getVFlag(state: InterpreterReducerState): number {
  return (state.cpu.ccr & 0x02) >>> 1;
}

function getNFlag(state: InterpreterReducerState): number {
  return (state.cpu.ccr & 0x08) >>> 3;
}

function executeInstruction(state: InterpreterReducerState, instr: string): InterpreterReducerState {
  const firstWhitespaceIndex = instr.search(/\s/);

  if (firstWhitespaceIndex === -1 && instr.length > 0) {
    switch (instr.toLowerCase()) {
      default:
        return appendError(
          state,
          Strings.UNRECOGNISED_INSTRUCTION + Strings.AT_LINE + state.execution.currentLine
        );
    }
  }

  const operation =
    instr.indexOf('.') !== -1
      ? instr.substring(0, instr.indexOf('.')).trim().toLowerCase()
      : instr.substring(0, firstWhitespaceIndex).trim().toLowerCase();
  const operandStr = instr.substring(firstWhitespaceIndex).trim();
  const operandTokens = splitOperands(operandStr);
  const size = parseOpSize(instr);
  const operands = operandTokens
    .map((token) => parseOperand(state, token))
    .filter((operand) => operand !== undefined) as ReducerOperand[];

  switch (operation) {
    case 'move':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeMove(state, size, operands[0], operands[1]);
    case 'add':
    case 'addi':
    case 'addq':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeAddLike(state, size, operands[0], operands[1], false);
    case 'sub':
    case 'subi':
    case 'subq':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeAddLike(state, size, operands[0], operands[1], true);
    case 'clr':
      if (operands.length !== 1) {
        return appendError(
          state,
          Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeClr(state, size, operands[0]);
    case 'cmp':
    case 'cmpi':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeCmp(state, size, operands[0], operands[1]);
    case 'tst':
      if (operands.length !== 1) {
        return appendError(
          state,
          Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeTst(state, size, operands[0]);
    case 'bra':
      return branchToLabel(state, operandTokens[0] ?? '');
    case 'beq':
      return getZFlag(state) ? branchToLabel(state, operandTokens[0] ?? '') : state;
    case 'bne':
      return getZFlag(state) === 0 ? branchToLabel(state, operandTokens[0] ?? '') : state;
    case 'bge':
      return getNFlag(state) === getVFlag(state) ? branchToLabel(state, operandTokens[0] ?? '') : state;
    case 'bgt':
      return getNFlag(state) === getVFlag(state) && getZFlag(state) === 0
        ? branchToLabel(state, operandTokens[0] ?? '')
        : state;
    case 'ble':
      return getNFlag(state) !== getVFlag(state) || getZFlag(state) === 1
        ? branchToLabel(state, operandTokens[0] ?? '')
        : state;
    case 'blt':
      return getNFlag(state) !== getVFlag(state) ? branchToLabel(state, operandTokens[0] ?? '') : state;
    default:
      return appendError(
        state,
        Strings.UNRECOGNISED_INSTRUCTION + Strings.AT_LINE + state.execution.currentLine
      );
  }
}

export function reduceInstructionStep(state: InterpreterReducerState): InterpreterReducerState {
  if (state.diagnostics.exception !== undefined || state.execution.halted || state.input.waitingForInput) {
    return state;
  }

  if (state.cpu.pc / 4 >= state.program.instructions.length) {
    return state;
  }

  if (!checkPC(state.cpu.pc)) {
    return setException(state, Strings.INVALID_PC_EXCEPTION);
  }

  const instrIdx = Math.floor(state.cpu.pc / 4);
  const instruction = state.program.instructions[instrIdx];
  if (instruction === undefined) {
    return state;
  }

  const [instr, line, isDirective] = instruction;
  const lastInstruction = state.program.sourceLines[line - 1] || instr;
  const steppedState = updateCpuAndExecution(state, {
    pc: state.cpu.pc + 4,
    currentLine: line,
    lastInstruction,
  });

  if (isDirective) {
    return steppedState;
  }

  return executeInstruction(steppedState, instr);
}
