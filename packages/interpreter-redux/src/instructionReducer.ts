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
import { writeTerminalByte } from './terminalReducer';

const TOKEN_IMMEDIATE = 0;
const TOKEN_OFFSET = 1;
const TOKEN_REG_ADDR = 2;
const TOKEN_REG_DATA = 3;
const TOKEN_OFFSET_ADDR = 4;
const TOKEN_LABEL = 5;
const TOKEN_REGISTER_LIST = 6;

const SYMBOL_REGEX = /^[_a-zA-Z.$][_a-zA-Z0-9.$]*$/;
const STACK_POINTER_REGISTER = 7;

interface ReducerOperand {
  value: number;
  type: number;
  label?: string;
  offset?: number;
  preDecrement?: boolean;
  postIncrement?: boolean;
  registerList?: number[];
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

function parseRegisterList(token: string): ReducerOperand | undefined {
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
      const start = parseRegisters(startToken);
      const end = parseRegisters(endToken);

      if (start === undefined || end === undefined) {
        return undefined;
      }

      const step = start <= end ? 1 : -1;
      for (let register = start; register !== end + step; register += step) {
        registerList.push(register);
      }
      continue;
    }

    const register = parseRegisters(segment);
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

function getTransferSize(size: MemorySizeCode, registerIndex?: number): number {
  if (size === CODE_BYTE) {
    return registerIndex === STACK_POINTER_REGISTER ? 2 : 1;
  }

  if (size === CODE_WORD) {
    return 2;
  }

  return 4;
}

function resolveOperandAddress(
  state: InterpreterReducerState,
  operand: ReducerOperand
): number | undefined {
  if (operand.type === TOKEN_OFFSET) {
    return operand.value >>> 0;
  }

  if (operand.type !== TOKEN_OFFSET_ADDR) {
    return undefined;
  }

  return ((state.cpu.registers[operand.value] + (operand.offset ?? 0)) >>> 0);
}

function readMemoryValue(
  state: InterpreterReducerState,
  address: number,
  size: MemorySizeCode
): number {
  return getMemoryValue(state.memory, address, size);
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
      registers: updates.registers ?? state.cpu.registers,
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

function setRegisterValue(
  state: InterpreterReducerState,
  register: number,
  value: number
): InterpreterReducerState {
  const registers = [...state.cpu.registers];
  registers[register] = value;
  return updateCpuAndExecution(state, {
    registers,
  });
}

function parseOperand(state: InterpreterReducerState, token: string): ReducerOperand | undefined {
  const trimmed = token.trim();

  if (trimmed.includes('/') || /^[adsp][0-7]?\s*-\s*[adsp][0-7]?/i.test(trimmed)) {
    const registerList = parseRegisterList(trimmed);
    if (registerList !== undefined) {
      return registerList;
    }
  }

  if (trimmed.startsWith('-(') && trimmed.endsWith(')')) {
    const registerOperand = parseOperand(state, trimmed.slice(2, -1));
    if (registerOperand?.type !== TOKEN_REG_ADDR) {
      return undefined;
    }

    return {
      value: registerOperand.value,
      type: TOKEN_OFFSET_ADDR,
      offset: 0,
      preDecrement: true,
    };
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')+')) {
    const registerOperand = parseOperand(state, trimmed.slice(1, -2));
    if (registerOperand?.type !== TOKEN_REG_ADDR) {
      return undefined;
    }

    return {
      value: registerOperand.value,
      type: TOKEN_OFFSET_ADDR,
      offset: 0,
      postIncrement: true,
    };
  }

  if (trimmed.includes('(') && trimmed.includes(')')) {
    if (trimmed.startsWith('(')) {
      const registerOperand = parseOperand(state, trimmed.slice(1, trimmed.indexOf(')')));
      if (registerOperand?.type !== TOKEN_REG_ADDR) {
        return undefined;
      }

      return {
        value: registerOperand.value,
        type: TOKEN_OFFSET_ADDR,
        offset: 0,
      };
    }

    const displacementToken = trimmed.slice(0, trimmed.indexOf('(')).trim();
    const registerToken = trimmed.slice(trimmed.indexOf('(') + 1, trimmed.indexOf(')')).trim();
    const displacementValue =
      displacementToken === ''
        ? 0
        : (parseNumericValue(displacementToken) ?? resolveSymbolAddress(state, displacementToken));
    const registerOperand = parseOperand(state, registerToken);

    if (registerOperand?.type !== TOKEN_REG_ADDR || displacementValue === undefined) {
      return undefined;
    }

    return {
      value: registerOperand.value,
      type: TOKEN_OFFSET_ADDR,
      offset: displacementValue,
    };
  }

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
): { state: InterpreterReducerState; value: number | undefined } {
  if (operand.type === TOKEN_IMMEDIATE) {
    return {
      state,
      value: operand.value,
    };
  }

  if (operand.type === TOKEN_REG_DATA || operand.type === TOKEN_REG_ADDR) {
    return {
      state,
      value: state.cpu.registers[operand.value],
    };
  }

  if (operand.type === TOKEN_OFFSET) {
    return {
      state,
      value: getMemoryValue(state.memory, operand.value, size),
    };
  }

  if (operand.type === TOKEN_OFFSET_ADDR) {
    const step = getTransferSize(size, operand.value);
    let nextState = state;

    if (operand.preDecrement) {
      nextState = setRegisterValue(nextState, operand.value, state.cpu.registers[operand.value] - step);
    }

    const address = resolveOperandAddress(nextState, operand);
    if (address === undefined) {
      return {
        state: nextState,
        value: undefined,
      };
    }

    const value = readMemoryValue(nextState, address, size);

    if (operand.postIncrement) {
      nextState = setRegisterValue(
        nextState,
        operand.value,
        nextState.cpu.registers[operand.value] + step
      );
    }

    return {
      state: nextState,
      value,
    };
  }

  return {
    state,
    value: undefined,
  };
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

  if (operand.type === TOKEN_OFFSET_ADDR) {
    const step = getTransferSize(size, operand.value);
    let nextState = state;

    if (operand.preDecrement) {
      nextState = setRegisterValue(nextState, operand.value, state.cpu.registers[operand.value] - step);
    }

    const address = resolveOperandAddress(nextState, operand);
    if (address === undefined) {
      return appendError(nextState, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
    }

    nextState = {
      ...nextState,
      memory: setMemoryValue(nextState.memory, address, value, size),
    };

    if (operand.postIncrement) {
      nextState = setRegisterValue(
        nextState,
        operand.value,
        nextState.cpu.registers[operand.value] + step
      );
    }

    return nextState;
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

function updateBtstFlags(state: InterpreterReducerState, bitSet: boolean): InterpreterReducerState {
  const ccr = bitSet ? (state.cpu.ccr & 0xfb) >>> 0 : (state.cpu.ccr | 0x04) >>> 0;
  return updateCpuAndExecution(state, {
    ccr,
  });
}

function parseDirectiveOperandValue(
  state: InterpreterReducerState,
  instruction: string
): number | undefined {
  const match = /^dc\.[bwl]\s+(.+)$/i.exec(instruction.trim());
  if (!match) {
    return undefined;
  }

  const operandText = splitOperands(match[1])[0]?.trim();
  if (!operandText) {
    return undefined;
  }

  return parseNumericValue(operandText) ?? resolveSymbolAddress(state, operandText);
}

function readTrapTaskWord(
  state: InterpreterReducerState
): { state: InterpreterReducerState; task?: number } {
  const taskInstructionIndex = Math.floor(state.cpu.pc / 4);
  const taskInstruction = state.program.instructions[taskInstructionIndex];

  if (!taskInstruction) {
    return {
      state,
      task: undefined,
    };
  }

  const taskValue = parseDirectiveOperandValue(state, taskInstruction[0]);
  if (taskValue === undefined) {
    return {
      state,
      task: undefined,
    };
  }

  return {
    state: updateCpuAndExecution(state, {
      pc: state.cpu.pc + 4,
    }),
    task: taskValue,
  };
}

function deliverInputByte(state: InterpreterReducerState, byte: number): InterpreterReducerState {
  const [result, ccr] = moveOP(byte & BYTE_MASK, state.cpu.registers[8], state.cpu.ccr, CODE_BYTE);
  const registers = [...state.cpu.registers];
  registers[8] = result;

  return updateCpuAndExecution(state, {
    registers,
    ccr,
  });
}

function servicePendingInputTrap(state: InterpreterReducerState): InterpreterReducerState {
  if (!state.input.waitingForInput) {
    return state;
  }

  if (state.input.pendingInputTask !== 3) {
    return {
      ...state,
      input: {
        ...state.input,
        waitingForInput: false,
        pendingInputTask: undefined,
      },
    };
  }

  if (state.input.queue.length === 0) {
    return state;
  }

  const [inputByte, ...remainingQueue] = state.input.queue;
  const nextState = deliverInputByte(state, inputByte ?? 0);
  return {
    ...nextState,
    input: {
      ...nextState.input,
      queue: remainingQueue,
      waitingForInput: false,
      pendingInputTask: undefined,
    },
  };
}

function pushLongToStack(state: InterpreterReducerState, value: number): InterpreterReducerState {
  const nextStackPointer = state.cpu.registers[STACK_POINTER_REGISTER] - 4;
  const withStackPointer = setRegisterValue(state, STACK_POINTER_REGISTER, nextStackPointer);
  return {
    ...withStackPointer,
    memory: setMemoryValue(withStackPointer.memory, nextStackPointer, value >>> 0, CODE_LONG),
  };
}

function popLongFromStack(
  state: InterpreterReducerState
): { state: InterpreterReducerState; value: number } {
  const stackPointer = state.cpu.registers[STACK_POINTER_REGISTER];
  const value = getMemoryValue(state.memory, stackPointer, CODE_LONG);
  const nextState = setRegisterValue(state, STACK_POINTER_REGISTER, stackPointer + 4);

  return {
    state: nextState,
    value,
  };
}

function executeMove(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const sourceRead = readOperandValue(state, op1, size);
  if (sourceRead.value === undefined) {
    return appendError(
      sourceRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + sourceRead.state.execution.currentLine
    );
  }

  const destValue =
    op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR
      ? sourceRead.state.cpu.registers[op2.value]
      : 0;
  const [result, newCCR] = moveOP(sourceRead.value, destValue, sourceRead.state.cpu.ccr, size);
  const nextState = writeOperandValue(sourceRead.state, op2, size, result);

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
  const sourceRead = readOperandValue(state, op1, size);
  const destRead = readOperandValue(sourceRead.state, op2, size);

  if (sourceRead.value === undefined || destRead.value === undefined) {
    return appendError(
      destRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + destRead.state.execution.currentLine
    );
  }

  const [result, newCCR] = addOP(
    sourceRead.value,
    destRead.value,
    destRead.state.cpu.ccr,
    size,
    isSub
  );
  const nextState = writeOperandValue(destRead.state, op2, size, result);

  return updateCpuAndExecution(nextState, {
    ccr: newCCR,
  });
}

function executeClr(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  operand: ReducerOperand
): InterpreterReducerState {
  const read = readOperandValue(state, operand, size);
  if (read.value === undefined) {
    return appendError(
      read.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + read.state.execution.currentLine
    );
  }

  const [result, newCCR] = clrOP(size, read.value, read.state.cpu.ccr);
  const nextState = writeOperandValue(read.state, operand, size, result);

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
  const sourceRead = readOperandValue(state, op1, size);
  const destRead = readOperandValue(sourceRead.state, op2, size);

  if (sourceRead.value === undefined || destRead.value === undefined) {
    return appendError(
      destRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + destRead.state.execution.currentLine
    );
  }

  return updateCpuAndExecution(destRead.state, {
    ccr: cmpOP(sourceRead.value, destRead.value, destRead.state.cpu.ccr, size),
  });
}

function executeTst(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  operand: ReducerOperand
): InterpreterReducerState {
  const read = readOperandValue(state, operand, size);
  if (read.value === undefined) {
    return appendError(
      read.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + read.state.execution.currentLine
    );
  }

  return updateCpuAndExecution(read.state, {
    ccr: tstOP(read.value, read.state.cpu.ccr, size),
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

function executeMovea(
  state: InterpreterReducerState,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const sourceRead = readOperandValue(state, op1, CODE_LONG);
  if (sourceRead.value === undefined || op2.type !== TOKEN_REG_ADDR) {
    return appendError(
      sourceRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + sourceRead.state.execution.currentLine
    );
  }

  return setRegisterValue(sourceRead.state, op2.value, sourceRead.value);
}

function executeAndi(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const sourceRead = readOperandValue(state, op1, size);
  const destRead = readOperandValue(sourceRead.state, op2, size);

  if (sourceRead.value === undefined || destRead.value === undefined) {
    return appendError(
      destRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + destRead.state.execution.currentLine
    );
  }

  const result = (sourceRead.value & destRead.value) >>> 0;
  return writeOperandValue(destRead.state, op2, size, result);
}

function executeLsr(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const sourceRead = readOperandValue(state, op1, CODE_LONG);
  const destRead = readOperandValue(sourceRead.state, op2, size);

  if (
    sourceRead.value === undefined ||
    destRead.value === undefined ||
    (op2.type !== TOKEN_REG_DATA && op2.type !== TOKEN_REG_ADDR)
  ) {
    return appendError(
      destRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + destRead.state.execution.currentLine
    );
  }

  const shiftCount = sourceRead.value & 0x3f;
  const result = destRead.value >>> shiftCount;
  return writeOperandValue(destRead.state, op2, size, result);
}

function executeBsr(state: InterpreterReducerState, label: string): InterpreterReducerState {
  return branchToLabel(pushLongToStack(state, state.cpu.pc), label);
}

function executeRts(state: InterpreterReducerState): InterpreterReducerState {
  const popped = popLongFromStack(state);
  return updateCpuAndExecution(popped.state, {
    pc: popped.value,
  });
}

function executeTrap(
  state: InterpreterReducerState,
  operand: ReducerOperand
): InterpreterReducerState {
  const vectorRead = readOperandValue(state, operand, CODE_LONG);
  if (vectorRead.value === undefined) {
    return appendError(
      vectorRead.state,
      Strings.UNKNOWN_OPERAND + Strings.AT_LINE + vectorRead.state.execution.currentLine
    );
  }

  const taskRead = readTrapTaskWord(vectorRead.state);
  if (taskRead.task === undefined) {
    return setException(
      taskRead.state,
      Strings.MISSING_TRAP_TASK + Strings.AT_LINE + taskRead.state.execution.currentLine
    );
  }

  switch (vectorRead.value & BYTE_MASK) {
    case 0x0b:
      if (taskRead.task === 0) {
        return updateCpuAndExecution(taskRead.state, {
          halted: true,
        });
      }
      break;
    case 0x0f:
      if (taskRead.task === 1) {
        return {
          ...taskRead.state,
          terminal: writeTerminalByte(taskRead.state.terminal, taskRead.state.cpu.registers[8] & BYTE_MASK),
        };
      }

      if (taskRead.task === 3) {
        if (taskRead.state.input.queue.length === 0) {
          return {
            ...taskRead.state,
            input: {
              ...taskRead.state.input,
              waitingForInput: true,
              pendingInputTask: 3,
            },
          };
        }

        const [inputByte, ...remainingQueue] = taskRead.state.input.queue;
        const nextState = deliverInputByte(taskRead.state, inputByte ?? 0);
        return {
          ...nextState,
          input: {
            ...nextState.input,
            queue: remainingQueue,
            waitingForInput: false,
            pendingInputTask: undefined,
          },
        };
      }

      if (taskRead.task === 4) {
        return updateBtstFlags(taskRead.state, taskRead.state.input.queue.length > 0);
      }
      break;
    default:
      break;
  }

  return setException(
    taskRead.state,
    Strings.UNSUPPORTED_TRAP_VECTOR +
      `${vectorRead.value & BYTE_MASK}:${taskRead.task}` +
      Strings.AT_LINE +
      taskRead.state.execution.currentLine
  );
}

function executeMovem(
  state: InterpreterReducerState,
  size: MemorySizeCode,
  op1: ReducerOperand,
  op2: ReducerOperand
): InterpreterReducerState {
  const transferSize = size === CODE_WORD ? CODE_WORD : CODE_LONG;
  const bytesPerRegister = getTransferSize(transferSize);

  if (op1.type === TOKEN_REGISTER_LIST) {
    const registers = op1.registerList ?? [];
    if (registers.length === 0) {
      return state;
    }

    let nextState = state;
    let address = 0;

    if (op2.type === TOKEN_OFFSET_ADDR && op2.preDecrement) {
      const totalBytes = registers.length * bytesPerRegister;
      nextState = setRegisterValue(nextState, op2.value, nextState.cpu.registers[op2.value] - totalBytes);
      address = nextState.cpu.registers[op2.value] >>> 0;
    } else {
      const resolvedAddress = resolveOperandAddress(nextState, op2);
      if (resolvedAddress === undefined) {
        return appendError(
          nextState,
          Strings.UNKNOWN_OPERAND + Strings.AT_LINE + nextState.execution.currentLine
        );
      }
      address = resolvedAddress;
    }

    let nextMemory = nextState.memory;
    for (const register of registers) {
      nextMemory = setMemoryValue(nextMemory, address, nextState.cpu.registers[register], transferSize);
      address += bytesPerRegister;
    }

    nextState = {
      ...nextState,
      memory: nextMemory,
    };

    if (op2.type === TOKEN_OFFSET_ADDR && op2.postIncrement) {
      nextState = setRegisterValue(nextState, op2.value, nextState.cpu.registers[op2.value] + registers.length * bytesPerRegister);
    }

    return nextState;
  }

  if (op2.type !== TOKEN_REGISTER_LIST) {
    return appendError(state, Strings.UNKNOWN_OPERAND + Strings.AT_LINE + state.execution.currentLine);
  }

  const registers = op2.registerList ?? [];
  if (registers.length === 0) {
    return state;
  }

  let nextState = state;
  let address = 0;

  if (op1.type === TOKEN_OFFSET_ADDR && op1.preDecrement) {
    const totalBytes = registers.length * bytesPerRegister;
    nextState = setRegisterValue(nextState, op1.value, nextState.cpu.registers[op1.value] - totalBytes);
    address = nextState.cpu.registers[op1.value] >>> 0;
  } else {
    const resolvedAddress = resolveOperandAddress(nextState, op1);
    if (resolvedAddress === undefined) {
      return appendError(
        nextState,
        Strings.UNKNOWN_OPERAND + Strings.AT_LINE + nextState.execution.currentLine
      );
    }
    address = resolvedAddress;
  }

  const updatedRegisters = [...nextState.cpu.registers];
  for (const register of registers) {
    updatedRegisters[register] = readMemoryValue(nextState, address, transferSize);
    address += bytesPerRegister;
  }

  nextState = updateCpuAndExecution(nextState, {
    registers: updatedRegisters,
  });

  if (op1.type === TOKEN_OFFSET_ADDR && op1.postIncrement) {
    nextState = setRegisterValue(nextState, op1.value, nextState.cpu.registers[op1.value] + registers.length * bytesPerRegister);
  }

  return nextState;
}

function executeInstruction(state: InterpreterReducerState, instr: string): InterpreterReducerState {
  const firstWhitespaceIndex = instr.search(/\s/);

  if (firstWhitespaceIndex === -1 && instr.length > 0) {
    switch (instr.toLowerCase()) {
      case 'rts':
        return executeRts(state);
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
    .map((token) =>
      operation.toLowerCase() === 'movem'
        ? (parseRegisterList(token) ?? parseOperand(state, token))
        : parseOperand(state, token)
    )
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
    case 'andi':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeAndi(state, size, operands[0], operands[1]);
    case 'lsr':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeLsr(state, size, operands[0], operands[1]);
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
    case 'bsr':
      if (operands.length !== 1) {
        return appendError(
          state,
          Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeBsr(state, operandTokens[0] ?? '');
    case 'movea':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeMovea(state, operands[0], operands[1]);
    case 'movem':
      if (operands.length !== 2) {
        return appendError(
          state,
          Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeMovem(state, size, operands[0], operands[1]);
    case 'trap':
      if (operands.length !== 1) {
        return appendError(
          state,
          Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + state.execution.currentLine
        );
      }
      return executeTrap(state, operands[0]);
    default:
      return appendError(
        state,
        Strings.UNRECOGNISED_INSTRUCTION + Strings.AT_LINE + state.execution.currentLine
      );
  }
}

export function reduceInstructionStep(state: InterpreterReducerState): InterpreterReducerState {
  if (state.diagnostics.exception !== undefined || state.execution.halted) {
    return state;
  }

  if (state.input.waitingForInput) {
    return servicePendingInputTrap(state);
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
