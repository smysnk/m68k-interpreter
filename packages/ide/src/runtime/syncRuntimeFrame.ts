import type { ConditionFlags, ExecutionState, Registers, TerminalMeta } from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import type { RuntimeMetrics } from '@/stores/emulatorStore';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';

function buildFlags(emulator: IdeRuntimeSession): ConditionFlags {
  return {
    z: emulator.getZFlag(),
    v: emulator.getVFlag(),
    n: emulator.getNFlag(),
    c: emulator.getCFlag(),
    x: emulator.getXFlag(),
  };
}

function buildRegisters(emulator: IdeRuntimeSession, flags: ConditionFlags): Registers {
  const values = emulator.getRegisters();

  return {
    a0: values[0],
    a1: values[1],
    a2: values[2],
    a3: values[3],
    a4: values[4],
    a5: values[5],
    a6: values[6],
    a7: values[7],
    d0: values[8],
    d1: values[9],
    d2: values[10],
    d3: values[11],
    d4: values[12],
    d5: values[13],
    d6: values[14],
    d7: values[15],
    pc: emulator.getPC(),
    ccr: (flags.x << 4) | (flags.n << 3) | (flags.z << 2) | (flags.v << 1) | flags.c,
  };
}

export interface RuntimeFrameSyncOptions {
  executionState?: Partial<ExecutionState>;
  runtimeMetrics?: Partial<RuntimeMetrics>;
}

export interface RuntimeFrameSyncPayload {
  registers: Registers;
  memory: Record<number, number>;
  flags: ConditionFlags;
  terminal: TerminalMeta;
  executionState?: Partial<ExecutionState>;
  runtimeMetrics?: Partial<RuntimeMetrics>;
}

export function syncRuntimeFrameToIde(
  emulator: IdeRuntimeSession,
  syncEmulatorFrame: (frame: RuntimeFrameSyncPayload) => void,
  options: RuntimeFrameSyncOptions = {}
): void {
  const flags = buildFlags(emulator);
  const terminal = emulator.getTerminalMeta();

  terminalSurfaceStore.publishFrame(emulator.getTerminalFrameBuffer(), terminal);

  syncEmulatorFrame({
    registers: buildRegisters(emulator, flags),
    memory: emulator.getMemory(),
    flags,
    terminal,
    executionState: {
      lastInstruction: emulator.getLastInstruction(),
      errors: emulator.getErrors(),
      exception: emulator.getException() ?? null,
      ...options.executionState,
    },
    runtimeMetrics: options.runtimeMetrics,
  });
}
