import type { MemoryUndoPageEntry } from './memory';
import type { MachineSnapshot } from '../machine/machineAdapter';

/**
 * Undo system for M68K emulator
 * Maintains a stack of execution states for undo functionality
 */

export interface CpuUndoSnapshot {
  pc: number;
  sr: number;
  usp: number;
  ssp: number;
  registers: Int32Array;
}

export interface DiagnosticsUndoSnapshot {
  errors: string[];
}

export interface ExecutionUndoSnapshot {
  lastInstruction: string;
  line: number;
}

export interface UndoFrame {
  cpu: CpuUndoSnapshot;
  memoryPages: MemoryUndoPageEntry[];
  machine: MachineSnapshot;
  diagnostics: DiagnosticsUndoSnapshot;
  execution: ExecutionUndoSnapshot;
}

export class Undo {
  private stack: UndoFrame[] = [];
  private static readonly MAX_FRAMES = 256;

  push(frame: UndoFrame): void {
    this.stack.push({
      cpu: {
        ...frame.cpu,
        registers: new Int32Array(frame.cpu.registers),
      },
      memoryPages: [...frame.memoryPages],
      machine: frame.machine,
      diagnostics: {
        errors: [...frame.diagnostics.errors],
      },
      execution: { ...frame.execution },
    });

    if (this.stack.length > Undo.MAX_FRAMES) {
      this.stack.shift();
    }
  }

  isAtCapacity(): boolean {
    return this.stack.length >= Undo.MAX_FRAMES;
  }

  pop(): UndoFrame | undefined {
    return this.stack.pop();
  }

  peek(): UndoFrame | undefined {
    if (this.stack.length === 0) return undefined;
    return this.stack[this.stack.length - 1];
  }

  clear(): void {
    this.stack = [];
  }

  size(): number {
    return this.stack.length;
  }
}
