/**
 * M68K Emulator - Main execution engine
 * Handles instruction parsing, execution, registers, memory, and condition codes
 */

import { loadProgramSource, type ProgramSource } from '../programLoader';
import {
  resolveDecodedInstruction,
  type DecodedInstruction,
  type DecodedOperand,
} from '../instructionDecoder';
import { TerminalDevice, type TerminalMeta, type TerminalSnapshot } from '../devices/terminal';
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
import type { RuntimeSyncVersions } from '../types/emulator';

// Token type constants
const TOKEN_IMMEDIATE = 0;
const TOKEN_OFFSET = 1;
const TOKEN_REG_ADDR = 2;
const TOKEN_REG_DATA = 3;
const TOKEN_OFFSET_ADDR = 4;
const TOKEN_REGISTER_LIST = 6;

const STACK_POINTER_REGISTER = 7;
const DEFAULT_STACK_POINTER = 0x00100000;
const DEFAULT_UNDO_CHECKPOINT_INTERVAL = 64;

type Operand = DecodedOperand;

export type UndoCaptureMode = 'full' | 'off' | 'checkpointed';

export interface EmulatorOptions {
  columns?: number;
  rows?: number;
  undoMode?: UndoCaptureMode;
  undoCheckpointInterval?: number;
}

function normalizeUndoCheckpointInterval(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_UNDO_CHECKPOINT_INTERVAL;
  }

  return Math.max(1, Math.floor(value ?? DEFAULT_UNDO_CHECKPOINT_INTERVAL));
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
  private decodedInstructions: DecodedInstruction[] = [];
  private resolvedInstructions: Array<DecodedInstruction | undefined> = [];
  private clonedInstructions: string[] = []; // Original instructions for display

  // State
  private codeLabelLookup: Record<string, number> = {};
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
  private pendingExternalInterruptAddress: number | undefined;
  private undoCaptureMode: UndoCaptureMode;
  private undoCheckpointInterval: number;
  private instructionsSinceUndoSnapshot = 0;
  private registerSyncVersion = 1;
  private executionSyncVersion = 1;
  private diagnosticsSyncVersion = 1;

  constructor(
    program: ProgramSource = '',
    options: EmulatorOptions = {}
  ) {
    this.memory = new Memory();
    this.undo = new Undo();
    this.terminal = new TerminalDevice({
      columns: options.columns,
      rows: options.rows,
    });
    this.undoCaptureMode = options.undoMode ?? 'full';
    this.undoCheckpointInterval = normalizeUndoCheckpointInterval(options.undoCheckpointInterval);

    const loadedProgram = loadProgramSource(program);
    this.instructions = loadedProgram.instructions;
    this.decodedInstructions = loadedProgram.decodedInstructions;
    this.resolvedInstructions = Array.from(
      { length: loadedProgram.decodedInstructions.length },
      () => undefined
    );
    this.clonedInstructions = loadedProgram.sourceLines;
    this.codeLabelLookup = loadedProgram.codeLabelLookup;
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
    this.resetUndoHistory();
  }

  /**
   * Check if PC is valid (aligned and >= 0)
   */
  private checkPC(pc: number): boolean {
    return 0 <= pc / 4 && pc % 4 === 0;
  }

  private snapshotRuntimeSyncState(): {
    registers: Int32Array;
    pc: number;
    ccr: number;
    lastInstruction: string;
    line: number;
    halted: boolean;
    waitingForInput: boolean;
    exception: string | undefined;
    errorsLength: number;
    lastError: string | undefined;
  } {
    return {
      registers: Int32Array.from(this.registers),
      pc: this.pc,
      ccr: this.ccr,
      lastInstruction: this.lastInstruction,
      line: this.line,
      halted: this.halted,
      waitingForInput: this.waitingForInput,
      exception: this.exception,
      errorsLength: this.errors.length,
      lastError: this.errors.at(-1),
    };
  }

  private static registersMatch(left: Int32Array, right: Int32Array): boolean {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }

    return true;
  }

  private reconcileRuntimeSyncVersions(
    before: ReturnType<Emulator['snapshotRuntimeSyncState']>
  ): void {
    if (
      before.pc !== this.pc ||
      before.ccr !== this.ccr ||
      !Emulator.registersMatch(before.registers, this.registers)
    ) {
      this.registerSyncVersion += 1;
    }

    if (
      before.lastInstruction !== this.lastInstruction ||
      before.line !== this.line ||
      before.halted !== this.halted ||
      before.waitingForInput !== this.waitingForInput
    ) {
      this.executionSyncVersion += 1;
    }

    if (
      before.exception !== this.exception ||
      before.errorsLength !== this.errors.length ||
      before.lastError !== this.errors.at(-1)
    ) {
      this.diagnosticsSyncVersion += 1;
    }
  }

  private isValidHandlerAddress(address: number): boolean {
    return address % 4 === 0 && address / 4 < this.instructions.length;
  }

  private resolveSymbolAddress(symbol: string): number | undefined {
    return this.symbolLookup[symbol.trim().toLowerCase()];
  }

  private resolveExternalInterruptAddress(address: number): number | undefined {
    const normalizedAddress = address >>> 0;

    if (this.isValidHandlerAddress(normalizedAddress)) {
      return normalizedAddress;
    }

    for (const [symbolName, symbolAddress] of Object.entries(this.symbolLookup)) {
      if ((symbolAddress >>> 0) !== normalizedAddress) {
        continue;
      }

      const instructionIndex = this.codeLabelLookup[symbolName];
      if (instructionIndex !== undefined) {
        return (instructionIndex * 4) >>> 0;
      }
    }

    return undefined;
  }

  private pushUndoSnapshot(lastInstruction = this.lastInstruction, line = this.line): void {
    if (this.undo.isAtCapacity()) {
      return;
    }

    this.undo.push(
      this.pc,
      this.ccr,
      this.registers,
      this.memory.createSnapshot(),
      this.errors,
      lastInstruction,
      line
    );
    this.instructionsSinceUndoSnapshot = 0;
  }

  private resetUndoHistory(): void {
    this.undo.clear();
    this.instructionsSinceUndoSnapshot = 0;

    if (this.undoCaptureMode === 'off') {
      return;
    }

    this.pushUndoSnapshot(Strings.LAST_INSTRUCTION_DEFAULT_TEXT, 0);
  }

  private maybeCaptureUndoSnapshot(force = false): void {
    if (this.undoCaptureMode === 'off') {
      return;
    }

    if (!force && this.pc === 0) {
      return;
    }

    if (
      !force &&
      this.undoCaptureMode === 'checkpointed' &&
      this.instructionsSinceUndoSnapshot < this.undoCheckpointInterval
    ) {
      return;
    }

    this.pushUndoSnapshot();
  }

  private markUndoProgress(): void {
    if (this.undoCaptureMode !== 'checkpointed') {
      return;
    }

    this.instructionsSinceUndoSnapshot += 1;
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
      (this.registers[baseRegister] + (operand.offset ?? 0) + this.getIndexedOffset(operand)) >>> 0
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
    const instructionIndex = this.codeLabelLookup[normalizedLabel];

    if (instructionIndex === undefined) {
      this.errors.push(Strings.UNKNOWN_LABEL + normalizedLabel + Strings.AT_LINE + this.line);
      return false;
    }

    this.pc = instructionIndex * 4;
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

  private servicePendingExternalInterrupt(): boolean {
    if (this.pendingExternalInterruptAddress === undefined) {
      return false;
    }

    const handlerAddress = this.pendingExternalInterruptAddress >>> 0;
    this.pendingExternalInterruptAddress = undefined;

    if (!this.isValidHandlerAddress(handlerAddress)) {
      this.exception = Strings.INVALID_PC_EXCEPTION;
      return true;
    }

    this.maybeCaptureUndoSnapshot(true);

    const nextStackPointer = (((this.registers[STACK_POINTER_REGISTER] >>> 0) - 4) >>> 0);
    this.registers[STACK_POINTER_REGISTER] = nextStackPointer;
    this.memory.setLong(nextStackPointer, this.pc >>> 0);
    this.waitingForInput = false;
    this.pendingInputTask = undefined;
    this.pc = handlerAddress;

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
      Strings.UNSUPPORTED_TRAP_VECTOR +
      `${vector & BYTE_MASK}:${task}` +
      Strings.AT_LINE +
      this.line;
  }

  /**
   * Execute a single emulation step
   * Returns true if execution should stop
   */
  emulationStep(): boolean {
    const runtimeSyncSnapshot = this.snapshotRuntimeSyncState();

    try {
      // Check for previous exceptions
      if (this.exception) return true;
      if (this.halted) return true;

      if (this.servicePendingExternalInterrupt()) {
        return this.halted || this.exception !== undefined;
      }

      if (this.waitingForInput) {
        this.servicePendingInputTrap();
        return false;
      }

      // Check if we've reached end of program
      if (this.pc / 4 >= this.instructions.length) {
        this.lastInstruction =
          this.instructions.length > 0 ? this.instructions[this.instructions.length - 1][0] : '';
        return true;
      }

      // Check PC validity
      if (!this.checkPC(this.pc)) {
        this.exception = Strings.INVALID_PC_EXCEPTION;
        return true;
      }

      this.maybeCaptureUndoSnapshot();

      // Get current instruction
      const instrIdx = Math.floor(this.pc / 4);
      const decodedInstruction =
        this.resolvedInstructions[instrIdx] ??
        (this.resolvedInstructions[instrIdx] = resolveDecodedInstruction(
          this.decodedInstructions[instrIdx],
          this.symbolLookup
        ));
      const instr = this.instructions[instrIdx][0];
      const flag = this.instructions[instrIdx][2];
      this.line = this.instructions[instrIdx][1];
      this.lastInstruction = this.clonedInstructions[this.line - 1] || instr;
      this.pc += 4;

      // Skip directives and labels
      if (flag === true) {
        this.markUndoProgress();
        return false;
      }

      // Parse and execute instruction
      this.executeInstruction(decodedInstruction);
      this.markUndoProgress();
      return this.halted || this.exception !== undefined;
    } finally {
      this.reconcileRuntimeSyncVersions(runtimeSyncSnapshot);
    }
  }

  /**
   * Execute a single instruction
   */
  private executeInstruction(instr: DecodedInstruction): boolean {
    for (const error of instr.decodeErrors) {
      this.errors.push(error + Strings.AT_LINE + this.line);
    }

    if (!instr.hasOperandSection && instr.bareToken.length > 0) {
      // Single-operand or no-operand instruction
      switch (instr.bareToken) {
        case 'rts':
          this.rts();
          break;
        default:
          this.errors.push(Strings.UNRECOGNISED_INSTRUCTION + Strings.AT_LINE + this.line);
          return false;
      }
    } else {
      const operation = instr.operation;
      const operandTokens = instr.operandTokens;
      const operands = instr.operands;
      const size = instr.size;

      // Execute instruction
      switch (operation) {
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
      op2.type === TOKEN_REG_DATA || op2.type === TOKEN_REG_ADDR ? this.registers[op2.value] : 0;
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

    if (
      (op1.type === TOKEN_REG_DATA && op2.type === TOKEN_REG_DATA) ||
      (op1.type === TOKEN_REG_ADDR && op2.type === TOKEN_REG_ADDR) ||
      (op1.type === TOKEN_REG_DATA && op2.type === TOKEN_REG_ADDR) ||
      (op1.type === TOKEN_REG_ADDR && op2.type === TOKEN_REG_DATA)
    ) {
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
      shiftCount = this.registers[op1.value] & 0x3f; // Only lower 6 bits used
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
      shiftCount = this.registers[op1.value] & 0x3f;
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
      shiftCount = this.registers[op1.value] & 0x3f;
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
      shiftCount = this.registers[op1.value] & 0x3f;
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
      shiftCount = this.registers[op1.value] & 0x3f;
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
      shiftCount = this.registers[op1.value] & 0x3f;
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

  getMemoryMeta(): {
    usedBytes: number;
    minAddress: number | null;
    maxAddress: number | null;
    version: number;
  } {
    const addressRange = this.memory.getAddressRange();
    return {
      usedBytes: this.memory.getUsedBytes(),
      minAddress: addressRange.minAddress,
      maxAddress: addressRange.maxAddress,
      version: this.memory.getMemoryVersion(),
    };
  }

  getRuntimeSyncVersions(): RuntimeSyncVersions {
    const terminalMeta = this.terminal.getTerminalMeta();

    return {
      registers: this.registerSyncVersion,
      execution: this.executionSyncVersion,
      diagnostics: this.diagnosticsSyncVersion,
      memory: this.memory.getMemoryVersion(),
      terminal: terminalMeta.version,
      terminalGeometry: terminalMeta.geometryVersion,
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

  resizeTerminal(columns: number, rows: number): void {
    this.terminal.resize(columns, rows);
  }

  getTerminalLines(): string[] {
    return this.terminal.getLines();
  }

  getTerminalText(): string {
    return this.terminal.getText();
  }

  writeMemoryByte(address: number, value: number): void {
    this.memory.setByte(address >>> 0, value & BYTE_MASK);
  }

  writeMemoryWord(address: number, value: number): void {
    this.memory.setWord(address >>> 0, value & WORD_MASK);
  }

  writeMemoryLong(address: number, value: number): void {
    this.memory.setLong(address >>> 0, value >>> 0);
  }

  raiseExternalInterrupt(handlerAddress: number): boolean {
    const resolvedHandlerAddress = this.resolveExternalInterruptAddress(handlerAddress);

    if (resolvedHandlerAddress === undefined) {
      return false;
    }

    this.pendingExternalInterruptAddress = resolvedHandlerAddress;
    return true;
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

  getUndoCaptureMode(): UndoCaptureMode {
    return this.undoCaptureMode;
  }

  setUndoCaptureMode(mode: UndoCaptureMode, checkpointInterval?: number): void {
    this.undoCaptureMode = mode;
    if (checkpointInterval !== undefined) {
      this.undoCheckpointInterval = normalizeUndoCheckpointInterval(checkpointInterval);
    }
    this.instructionsSinceUndoSnapshot = 0;

    if (mode !== 'off' && this.undo.size() === 0) {
      this.pushUndoSnapshot();
    }
  }

  forceUndoCheckpoint(): void {
    if (this.undoCaptureMode === 'off') {
      return;
    }

    this.pushUndoSnapshot();
  }

  /**
   * Perform undo operation
   */
  undoFromStack(): void {
    const runtimeSyncSnapshot = this.snapshotRuntimeSyncState();
    const frame = this.undo.pop();
    if (frame === undefined) {
      return;
    }

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
    this.instructionsSinceUndoSnapshot = 0;
    this.reconcileRuntimeSyncVersions(runtimeSyncSnapshot);
  }

  /**
   * Reset emulator to initial state
   */
  reset(): void {
    const runtimeSyncSnapshot = this.snapshotRuntimeSyncState();
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
    this.pendingExternalInterruptAddress = undefined;
    this.lastInstruction = Strings.LAST_INSTRUCTION_DEFAULT_TEXT;
    this.exception = undefined;
    this.errors = [];
    this.line = 0;
    this.resetUndoHistory();
    this.reconcileRuntimeSyncVersions(runtimeSyncSnapshot);
  }
}
