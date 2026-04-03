import type {
  ConditionFlags,
  ExecutionState,
  MemoryMeta,
  Registers,
  TerminalMeta,
} from '@m68k/interpreter';
import type { RuntimeMetrics } from '@/stores/emulatorStore';

export interface RuntimeFrameSyncPayload {
  registers?: Registers;
  memory?: MemoryMeta;
  flags?: ConditionFlags;
  terminal?: TerminalMeta;
  executionState?: Partial<ExecutionState>;
  runtimeMetrics?: Partial<RuntimeMetrics>;
}

export function buildFlagsFromCCR(ccr: number): ConditionFlags {
  return {
    z: (ccr >>> 2) & 0x1,
    v: (ccr >>> 1) & 0x1,
    n: (ccr >>> 3) & 0x1,
    c: ccr & 0x1,
    x: (ccr >>> 4) & 0x1,
  };
}

export function buildRegisters(
  values: Int32Array | ReadonlyArray<number>,
  pc: number,
  ccr: number,
  sr: number,
  usp: number,
  ssp: number
): Registers {
  const a7 = values[7] ?? 0;

  return {
    a0: values[0] ?? 0,
    a1: values[1] ?? 0,
    a2: values[2] ?? 0,
    a3: values[3] ?? 0,
    a4: values[4] ?? 0,
    a5: values[5] ?? 0,
    a6: values[6] ?? 0,
    a7,
    d0: values[8] ?? 0,
    d1: values[9] ?? 0,
    d2: values[10] ?? 0,
    d3: values[11] ?? 0,
    d4: values[12] ?? 0,
    d5: values[13] ?? 0,
    d6: values[14] ?? 0,
    d7: values[15] ?? 0,
    pc,
    ccr,
    sr,
    usp,
    ssp,
  };
}

export function buildRuntimeExecutionState(args: {
  lastInstruction: string;
  errors: string[];
  exception: string | null;
  halted: boolean;
  waitingForInput: boolean;
}): Partial<ExecutionState> {
  const hasException = Boolean(args.exception);

  return {
    started: !args.halted && !hasException,
    ended: args.halted || hasException,
    stopped: args.waitingForInput,
    lastInstruction: args.lastInstruction,
    exception: args.exception,
    errors: args.errors,
  };
}

export function buildRuntimeFrameSyncPayload(args: {
  rawRegisters: Int32Array | ReadonlyArray<number>;
  pc: number;
  ccr: number;
  sr: number;
  usp: number;
  ssp: number;
  memory?: MemoryMeta;
  terminal?: TerminalMeta;
  lastInstruction: string;
  errors: string[];
  exception: string | null;
  halted: boolean;
  waitingForInput: boolean;
  runtimeMetrics?: Partial<RuntimeMetrics>;
  includeRegisters?: boolean;
  includeFlags?: boolean;
  includeExecutionState?: boolean;
}): RuntimeFrameSyncPayload {
  const frame: RuntimeFrameSyncPayload = {
    memory: args.memory,
    terminal: args.terminal,
    runtimeMetrics: args.runtimeMetrics,
  };

  if (args.includeRegisters ?? true) {
    frame.registers = buildRegisters(
      args.rawRegisters,
      args.pc,
      args.ccr,
      args.sr,
      args.usp,
      args.ssp
    );
  }

  if (args.includeFlags ?? true) {
    frame.flags = buildFlagsFromCCR(args.ccr);
  }

  if (args.includeExecutionState ?? true) {
    frame.executionState = buildRuntimeExecutionState({
      lastInstruction: args.lastInstruction,
      errors: args.errors,
      exception: args.exception,
      halted: args.halted,
      waitingForInput: args.waitingForInput,
    });
  }

  return frame;
}
