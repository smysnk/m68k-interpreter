import type {
  ConditionFlags,
  ExecutionState,
  MemoryMeta,
  Registers,
  RuntimeSyncVersions,
  TerminalMeta,
} from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import type { RuntimeMetrics } from '@/stores/emulatorStore';
import { recordRuntimeFrameSync } from '@/runtime/idePerformanceTelemetry';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';
import {
  buildFlagsFromCCR,
  buildRegisters,
  type RuntimeFrameSyncPayload,
} from '@/runtime/runtimeFramePayload';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';

function memoryMetaEquals(left: MemoryMeta, right: MemoryMeta): boolean {
  return (
    left.usedBytes === right.usedBytes &&
    left.minAddress === right.minAddress &&
    left.maxAddress === right.maxAddress &&
    left.version === right.version
  );
}

function terminalMetaEquals(left: TerminalMeta, right: TerminalMeta): boolean {
  return (
    left.columns === right.columns &&
    left.rows === right.rows &&
    left.cursorRow === right.cursorRow &&
    left.cursorColumn === right.cursorColumn &&
    left.output === right.output &&
    left.version === right.version &&
    left.geometryVersion === right.geometryVersion
  );
}

function pickRuntimeMemoryMeta(
  frame: RuntimeFrameSyncPayload,
  cache: RuntimeFrameSyncCache | undefined,
  emulator?: IdeRuntimeSession
): MemoryMeta | null {
  if (frame.memory) {
    return frame.memory;
  }

  if (cache?.memory) {
    return cache.memory;
  }

  return emulator ? emulator.getMemoryMeta() : null;
}

function pickRuntimeTerminalMeta(
  frame: RuntimeFrameSyncPayload,
  cache: RuntimeFrameSyncCache | undefined,
  emulator?: IdeRuntimeSession
): TerminalMeta | null {
  if (frame.terminal) {
    return frame.terminal;
  }

  if (cache?.terminal) {
    return cache.terminal;
  }

  return emulator ? emulator.getTerminalMeta() : null;
}

function rawRegistersEqual(left: Int32Array, right: Int32Array): boolean {
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

export interface RuntimeFrameSyncCache {
  runtime: IdeRuntimeSession | null;
  syncVersions: RuntimeSyncVersions | null;
  rawRegisters: Int32Array | null;
  registers: Registers | null;
  flags: ConditionFlags | null;
  memory: MemoryMeta | null;
  terminal: TerminalMeta | null;
  lastInstruction: string | null;
  errors: string[] | null;
  exception: string | null;
  pc: number;
  ccr: number;
  sr: number;
  usp: number;
  ssp: number;
}

export function createRuntimeFrameSyncCache(): RuntimeFrameSyncCache {
  return {
    runtime: null,
    syncVersions: null,
    rawRegisters: null,
    registers: null,
    flags: null,
    memory: null,
    terminal: null,
    lastInstruction: null,
    errors: null,
    exception: null,
    pc: Number.NaN,
    ccr: Number.NaN,
    sr: Number.NaN,
    usp: Number.NaN,
    ssp: Number.NaN,
  };
}

function ensureCacheForRuntime(
  cache: RuntimeFrameSyncCache | undefined,
  runtime: IdeRuntimeSession
): RuntimeFrameSyncCache | undefined {
  if (!cache) {
    return undefined;
  }

  if (cache.runtime === runtime) {
    return cache;
  }

  cache.runtime = runtime;
  cache.syncVersions = null;
  cache.rawRegisters = null;
  cache.registers = null;
  cache.flags = null;
  cache.memory = null;
  cache.terminal = null;
  cache.lastInstruction = null;
  cache.errors = null;
  cache.exception = null;
  cache.pc = Number.NaN;
  cache.ccr = Number.NaN;
  cache.sr = Number.NaN;
  cache.usp = Number.NaN;
  cache.ssp = Number.NaN;
  return cache;
}

export interface RuntimeFrameSyncOptions {
  executionState?: Partial<ExecutionState>;
  runtimeMetrics?: Partial<RuntimeMetrics>;
  registersOverride?: RuntimeFrameSyncPayload['registers'];
  flagsOverride?: RuntimeFrameSyncPayload['flags'];
  cache?: RuntimeFrameSyncCache;
  publishMemorySurface?: boolean;
  suppressRegisterSync?: boolean;
}

function hasFrameStorePayload(frame: RuntimeFrameSyncPayload): boolean {
  return Boolean(
    frame.registers ||
      frame.memory ||
      frame.flags ||
      frame.terminal ||
      frame.executionState ||
      frame.runtimeMetrics
  );
}

export function applyRuntimeFrameToIde(
  emulator: IdeRuntimeSession,
  frame: RuntimeFrameSyncPayload,
  syncEmulatorFrame: (frame: RuntimeFrameSyncPayload) => void,
  options: {
    cache?: RuntimeFrameSyncCache;
    syncVersions?: RuntimeSyncVersions;
    publishMemorySurface?: boolean;
  } = {}
): void {
  const syncStartedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const cache = ensureCacheForRuntime(options.cache, emulator);
  const syncVersions = options.syncVersions;
  const previousSyncVersions = cache?.syncVersions ?? null;
  const previousTerminal = cache?.terminal ?? null;
  const previousMemory = cache?.memory ?? null;
  const publishMemorySurface = options.publishMemorySurface ?? true;
  const nextTerminal = pickRuntimeTerminalMeta(frame, cache);
  const nextMemory = pickRuntimeMemoryMeta(frame, cache);
  const terminalChanged =
    nextTerminal !== null &&
    (previousTerminal === null || !terminalMetaEquals(previousTerminal, nextTerminal));
  const memoryChanged =
    nextMemory !== null &&
    (previousMemory === null || !memoryMetaEquals(previousMemory, nextMemory));
  let publishedTerminal = false;
  let publishedMemory = false;

  if (terminalChanged && nextTerminal) {
    terminalSurfaceStore.publishFrame(emulator.getTerminalFrameBuffer(), nextTerminal);
    publishedTerminal = true;
    if (cache) {
      cache.terminal = nextTerminal;
    }
  }

  if (memoryChanged && nextMemory) {
    if (publishMemorySurface) {
      memorySurfaceStore.replaceFromRuntime(emulator, nextMemory);
      publishedMemory = true;
    } else {
      memorySurfaceStore.syncRuntime(emulator);
      memorySurfaceStore.setMeta(nextMemory);
    }
    if (cache) {
      cache.memory = nextMemory;
    }
  }

  if (cache) {
    cache.syncVersions = syncVersions ?? cache.syncVersions;
    cache.lastInstruction = frame.executionState?.lastInstruction ?? cache.lastInstruction;
    cache.errors = frame.executionState?.errors ?? cache.errors;
    cache.exception =
      frame.executionState?.exception === undefined ? cache.exception : frame.executionState.exception;
    if (frame.registers) {
      cache.registers = frame.registers;
    }
    if (frame.flags) {
      cache.flags = frame.flags;
    }
  }

  if (hasFrameStorePayload(frame)) {
    syncEmulatorFrame(frame);
  }

  recordRuntimeFrameSync({
    durationMs:
      (typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()) - syncStartedAt,
    reusedRegisters: Boolean(
      syncVersions &&
        previousSyncVersions &&
        previousSyncVersions.registers === syncVersions.registers
    ),
    reusedFlags: Boolean(
      syncVersions &&
        previousSyncVersions &&
        previousSyncVersions.registers === syncVersions.registers
    ),
    reusedMemory: Boolean(
      syncVersions &&
        previousSyncVersions &&
        previousSyncVersions.memory === syncVersions.memory
    ),
    reusedTerminal: Boolean(
      syncVersions &&
        previousSyncVersions &&
        previousSyncVersions.terminal === syncVersions.terminal &&
        previousSyncVersions.terminalGeometry === syncVersions.terminalGeometry
    ),
    publishedMemory,
    publishedTerminal,
  });
}

export function syncRuntimeFrameToIde(
  emulator: IdeRuntimeSession,
  syncEmulatorFrame: (frame: RuntimeFrameSyncPayload) => void,
  options: RuntimeFrameSyncOptions = {}
): void {
  const cache = ensureCacheForRuntime(options.cache, emulator);
  const syncVersions = emulator.getRuntimeSyncVersions?.();
  let flags = options.flagsOverride;
  let registers = options.registersOverride;
  let reusedRegisters = false;
  let reusedFlags = false;
  const suppressRegisterSync = options.suppressRegisterSync ?? false;

  if (!suppressRegisterSync && (!registers || !flags)) {
    const registerVersionChanged = Boolean(
      !syncVersions ||
        !cache?.syncVersions ||
        cache.syncVersions.registers !== syncVersions.registers
    );
    let registersChanged = registerVersionChanged;
    let ccr = cache?.ccr ?? 0;

    if (!registerVersionChanged) {
      reusedRegisters = registers === undefined && Boolean(cache?.registers);
      reusedFlags = flags === undefined && Boolean(cache?.flags);
    } else {
      const rawRegisters = emulator.getRegisters();
      const pc = emulator.getPC();
      ccr = emulator.getCCR();
      const sr = emulator.getSR();
      const usp = emulator.getUSP();
      const ssp = emulator.getSSP();
      registersChanged =
        !cache ||
        cache.rawRegisters === null ||
        cache.pc !== pc ||
        cache.ccr !== ccr ||
        cache.sr !== sr ||
        cache.usp !== usp ||
        cache.ssp !== ssp ||
        !rawRegistersEqual(cache.rawRegisters, rawRegisters);

      if (registers === undefined) {
        if (!registersChanged && cache?.registers) {
          registers = cache.registers;
          reusedRegisters = true;
        } else {
          registers = buildRegisters(rawRegisters, pc, ccr, sr, usp, ssp);
          if (cache) {
            cache.rawRegisters = Int32Array.from(rawRegisters);
            cache.registers = registers;
            cache.pc = pc;
            cache.ccr = ccr;
            cache.sr = sr;
            cache.usp = usp;
            cache.ssp = ssp;
          }
        }
      }

      if (flags === undefined) {
        if (!registersChanged && cache?.flags) {
          flags = cache.flags;
          reusedFlags = true;
        } else {
          flags = buildFlagsFromCCR(ccr);
          if (cache) {
            cache.flags = flags;
          }
        }
      }
    }
  }

  const terminalVersionChanged = Boolean(
    !syncVersions ||
      !cache?.syncVersions ||
      cache.syncVersions.terminal !== syncVersions.terminal ||
      cache.syncVersions.terminalGeometry !== syncVersions.terminalGeometry
  );
  const terminal =
    terminalVersionChanged || !cache?.terminal ? emulator.getTerminalMeta() : undefined;

  const memoryVersionChanged = Boolean(
    !syncVersions ||
      !cache?.syncVersions ||
      cache.syncVersions.memory !== syncVersions.memory
  );
  const memory = memoryVersionChanged || !cache?.memory ? emulator.getMemoryMeta() : undefined;
  const publishMemorySurface = options.publishMemorySurface ?? true;

  const executionChanged = Boolean(
    !syncVersions ||
      !cache?.syncVersions ||
      cache.syncVersions.execution !== syncVersions.execution
  );
  const diagnosticsChanged = Boolean(
    !syncVersions ||
      !cache?.syncVersions ||
      cache.syncVersions.diagnostics !== syncVersions.diagnostics
  );
  const shouldIncludeExecutionState =
    executionChanged ||
    diagnosticsChanged ||
    options.executionState !== undefined ||
    !cache?.lastInstruction ||
    !cache?.errors ||
    cache?.exception === undefined;
  const runtimeLastInstruction = emulator.getLastInstruction();
  const runtimeErrors = emulator.getErrors();
  const runtimeException = emulator.getException() ?? null;
  const lastInstruction = shouldIncludeExecutionState ? runtimeLastInstruction : cache.lastInstruction;
  const errors = shouldIncludeExecutionState ? runtimeErrors : cache.errors;
  const exception = shouldIncludeExecutionState ? runtimeException : cache.exception;
  const nextExecutionState = shouldIncludeExecutionState
    ? {
        lastInstruction: runtimeLastInstruction,
        errors: runtimeErrors,
        exception: runtimeException,
        ...options.executionState,
      }
    : options.executionState;

  applyRuntimeFrameToIde(
    emulator,
    {
      registers,
      memory,
      flags,
      terminal,
      executionState: nextExecutionState,
      runtimeMetrics: options.runtimeMetrics,
    },
    syncEmulatorFrame,
    {
      cache,
      syncVersions,
      publishMemorySurface,
    }
  );

  if (cache) {
    cache.lastInstruction = lastInstruction;
    cache.errors = errors;
    cache.exception = exception;
    if ((reusedRegisters || suppressRegisterSync) && registers) {
      cache.registers = registers;
    }
    if ((reusedFlags || suppressRegisterSync) && flags) {
      cache.flags = flags;
    }
  }
}
