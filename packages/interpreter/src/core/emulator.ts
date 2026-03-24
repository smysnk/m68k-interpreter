/**
 * M68K Emulator - Main execution engine
 * Handles instruction parsing, execution, registers, memory, and condition codes
 */

import { loadProgramSource, type ProgramSource } from '../programLoader';
import {
  TerminalDevice,
  type TerminalMeta,
  type TerminalSnapshot,
} from '../devices/terminal';
import type { TerminalFrameBuffer } from '../devices/terminalBuffer';
import { Memory } from './memory';
import { Undo } from './undo';
import { Strings } from './strings';
import {
  CODE_LONG,
  CODE_WORD,
  CODE_BYTE,
  BYTE_MASK,
  WORD_MASK,
  addOP,
  moveOP,
  clrOP,
  cmpOP,
  tstOP,
  swapOP,
  exgOP,
  extOP,
  andOP,
  orOP,
  eorOP,
  notOP,
  negOP,
  muluOP,
  mulsOP,
  divuOP,
  divsOP,
  aslOP,
  asrOP,
  lslOP,
  lsrOP,
  rolOP,
  rorOP,
} from './operations';

// Token type constants
const TOKEN_IMMEDIATE = 0;
const TOKEN_OFFSET = 1;
const TOKEN_REG_ADDR = 2;
const TOKEN_REG_DATA = 3;
const TOKEN_OFFSET_ADDR = 4;
const TOKEN_LABEL = 5;
const TOKEN_REGISTER_LIST = 6;

const SYMBOL_REGEX = /^[_a-zA-Z.$][_a-zA-Z0-9.$]*$/;
const STACK_POINTER_REGISTER = 7;
const DEFAULT_STACK_POINTER = 0x00100000;

interface Operand {
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

export class Emulator {
  // Registers: A0-A7 (indices 0-7), D0-D7 (indices 8-15)
  private registers: Int32Array = new Int32Array(16);
  
  private pc: number = 0x0; // Program counter
  private ccr: number = 0x00; // Condition Code Register
  private memory: Memory;
  private undo: Undo;
  private terminal: TerminalDevice;
  
  // Parsed instructions
  private instructions: Array<[string, number, boolean]> = []; // [instruction, line, isDirective]
  private clonedInstructions: string[] = []; // Original instructions for display
  
  // State
  private labels: Record<string, number> = {};
  private symbols: Record<string, number> = {};
  private symbolLookup: Record<string, number> = {};
  private endPointer: [number, number] | undefined;
  private lastInstruction: string = Strings.LAST_INSTRUCTION_DEFAULT_TEXT;
  private exception: string | undefined;
  private errors: string[] = [];
  private line: number = 0;
  private initialMemory: Record<number, number> = {};
  private inputQueue: number[] = [];
  private waitingForInput = false;
  private halted = false;
  private pendingInputTask: number | undefined;

  constructor(program: ProgramSource = '') {
    this.memory = new Memory();
    this.undo = new Undo();
    this.terminal = new TerminalDevice();

    const loadedProgram = loadProgramSource(program);
    this.instructions = loadedProgram.instructions;
    this.clonedInstructions = loadedProgram.sourceLines;
    this.labels = loadedProgram.codeLabels;
    this.symbols = loadedProgram.symbols;
    this.symbolLookup = loadedProgram.symbolLookup;
    this.endPointer = loadedProgram.endPointer;
    this.errors = [...loadedProgram.errors];
    this.initialMemory = { ...loadedProgram.memoryImage };
    this.memory.setMemory(this.initialMemory);
    this.registers[STACK_POINTER_REGISTER] = DEFAULT_STACK_POINTER;

    if (loadedProgram.exception) {
      this.exception = loadedProgram.exception;
      return;
    }

    if (!this.endPointer) {
      this.exception = Strings.END_MISSING;
      return;
    }

    this.lastInstruction = this.instructions.length > 0 ? this.instructions[0][0] : '';

    // Push initial frame to undo stack
    this.undo.push(
      this.pc,
      this.ccr,
      this.registers,
      this.memory.createSnapshot(),
      this.errors,
      Strings.LAST_INSTRUCTION_DEFAULT_TEXT,
      this.line
    );
  }

  /**
   * Check if PC is valid (aligned and >= 0)
   */
  private checkPC(pc: number): boolean {
    return 0 <= pc / 4 && pc % 4 === 0;
  }

  /**
   * Parse operation size from instruction (e.g., ".b", ".w", ".l")
   */
  private parseOpSize(instr: string, errorsSuppressed: boolean): number {
    if (instr.indexOf('.') !== -1) {
      const size = instr.charAt(instr.indexOf('.') + 1);
      switch (size.toLowerCase()) {
        case 'b':
          return CODE_BYTE;
        case 'w':
          return CODE_WORD;
        case 'l':
          return CODE_LONG;
        default:
          if (!errorsSuppressed) {
            this.errors.push(Strings.INVALID_OP_SIZE + Strings.AT_LINE + this.line);
          }
          return CODE_WORD;
      }
    }
    // Default to WORD if no size specified
    return CODE_WORD;
  }

  /**
   * Parse register name to index
   */
  private parseRegisters(register: string): number | undefined {
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
        this.errors.push(Strings.INVALID_REGISTER + Strings.AT_LINE + this.line);
        return undefined;
    }
  }

  private resolveSymbolAddress(symbol: string): number | undefined {
    return this.symbolLookup[symbol.trim().toLowerCase()];
  }

  private parseNumericValue(token: string): number | undefined {
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

  private splitOperands(operandStr: string): string[] {
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

  private parseRegisterList(token: string): Operand | undefined {
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
        const start = this.parseRegisters(startToken);
        const end = this.parseRegisters(endToken);

        if (start === undefined || end === undefined) {
          return undefined;
        }

        const step = start <= end ? 1 : -1;
        for (let register = start; register !== end + step; register += step) {
          registerList.push(register);
        }
        continue;
      }

      const register = this.parseRegisters(segment);
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

  private parseIndexRegister(token: string): Pick<Operand, 'indexRegister' | 'indexSize'> | undefined {
    const [registerToken, sizeToken] = token.split('.').map((part) => part.trim());
    const register = this.parseRegisters(registerToken);

    if (register === undefined) {
      return undefined;
    }

    let indexSize = CODE_WORD;
    if (sizeToken) {
      if (sizeToken.toLowerCase() === 'l') {
        indexSize = CODE_LONG;
      } else if (sizeToken.toLowerCase() !== 'w') {
        this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
        return undefined;
      }
    }

    return {
      indexRegister: register,
      indexSize,
    };
  }

  private getTransferSize(size: number, registerIndex?: number): number {
    if (size === CODE_BYTE) {
      return registerIndex === STACK_POINTER_REGISTER ? 2 : 1;
    }

    if (size === CODE_WORD) {
      return 2;
    }

    return 4;
  }

  private signExtendWord(value: number): number {
    const signed = new Int16Array(1);
    signed[0] = value & WORD_MASK;
    return signed[0];
  }

  private getIndexedOffset(operand: Operand): number {
    if (operand.indexRegister === undefined) {
      return 0;
    }

    const registerValue = this.registers[operand.indexRegister];
    if (operand.indexSize === CODE_LONG) {
      return registerValue;
    }

    return this.signExtendWord(registerValue);
  }

  private resolveOperandAddress(operand: Operand): number | undefined {
    if (operand.type === TOKEN_OFFSET) {
      return operand.value >>> 0;
    }

    if (operand.type !== TOKEN_OFFSET_ADDR) {
      this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
      return undefined;
    }

    const baseRegister = operand.value;
    return (
      (this.registers[baseRegister] + (operand.offset ?? 0) + this.getIndexedOffset(operand)) >>>
      0
    );
  }

  private readMemoryValue(address: number, size: number): number {
    if (size === CODE_BYTE) {
      return this.memory.getByte(address);
    }

    if (size === CODE_WORD) {
      return this.memory.getWord(address);
    }

    return this.memory.getLong(address);
  }

  private writeMemoryValue(address: number, size: number, value: number): void {
    if (size === CODE_BYTE) {
      this.memory.setByte(address, value & BYTE_MASK);
      return;
    }

    if (size === CODE_WORD) {
      this.memory.setWord(address, value & WORD_MASK);
      return;
    }

    this.memory.setLong(address, value >>> 0);
  }

  private readOperandValue(op: Operand, size: number): number | undefined {
    if (op.type === TOKEN_IMMEDIATE) {
      return op.value;
    }

    if (op.type === TOKEN_REG_DATA || op.type === TOKEN_REG_ADDR) {
      return this.registers[op.value];
    }

    if (op.type === TOKEN_OFFSET) {
      return this.readMemoryValue(op.value, size);
    }

    if (op.type === TOKEN_OFFSET_ADDR) {
      const baseRegister = op.value;
      const step = this.getTransferSize(size, baseRegister);

      if (op.preDecrement) {
        this.registers[baseRegister] -= step;
      }

      const address = this.resolveOperandAddress(op);
      if (address === undefined) {
        return undefined;
      }

      const value = this.readMemoryValue(address, size);

      if (op.postIncrement) {
        this.registers[baseRegister] += step;
      }

      return value;
    }

    this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
    return undefined;
  }

  private writeOperandValue(op: Operand, size: number, value: number): void {
    if (op.type === TOKEN_REG_DATA || op.type === TOKEN_REG_ADDR) {
      this.registers[op.value] = value;
      return;
    }

    if (op.type === TOKEN_OFFSET) {
      this.writeMemoryValue(op.value, size, value);
      return;
    }

    if (op.type === TOKEN_OFFSET_ADDR) {
      const baseRegister = op.value;
      const step = this.getTransferSize(size, baseRegister);

      if (op.preDecrement) {
        this.registers[baseRegister] -= step;
      }

      const address = this.resolveOperandAddress(op);
      if (address === undefined) {
        return;
      }

      this.writeMemoryValue(address, size, value);

      if (op.postIncrement) {
        this.registers[baseRegister] += step;
      }

      return;
    }

    this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
  }

  private pushLongToStack(value: number): void {
    this.registers[STACK_POINTER_REGISTER] -= 4;
    this.memory.setLong(this.registers[STACK_POINTER_REGISTER], value >>> 0);
  }

  private popLongFromStack(): number {
    const value = this.memory.getLong(this.registers[STACK_POINTER_REGISTER]);
    this.registers[STACK_POINTER_REGISTER] += 4;
    return value >>> 0;
  }

  private branchToLabel(label: string): boolean {
    const normalizedLabel = label.trim().toLowerCase();
    const labelKey = Object.keys(this.labels).find((key) => key.toLowerCase() === normalizedLabel);

    if (!labelKey || this.labels[labelKey] === undefined) {
      this.errors.push(Strings.UNKNOWN_LABEL + normalizedLabel + Strings.AT_LINE + this.line);
      return false;
    }

    this.pc = this.labels[labelKey] * 4;
    return true;
  }

  private updateBtstFlags(bitSet: boolean): void {
    if (bitSet) {
      this.ccr = (this.ccr & 0xfb) >>> 0;
      return;
    }

    this.ccr = (this.ccr | 0x04) >>> 0;
  }

  private parseDirectiveOperandValue(instruction: string): number | undefined {
    const match = /^dc\.[bwl]\s+(.+)$/i.exec(instruction.trim());
    if (!match) {
      return undefined;
    }

    const operandText = this.splitOperands(match[1])[0]?.trim();
    if (!operandText) {
      return undefined;
    }

    return this.parseNumericValue(operandText) ?? this.resolveSymbolAddress(operandText);
  }

  private readTrapTaskWord(): number | undefined {
    const taskInstructionIndex = Math.floor(this.pc / 4);
    const taskInstruction = this.instructions[taskInstructionIndex];

    if (!taskInstruction) {
      return undefined;
    }

    const taskValue = this.parseDirectiveOperandValue(taskInstruction[0]);
    if (taskValue === undefined) {
      return undefined;
    }

    this.pc += 4;
    return taskValue;
  }

  private deliverInputByte(byte: number): void {
    this.registers[8] = moveOP(byte & BYTE_MASK, this.registers[8], this.ccr, CODE_BYTE)[0];
  }

  private servicePendingInputTrap(): boolean {
    if (!this.waitingForInput) {
      return false;
    }

    if (this.pendingInputTask !== 3) {
      this.waitingForInput = false;
      this.pendingInputTask = undefined;
      return false;
    }

    if (this.inputQueue.length === 0) {
      return false;
    }

    const inputByte = this.inputQueue.shift() ?? 0;
    this.deliverInputByte(inputByte);
    this.waitingForInput = false;
    this.pendingInputTask = undefined;
    return true;
  }

  private haltExecution(): void {
    this.halted = true;
  }

  private trap(op: Operand): void {
    const vector = this.readOperandValue(op, CODE_LONG);
    if (vector === undefined) {
      return;
    }

    const task = this.readTrapTaskWord();
    if (task === undefined) {
      this.exception = Strings.MISSING_TRAP_TASK + Strings.AT_LINE + this.line;
      return;
    }

    switch (vector & BYTE_MASK) {
      case 0x0b:
        if (task === 0) {
          this.haltExecution();
          return;
        }
        break;
      case 0x0f:
        if (task === 1) {
          this.terminal.writeByte(this.registers[8] & BYTE_MASK);
          return;
        }

        if (task === 3) {
          if (this.inputQueue.length === 0) {
            this.waitingForInput = true;
            this.pendingInputTask = task;
            return;
          }

          this.deliverInputByte(this.inputQueue.shift() ?? 0);
          return;
        }

        if (task === 4) {
          this.updateBtstFlags(this.inputQueue.length > 0);
          return;
        }
        break;
      default:
        break;
    }

    this.exception =
      Strings.UNSUPPORTED_TRAP_VECTOR + `${vector & BYTE_MASK}:${task}` + Strings.AT_LINE + this.line;
  }

  /**
   * Parse an operand token into type and value
   */
  private parseOperand(token: string): Operand | undefined {
    const res: Operand = {
      value: 0,
      type: 0,
      offset: undefined,
    };

    token = token.trim();

    if (token.includes('/') || /^[adsp][0-7]?\s*-\s*[adsp][0-7]?/i.test(token)) {
      const registerList = this.parseRegisterList(token);
      if (registerList !== undefined) {
        return registerList;
      }
    }

    if (token.startsWith('-(') && token.endsWith(')')) {
      const result = this.parseOperand(token.substring(2, token.length - 1));
      if (result === undefined || result.type !== TOKEN_REG_ADDR) {
        this.errors.push(Strings.NOT_AN_ADDRESS_REGISTER + Strings.AT_LINE + this.line);
        return undefined;
      }

      res.value = result.value;
      res.type = TOKEN_OFFSET_ADDR;
      res.offset = 0;
      res.preDecrement = true;
      return res;
    }

    if (token.startsWith('(') && token.endsWith(')+')) {
      const result = this.parseOperand(token.substring(1, token.length - 2));
      if (result === undefined || result.type !== TOKEN_REG_ADDR) {
        this.errors.push(Strings.NOT_AN_ADDRESS_REGISTER + Strings.AT_LINE + this.line);
        return undefined;
      }

      res.value = result.value;
      res.type = TOKEN_OFFSET_ADDR;
      res.offset = 0;
      res.postIncrement = true;
      return res;
    }

    // Handle address register with offset: (a0), $10(a0), etc.
    if (token.indexOf('(') !== -1 && token.indexOf(')') !== -1) {
      if (token.charAt(0) === '(') {
        const result = this.parseOperand(
          token.substring(token.indexOf('(') + 1, token.indexOf(')'))
        );
        if (result === undefined || result.type !== TOKEN_REG_ADDR) {
          this.errors.push(Strings.NOT_AN_ADDRESS_REGISTER + Strings.AT_LINE + this.line);
          return undefined;
        }
        res.value = result.value;
        res.type = TOKEN_OFFSET_ADDR;
        res.offset = 0;
        return res;
      }

      const displacementToken = token.substring(0, token.indexOf('(')).trim();
      const innerToken = token.substring(token.indexOf('(') + 1, token.indexOf(')'));
      const [registerToken, indexToken] = innerToken.split(',').map((part) => part.trim());
      const displacementValue =
        displacementToken === ''
          ? 0
          : (this.parseNumericValue(displacementToken) ??
            this.resolveSymbolAddress(displacementToken));
      const result = this.parseOperand(registerToken);
      if (result === undefined || result.type !== TOKEN_REG_ADDR) {
        this.errors.push(Strings.NOT_AN_ADDRESS_REGISTER + Strings.AT_LINE + this.line);
        return undefined;
      }
      if (displacementValue === undefined) {
        this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
        return undefined;
      }
      const indexedOperand = indexToken ? this.parseIndexRegister(indexToken) : undefined;
      if (indexToken && indexedOperand === undefined) {
        return undefined;
      }
      res.offset = displacementValue;
      res.value = result.value;
      res.type = TOKEN_OFFSET_ADDR;
      res.indexRegister = indexedOperand?.indexRegister;
      res.indexSize = indexedOperand?.indexSize;
      return res;
    }

    // Check for address register
    if (/^(a[0-7]|sp)$/i.test(token)) {
      res.value = this.parseRegisters(token) ?? 0;
      res.type = TOKEN_REG_ADDR;
      return res;
    }

    // Check for data register
    if (/^d[0-7]$/i.test(token)) {
      res.value = this.parseRegisters(token) ?? 0;
      res.type = TOKEN_REG_DATA;
      return res;
    }

    // Check for immediate value
    if (token.charAt(0) === '#') {
      const immediateToken = token.substring(1).trim();

      if (
        immediateToken.length >= 3 &&
        immediateToken.startsWith("'") &&
        immediateToken.endsWith("'")
      ) {
        res.value = immediateToken.charCodeAt(1) & 0xff;
        res.type = TOKEN_IMMEDIATE;
        return res;
      }

      if (SYMBOL_REGEX.test(immediateToken)) {
        const symbolAddress = this.resolveSymbolAddress(immediateToken);
        if (symbolAddress !== undefined) {
          res.value = symbolAddress;
          res.type = TOKEN_IMMEDIATE;
          return res;
        }
      }

      const numericValue =
        this.parseNumericValue(immediateToken.startsWith('$') || immediateToken.startsWith('%')
          ? immediateToken
          : immediateToken);

      if (numericValue !== undefined) {
        res.value = numericValue;
        res.type = TOKEN_IMMEDIATE;
        return res;
      }
    }

    // Check for offset/address
    const directValue = this.parseNumericValue(token);
    if (directValue !== undefined) {
      res.value = directValue;
      res.type = TOKEN_OFFSET;
      return res;
    }

    // Check for label
    if (SYMBOL_REGEX.test(token)) {
      const symbolAddress = this.resolveSymbolAddress(token);
      if (symbolAddress !== undefined) {
        res.value = symbolAddress;
        res.type = TOKEN_OFFSET;
        res.label = token;
        return res;
      }

      res.value = 0; // Will be resolved later based on label position
      res.type = TOKEN_LABEL;
      res.label = token; // Store the label name
      return res;
    }

    this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
    return undefined;
  }

  /**
   * Execute a single emulation step
   * Returns true if execution should stop
   */
  emulationStep(): boolean {
    // Check for previous exceptions
    if (this.exception) return true;
    if (this.halted) return true;

    if (this.waitingForInput) {
      this.servicePendingInputTrap();
      return false;
    }

    // Check if we've reached end of program
    if (this.pc / 4 >= this.instructions.length) {
      this.lastInstruction =
        this.instructions.length > 0
          ? this.instructions[this.instructions.length - 1][0]
          : '';
      return true;
    }

    // Check PC validity
    if (!this.checkPC(this.pc)) {
      this.exception = Strings.INVALID_PC_EXCEPTION;
      return true;
    }

    // Push current state to undo stack
    if (this.pc !== 0 && !this.undo.isAtCapacity())
      this.undo.push(
        this.pc,
        this.ccr,
        this.registers,
        this.memory.createSnapshot(),
        this.errors,
        this.lastInstruction,
        this.line
      );

    // Get current instruction
    const instrIdx = Math.floor(this.pc / 4);
    const instr = this.instructions[instrIdx][0];
    const flag = this.instructions[instrIdx][2];
    this.line = this.instructions[instrIdx][1];
    this.lastInstruction = this.clonedInstructions[this.line - 1] || instr;
    this.pc += 4;

    // Skip directives and labels
    if (flag === true) {
      return false;
    }

    // Parse and execute instruction
    this.executeInstruction(instr);
    return this.halted || this.exception !== undefined;
  }

  /**
   * Execute a single instruction
   */
  private executeInstruction(instr: string): boolean {
    const firstWhitespaceIndex = instr.search(/\s/);

    if (firstWhitespaceIndex === -1 && instr.length > 0) {
      // Single-operand or no-operand instruction
      switch (instr.toLowerCase()) {
        case 'rts':
          this.rts();
          break;
        default:
          this.errors.push(Strings.UNRECOGNISED_INSTRUCTION + Strings.AT_LINE + this.line);
          return false;
      }
    } else {
      // Multi-operand instruction
      let operation: string;
      let operands: Operand[] = [];
      let size: number = CODE_WORD;

      if (instr.indexOf('.') !== -1) {
        operation = instr.substring(0, instr.indexOf('.')).trim();
      } else {
        operation = instr.substring(0, firstWhitespaceIndex).trim();
      }

      const operandStr = instr.substring(firstWhitespaceIndex).trim();
      const operandTokens = this.splitOperands(operandStr);
      operands =
        operation.toLowerCase() === 'movem'
          ? (operandTokens
              .map((token) => this.parseRegisterList(token) ?? this.parseOperand(token))
              .filter((operand) => operand !== undefined) as Operand[])
          : (operandTokens
              .map((t) => this.parseOperand(t))
              .filter((o) => o !== undefined) as Operand[]);

      size = this.parseOpSize(instr, false);

      // Execute instruction
      switch (operation.toLowerCase()) {
        case 'add':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.add(size, operands[0], operands[1], false);
          break;
        case 'adda':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.adda(size, operands[0], operands[1]);
          break;
        case 'addi':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.addi(size, operands[0], operands[1]);
          break;
        case 'addq':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.addq(size, operands[0], operands[1]);
          break;
        case 'sub':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.add(size, operands[0], operands[1], true);
          break;
        case 'suba':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.suba(size, operands[0], operands[1]);
          break;
        case 'subi':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.subi(size, operands[0], operands[1]);
          break;
        case 'subq':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.subq(size, operands[0], operands[1]);
          break;
        case 'muls':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.muls(size, operands[0], operands[1]);
          break;
        case 'mulu':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.mulu(size, operands[0], operands[1]);
          break;
        case 'divs':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.divs(size, operands[0], operands[1]);
          break;
        case 'divu':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.divu(size, operands[0], operands[1]);
          break;
        case 'move':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.move(size, operands[0], operands[1]);
          break;
        case 'clr':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.clr(size, operands[0]);
          break;
        case 'cmp':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.cmp(size, operands[0], operands[1]);
          break;
        case 'cmpa':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.cmpa(operands[0], operands[1]);
          break;
        case 'cmpi':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.cmpi(size, operands[0], operands[1]);
          break;
        case 'tst':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.tst(size, operands[0]);
          break;
        case 'and':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.and(size, operands[0], operands[1]);
          break;
        case 'andi':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.andi(size, operands[0], operands[1]);
          break;
        case 'or':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.or(size, operands[0], operands[1]);
          break;
        case 'ori':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.ori(size, operands[0], operands[1]);
          break;
        case 'eor':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.eor(size, operands[0], operands[1]);
          break;
        case 'eori':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.eori(size, operands[0], operands[1]);
          break;
        case 'not':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.not(size, operands[0]);
          break;
        case 'neg':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.neg(size, operands[0]);
          break;
        case 'jmp':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.jmp(operandTokens[0]);
          break;
        case 'jsr':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.jsr(operandTokens[0]);
          break;
        case 'trap':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.trap(operands[0]);
          break;
        case 'bsr':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.bsr(operandTokens[0]);
          break;
        case 'mode':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.mode(operands[0], operands[1]);
          break;
        case 'movea':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.movea(size, operands[0], operands[1]);
          break;
        case 'exg':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.exg(operands[0], operands[1]);
          break;
        case 'swap':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.swap(operands[0]);
          break;
        case 'ext':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.ext(size, operands[0]);
          break;
        case 'lea':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.lea(operands[0], operands[1]);
          break;
        case 'movem':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.movem(size, operands[0], operands[1]);
          break;
        case 'btst':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.btst(operands[0], operands[1]);
          break;
        case 'bra':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.bra(operandTokens[0]);
          break;
        case 'beq':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.beq(operandTokens[0]);
          break;
        case 'bne':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.bne(operandTokens[0]);
          break;
        case 'bge':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.bge(operandTokens[0]);
          break;
        case 'bgt':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.bgt(operandTokens[0]);
          break;
        case 'ble':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.ble(operandTokens[0]);
          break;
        case 'blt':
          if (operands.length !== 1) {
            this.errors.push(Strings.ONE_PARAMETER_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.blt(operandTokens[0]);
          break;
        case 'asl':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.asl(size, operands[0], operands[1]);
          break;
        case 'asr':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.asr(size, operands[0], operands[1]);
          break;
        case 'lsl':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.lsl(size, operands[0], operands[1]);
          break;
        case 'lsr':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.lsr(size, operands[0], operands[1]);
          break;
        case 'rol':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.rol(size, operands[0], operands[1]);
          break;
        case 'ror':
          if (operands.length !== 2) {
            this.errors.push(Strings.TWO_PARAMETERS_EXPECTED + Strings.AT_LINE + this.line);
            break;
          }
          this.ror(size, operands[0], operands[1]);
          break;
        default:
          this.errors.push(Strings.UNRECOGNISED_INSTRUCTION + Strings.AT_LINE + this.line);
          return false;
      }
    }

    return false;
  }

  // ============== Instruction Implementations ==============

  private add(size: number, op1: Operand, op2: Operand, isSub: boolean): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);

    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = addOP(src, dest, this.ccr, size, isSub);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private adda(_size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_LONG);
    if (src === undefined) {
      return;
    }

    if (op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] += src;
    }
  }

  private addi(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    // ADDI: Add immediate value
    // op1 must be immediate, op2 is destination
    if (op1.type !== TOKEN_IMMEDIATE) {
      this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
      return;
    }

    const dest = this.readOperandValue(op2, size);
    if (dest === undefined) {
      return;
    }

    const [result, newCCR] = addOP(op1.value, dest, this.ccr, size, false);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private addq(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    // ADDQ: Add quick (immediate 1-8)
    if (op1.type !== TOKEN_IMMEDIATE) {
      this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
      return;
    }

    if (op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] += op1.value;
      return;
    }

    const dest = this.readOperandValue(op2, size);
    if (dest === undefined) {
      return;
    }

    const [result, newCCR] = addOP(op1.value, dest, this.ccr, size, false);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private suba(_size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_LONG);
    if (src === undefined) {
      return;
    }

    if (op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] -= src;
    }
  }

  private subi(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    // SUBI: Subtract immediate value
    if (op1.type !== TOKEN_IMMEDIATE) {
      this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
      return;
    }

    const dest = this.readOperandValue(op2, size);
    if (dest === undefined) {
      return;
    }

    const [result, newCCR] = addOP(op1.value, dest, this.ccr, size, true);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private subq(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    // SUBQ: Subtract quick (immediate 1-8)
    if (op1.type !== TOKEN_IMMEDIATE) {
      this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
      return;
    }

    if (op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] -= op1.value;
      return;
    }

    const dest = this.readOperandValue(op2, size);
    if (dest === undefined) {
      return;
    }

    const [result, newCCR] = addOP(op1.value, dest, this.ccr, size, true);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private mulu(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_WORD);
    if (src === undefined || op2.type !== TOKEN_REG_DATA) {
      return;
    }

    const [result, newCCR] = muluOP(size, src, this.registers[op2.value], this.ccr);
    this.registers[op2.value] = result;
    this.ccr = newCCR;
  }

  private muls(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_WORD);
    if (src === undefined || op2.type !== TOKEN_REG_DATA) {
      return;
    }

    const [result, newCCR] = mulsOP(size, src, this.registers[op2.value], this.ccr);
    this.registers[op2.value] = result;
    this.ccr = newCCR;
  }

  private divu(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_WORD);
    if (src === undefined) {
      return;
    }

    if ((src & WORD_MASK) === 0x0) {
      this.exception = Strings.DIVISION_BY_ZERO + Strings.AT_LINE + this.line;
      return;
    }

    if (op2.type !== TOKEN_REG_DATA) {
      return;
    }

    const [result, newCCR] = divuOP(size, src, this.registers[op2.value], this.ccr);
    this.registers[op2.value] = result;
    this.ccr = newCCR;
  }

  private divs(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_WORD);
    if (src === undefined) {
      return;
    }

    if ((src & WORD_MASK) === 0x0) {
      this.exception = Strings.DIVISION_BY_ZERO + Strings.AT_LINE + this.line;
      return;
    }

    if (op2.type !== TOKEN_REG_DATA) {
      return;
    }

    const [result, newCCR] = divsOP(size, src, this.registers[op2.value], this.ccr);
    this.registers[op2.value] = result;
    this.ccr = newCCR;
  }

  private move(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const srcValue = this.readOperandValue(op1, size);
    if (srcValue === undefined) {
      return;
    }

    const destValue =
      op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR
        ? this.registers[op2.value]
        : 0;
    const [result, newCCR] = moveOP(srcValue, destValue, this.ccr, size);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private clr(size: number, op: Operand): void {
    const currentValue = this.readOperandValue(op, size);
    if (currentValue === undefined) {
      return;
    }

    const [result, newCCR] = clrOP(size, currentValue, this.ccr);
    this.writeOperandValue(op, size, result);
    this.ccr = newCCR;
  }

  private cmp(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    this.ccr = cmpOP(src, dest, this.ccr, size);
  }

  private cmpa(op1: Operand, op2: Operand): void {
    // CMPA: Compare with address register (always long size)
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, CODE_LONG);
    if (src === undefined || op2.type !== TOKEN_REG_ADDR) {
      return;
    }

    this.ccr = cmpOP(src, this.registers[op2.value], this.ccr, CODE_LONG);
  }

  private cmpi(size: number, op1: Operand, op2: Operand): void {
    // CMPI: Compare immediate (first operand must be immediate)
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    this.ccr = cmpOP(src, dest, this.ccr, size);
  }

  private tst(size: number, op: Operand): void {
    if (op === undefined) return;

    const value = this.readOperandValue(op, size);
    if (value === undefined) {
      return;
    }

    this.ccr = tstOP(value, this.ccr, size);
  }

  private and(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = andOP(size, src, dest, this.ccr);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private andi(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = andOP(size, src, dest, this.ccr);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private or(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = orOP(size, src, dest, this.ccr);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private ori(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = orOP(size, src, dest, this.ccr);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private eor(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = eorOP(size, src, dest, this.ccr);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private eori(size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const src = this.readOperandValue(op1, size);
    const dest = this.readOperandValue(op2, size);
    if (src === undefined || dest === undefined) {
      return;
    }

    const [result, newCCR] = eorOP(size, src, dest, this.ccr);
    this.writeOperandValue(op2, size, result);
    this.ccr = newCCR;
  }

  private not(size: number, op: Operand): void {
    if (op === undefined) return;

    const currentValue = this.readOperandValue(op, size);
    if (currentValue === undefined) {
      return;
    }

    const [result, newCCR] = notOP(size, currentValue, this.ccr);
    this.writeOperandValue(op, size, result);
    this.ccr = newCCR;
  }

  private neg(size: number, op: Operand): void {
    if (op === undefined) return;

    const currentValue = this.readOperandValue(op, size);
    if (currentValue === undefined) {
      return;
    }

    const [result, newCCR] = negOP(size, currentValue, this.ccr);
    this.writeOperandValue(op, size, result);
    this.ccr = newCCR;
  }

  private jmp(label: string): void {
    this.branchToLabel(label);
  }

  private jsr(label: string): void {
    this.pushLongToStack(this.pc);
    this.branchToLabel(label);
  }

  private rts(): void {
    this.pc = this.popLongFromStack();
    this.lastInstruction = 'RTS';
  }

  private bsr(label: string): void {
    this.pushLongToStack(this.pc);
    this.branchToLabel(label);
  }

  private mode(op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const srcValue = this.readOperandValue(op1, CODE_LONG);
    if (srcValue === undefined) {
      return;
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] = srcValue;
      this.lastInstruction = `MODE #${srcValue}, ${op2.type === TOKEN_REG_DATA ? 'd' : 'a'}${op2.value % 8}`;
    }
  }

  private movea(_size: number, op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const srcValue = this.readOperandValue(op1, CODE_LONG);
    if (srcValue === undefined) {
      return;
    }

    if (op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] = srcValue;
    }
  }

  private exg(op1: Operand, op2: Operand): void {
    // EXG: Exchange registers
    if (op1 === undefined || op2 === undefined) return;

    if ((op1.type === TOKEN_REG_DATA && op2.type === TOKEN_REG_DATA) ||
        (op1.type === TOKEN_REG_ADDR && op2.type === TOKEN_REG_ADDR) ||
        (op1.type === TOKEN_REG_DATA && op2.type === TOKEN_REG_ADDR) ||
        (op1.type === TOKEN_REG_ADDR && op2.type === TOKEN_REG_DATA)) {
      const [newOp2, newOp1] = exgOP(this.registers[op1.value], this.registers[op2.value]);
      this.registers[op1.value] = newOp1;
      this.registers[op2.value] = newOp2;
    } else {
      this.errors.push(Strings.EXG_RESTRICTIONS + Strings.AT_LINE + this.line);
    }
  }

  private swap(op: Operand): void {
    // SWAP: Exchange word halves in a data register
    if (op === undefined) return;

    if (op.type === TOKEN_REG_DATA) {
      const [result, newCCR] = swapOP(this.registers[op.value], this.ccr);
      this.registers[op.value] = result;
      this.ccr = newCCR;
    } else {
      this.errors.push(Strings.DATA_ONLY_SWAP + Strings.AT_LINE + this.line);
    }
  }

  private ext(size: number, op: Operand): void {
    // EXT: Sign extend
    if (op === undefined) return;

    if (op.type === TOKEN_REG_DATA) {
      if (size === CODE_BYTE) {
        this.errors.push(Strings.EXT_ON_BYTE + Strings.AT_LINE + this.line);
        return;
      }
      const [result, newCCR] = extOP(size, this.registers[op.value], this.ccr);
      this.registers[op.value] = result;
      this.ccr = newCCR;
    } else {
      this.errors.push(Strings.DATA_ONLY_EXT + Strings.AT_LINE + this.line);
    }
  }

  private lea(op1: Operand, op2: Operand): void {
    if (op1 === undefined || op2 === undefined) return;

    const address = this.resolveOperandAddress(op1);
    if (address === undefined) {
      return;
    }

    if (op2.type === TOKEN_REG_ADDR) {
      this.registers[op2.value] = address;
    }
  }

  private movem(size: number, op1: Operand, op2: Operand): void {
    const transferSize = size === CODE_WORD ? CODE_WORD : CODE_LONG;
    const bytesPerRegister = this.getTransferSize(transferSize);

    if (op1.type === TOKEN_REGISTER_LIST) {
      const registers = op1.registerList ?? [];
      if (registers.length === 0) {
        return;
      }

      let address = 0;
      if (op2.type === TOKEN_OFFSET_ADDR && op2.preDecrement) {
        const totalBytes = registers.length * bytesPerRegister;
        this.registers[op2.value] -= totalBytes;
        address = this.registers[op2.value] >>> 0;

        for (const register of registers) {
          this.writeMemoryValue(address, transferSize, this.registers[register]);
          address += bytesPerRegister;
        }
        return;
      }

      const resolvedAddress = this.resolveOperandAddress(op2);
      if (resolvedAddress === undefined) {
        return;
      }
      address = resolvedAddress;

      for (const register of registers) {
        this.writeMemoryValue(address, transferSize, this.registers[register]);
        address += bytesPerRegister;
      }

      if (op2.type === TOKEN_OFFSET_ADDR && op2.postIncrement) {
        this.registers[op2.value] += registers.length * bytesPerRegister;
      }
      return;
    }

    if (op2.type !== TOKEN_REGISTER_LIST) {
      this.errors.push(Strings.UNKNOWN_OPERAND + Strings.AT_LINE + this.line);
      return;
    }

    const registers = op2.registerList ?? [];
    if (registers.length === 0) {
      return;
    }

    let address = 0;
    if (op1.type === TOKEN_OFFSET_ADDR && op1.preDecrement) {
      const totalBytes = registers.length * bytesPerRegister;
      this.registers[op1.value] -= totalBytes;
      address = this.registers[op1.value] >>> 0;
    } else {
      const resolvedAddress = this.resolveOperandAddress(op1);
      if (resolvedAddress === undefined) {
        return;
      }
      address = resolvedAddress;
    }

    for (const register of registers) {
      this.registers[register] = this.readMemoryValue(address, transferSize);
      address += bytesPerRegister;
    }

    if (op1.type === TOKEN_OFFSET_ADDR && op1.postIncrement) {
      this.registers[op1.value] += registers.length * bytesPerRegister;
    }
  }

  private btst(op1: Operand, op2: Operand): void {
    const bitValue = this.readOperandValue(op1, CODE_LONG);
    if (bitValue === undefined) {
      return;
    }

    const isRegisterTarget = op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR;
    const bitNumber = isRegisterTarget ? bitValue & 31 : bitValue & 7;
    const targetValue = this.readOperandValue(op2, isRegisterTarget ? CODE_LONG : CODE_BYTE);
    if (targetValue === undefined) {
      return;
    }

    const bitSet = ((targetValue >>> bitNumber) & 0x1) === 1;
    this.updateBtstFlags(bitSet);
  }

  private bra(label: string): void {
    this.branchToLabel(label);
  }

  private beq(label: string): void {
    // BEQ: Branch if Equal (Z flag set)
    if (this.getZFlag()) {
      this.bra(label);
    }
  }

  private bne(label: string): void {
    // BNE: Branch if Not Equal (Z flag clear)
    if (!this.getZFlag()) {
      this.bra(label);
    }
  }

  private bge(label: string): void {
    // BGE: Branch if Greater or Equal (N flag == V flag)
    if (this.getNFlag() === this.getVFlag()) {
      this.bra(label);
    }
  }

  private bgt(label: string): void {
    // BGT: Branch if Greater Than (N flag == V flag AND Z flag clear)
    if (this.getNFlag() === this.getVFlag() && !this.getZFlag()) {
      this.bra(label);
    }
  }

  private ble(label: string): void {
    // BLE: Branch if Less or Equal (N flag != V flag OR Z flag set)
    if (this.getNFlag() !== this.getVFlag() || this.getZFlag()) {
      this.bra(label);
    }
  }

  private blt(label: string): void {
    // BLT: Branch if Less Than (N flag != V flag)
    if (this.getNFlag() !== this.getVFlag()) {
      this.bra(label);
    }
  }

  private asl(size: number, op1: Operand, op2: Operand): void {
    // ASL: Arithmetic Shift Left
    if (op1 === undefined || op2 === undefined) return;

    let shiftCount = 0;
    if (op1.type === TOKEN_IMMEDIATE) {
      shiftCount = op1.value;
    } else if (op1.type === TOKEN_REG_DATA) {
      shiftCount = this.registers[op1.value] & 0x3F; // Only lower 6 bits used
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      const [result, newCCR] = aslOP(shiftCount, this.registers[op2.value], this.ccr, size);
      this.registers[op2.value] = result;
      this.ccr = newCCR;
    }
  }

  private asr(size: number, op1: Operand, op2: Operand): void {
    // ASR: Arithmetic Shift Right
    if (op1 === undefined || op2 === undefined) return;

    let shiftCount = 0;
    if (op1.type === TOKEN_IMMEDIATE) {
      shiftCount = op1.value;
    } else if (op1.type === TOKEN_REG_DATA) {
      shiftCount = this.registers[op1.value] & 0x3F;
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      const [result, newCCR] = asrOP(shiftCount, this.registers[op2.value], this.ccr, size);
      this.registers[op2.value] = result;
      this.ccr = newCCR;
    }
  }

  private lsl(size: number, op1: Operand, op2: Operand): void {
    // LSL: Logical Shift Left
    if (op1 === undefined || op2 === undefined) return;

    let shiftCount = 0;
    if (op1.type === TOKEN_IMMEDIATE) {
      shiftCount = op1.value;
    } else if (op1.type === TOKEN_REG_DATA) {
      shiftCount = this.registers[op1.value] & 0x3F;
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      const [result, newCCR] = lslOP(shiftCount, this.registers[op2.value], this.ccr, size);
      this.registers[op2.value] = result;
      this.ccr = newCCR;
    }
  }

  private lsr(size: number, op1: Operand, op2: Operand): void {
    // LSR: Logical Shift Right
    if (op1 === undefined || op2 === undefined) return;

    let shiftCount = 0;
    if (op1.type === TOKEN_IMMEDIATE) {
      shiftCount = op1.value;
    } else if (op1.type === TOKEN_REG_DATA) {
      shiftCount = this.registers[op1.value] & 0x3F;
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      const [result, newCCR] = lsrOP(shiftCount, this.registers[op2.value], this.ccr, size);
      this.registers[op2.value] = result;
      this.ccr = newCCR;
    }
  }

  private rol(size: number, op1: Operand, op2: Operand): void {
    // ROL: Rotate Left
    if (op1 === undefined || op2 === undefined) return;

    let shiftCount = 0;
    if (op1.type === TOKEN_IMMEDIATE) {
      shiftCount = op1.value;
    } else if (op1.type === TOKEN_REG_DATA) {
      shiftCount = this.registers[op1.value] & 0x3F;
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      const [result, newCCR] = rolOP(shiftCount, this.registers[op2.value], this.ccr, size);
      this.registers[op2.value] = result;
      this.ccr = newCCR;
    }
  }

  private ror(size: number, op1: Operand, op2: Operand): void {
    // ROR: Rotate Right
    if (op1 === undefined || op2 === undefined) return;

    let shiftCount = 0;
    if (op1.type === TOKEN_IMMEDIATE) {
      shiftCount = op1.value;
    } else if (op1.type === TOKEN_REG_DATA) {
      shiftCount = this.registers[op1.value] & 0x3F;
    }

    if (op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR) {
      const [result, newCCR] = rorOP(shiftCount, this.registers[op2.value], this.ccr, size);
      this.registers[op2.value] = result;
      this.ccr = newCCR;
    }
  }

  // ============== Getters ==============

  getPC(): number {
    return this.pc;
  }

  getRegisters(): Int32Array {
    return this.registers;
  }

  getCCR(): number {
    return this.ccr;
  }

  getSR(): number {
    return this.ccr & 0x1f;
  }

  getUSP(): number {
    return this.registers[STACK_POINTER_REGISTER] >>> 0;
  }

  getSSP(): number {
    return this.registers[STACK_POINTER_REGISTER] >>> 0;
  }

  getMemory(): Record<number, number> {
    return this.memory.getMemory();
  }

  getMemoryMeta(): { usedBytes: number; minAddress: number | null; maxAddress: number | null; version: number } {
    const addressRange = this.memory.getAddressRange();
    return {
      usedBytes: this.memory.getUsedBytes(),
      minAddress: addressRange.minAddress,
      maxAddress: addressRange.maxAddress,
      version: this.memory.getMemoryVersion(),
    };
  }

  readMemoryRange(address: number, length: number): Uint8Array {
    return this.memory.readRange(address, length);
  }

  getTerminalSnapshot(): TerminalSnapshot {
    return this.terminal.getDebugSnapshot();
  }

  getTerminalDebugSnapshot(): TerminalSnapshot {
    return this.terminal.getDebugSnapshot();
  }

  getTerminalFrameBuffer(): TerminalFrameBuffer {
    return this.terminal.getFrameBuffer();
  }

  getTerminalMeta(): TerminalMeta {
    return this.terminal.getTerminalMeta();
  }

  getTerminalLines(): string[] {
    return this.terminal.getLines();
  }

  getTerminalText(): string {
    return this.terminal.getText();
  }

  queueInput(input: string | number | number[] | Uint8Array): void {
    if (typeof input === 'string') {
      for (const char of input) {
        this.inputQueue.push(char.charCodeAt(0) & BYTE_MASK);
      }
      return;
    }

    if (typeof input === 'number') {
      this.inputQueue.push(input & BYTE_MASK);
      return;
    }

    for (const value of input) {
      this.inputQueue.push(value & BYTE_MASK);
    }
  }

  clearInputQueue(): void {
    this.inputQueue = [];
  }

  getQueuedInputLength(): number {
    return this.inputQueue.length;
  }

  isWaitingForInput(): boolean {
    return this.waitingForInput;
  }

  isHalted(): boolean {
    return this.halted;
  }

  getSymbols(): Record<string, number> {
    return { ...this.symbols };
  }

  getSymbolAddress(symbol: string): number | undefined {
    return this.resolveSymbolAddress(symbol);
  }

  getZFlag(): number {
    return (this.ccr & 0x04) >>> 2;
  }

  getVFlag(): number {
    return (this.ccr & 0x02) >>> 1;
  }

  getNFlag(): number {
    return (this.ccr & 0x08) >>> 3;
  }

  getCFlag(): number {
    return (this.ccr & 0x01) >>> 0;
  }

  getXFlag(): number {
    return (this.ccr & 0x10) >>> 4;
  }

  getLastInstruction(): string {
    return this.lastInstruction;
  }

  getErrors(): string[] {
    return this.errors;
  }

  getException(): string | undefined {
    return this.exception;
  }

  /**
   * Perform undo operation
   */
  undoFromStack(): void {
    const frame = this.undo.pop();
    if (frame === undefined) return;

    this.pc = frame.pc;
    this.ccr = frame.ccr;
    this.lastInstruction = frame.lastInstruction;
    this.line = frame.line;
    this.registers = new Int32Array(frame.registers);
    this.memory.restoreSnapshot(frame.memory);
    this.errors = [...frame.errors];
    this.waitingForInput = false;
    this.halted = false;
    this.pendingInputTask = undefined;
  }

  /**
   * Reset emulator to initial state
   */
  reset(): void {
    this.pc = 0x0;
    this.ccr = 0x00;
    this.registers.fill(0);
    this.registers[STACK_POINTER_REGISTER] = DEFAULT_STACK_POINTER;
    this.memory.setMemory(this.initialMemory);
    this.undo.clear();
    this.terminal.reset();
    this.inputQueue = [];
    this.waitingForInput = false;
    this.halted = false;
    this.pendingInputTask = undefined;
    this.lastInstruction = Strings.LAST_INSTRUCTION_DEFAULT_TEXT;
    this.exception = undefined;
    this.errors = [];
    this.line = 0;

    // Re-push initial frame
    this.undo.push(
      this.pc,
      this.ccr,
      this.registers,
      this.memory.createSnapshot(),
      this.errors,
      Strings.LAST_INSTRUCTION_DEFAULT_TEXT,
      this.line
    );
  }
}
