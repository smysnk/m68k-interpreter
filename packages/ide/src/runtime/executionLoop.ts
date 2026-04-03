export type FrameStopReason =
  | 'frame_budget'
  | 'instruction_budget'
  | 'terminal_changed'
  | 'waiting_for_input'
  | 'halted'
  | 'exception';

export interface FrameExecutionOptions {
  frameBudgetMs?: number;
  instructionBudget?: number;
  speedMultiplier?: number;
  flushOnTerminalChange?: boolean;
  terminalFlushInstructionInterval?: number;
  now?: () => number;
}

export interface FrameExecutionResult {
  instructionsExecuted: number;
  frameDurationMs: number;
  stopReason: FrameStopReason;
  shouldContinue: boolean;
}

export interface FrameExecutionEmulator {
  emulationStep(): boolean;
  isWaitingForInput(): boolean;
  isHalted(): boolean;
  getException(): string | null | undefined;
  getRuntimeSyncVersions?(): {
    terminal: number;
    terminalGeometry: number;
  } | undefined;
}

export interface AsyncFrameExecutionController {
  requestStep(): Promise<{
    halted: boolean;
    waitingForInput: boolean;
    exception: string | null;
  } | undefined>;
}

export const DEFAULT_FRAME_BUDGET_MS = 12;
export const DEFAULT_INSTRUCTION_BUDGET = 40000;
export const DEFAULT_TERMINAL_FLUSH_INSTRUCTION_INTERVAL = 64;

function defaultNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

export function getScaledInstructionBudget(
  instructionBudget = DEFAULT_INSTRUCTION_BUDGET,
  speedMultiplier = 1
): number {
  return Math.max(1, Math.floor(instructionBudget * Math.max(speedMultiplier, 0.25)));
}

export function runEmulationFrame(
  emulator: FrameExecutionEmulator,
  options: FrameExecutionOptions = {}
): FrameExecutionResult {
  const now = options.now ?? defaultNow;
  const frameBudgetMs = options.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
  const instructionBudget = getScaledInstructionBudget(
    options.instructionBudget,
    options.speedMultiplier
  );
  const shouldFlushOnTerminalChange = options.flushOnTerminalChange === true;
  const terminalFlushInstructionInterval = Math.max(
    1,
    Math.floor(
      options.terminalFlushInstructionInterval ?? DEFAULT_TERMINAL_FLUSH_INSTRUCTION_INTERVAL
    )
  );
  const initialSyncVersions = shouldFlushOnTerminalChange
    ? emulator.getRuntimeSyncVersions?.()
    : undefined;
  const startedAt = now();
  let instructionsExecuted = 0;

  while (instructionsExecuted < instructionBudget) {
    if (emulator.getException()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'exception',
        shouldContinue: false,
      };
    }

    if (emulator.isHalted()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'halted',
        shouldContinue: false,
      };
    }

    if (instructionsExecuted > 0 && now() - startedAt >= frameBudgetMs) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'frame_budget',
        shouldContinue: true,
      };
    }

    const finished = emulator.emulationStep();
    instructionsExecuted += 1;

    if (emulator.getException()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'exception',
        shouldContinue: false,
      };
    }

    if (finished || emulator.isHalted()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'halted',
        shouldContinue: false,
      };
    }

    if (emulator.isWaitingForInput()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'waiting_for_input',
        shouldContinue: false,
      };
    }

    if (
      shouldFlushOnTerminalChange &&
      initialSyncVersions &&
      instructionsExecuted >= terminalFlushInstructionInterval
    ) {
      const currentSyncVersions = emulator.getRuntimeSyncVersions?.();
      if (
        currentSyncVersions &&
        (currentSyncVersions.terminal !== initialSyncVersions.terminal ||
          currentSyncVersions.terminalGeometry !== initialSyncVersions.terminalGeometry)
      ) {
        return {
          instructionsExecuted,
          frameDurationMs: now() - startedAt,
          stopReason: 'terminal_changed',
          shouldContinue: true,
        };
      }
    }
  }

  return {
    instructionsExecuted,
    frameDurationMs: now() - startedAt,
    stopReason: 'instruction_budget',
    shouldContinue: true,
  };
}

export async function runAsyncEmulationFrame(
  emulator: Pick<
    FrameExecutionEmulator,
    'isWaitingForInput' | 'isHalted' | 'getException' | 'getRuntimeSyncVersions'
  >,
  controller: AsyncFrameExecutionController,
  options: FrameExecutionOptions = {}
): Promise<FrameExecutionResult> {
  const now = options.now ?? defaultNow;
  const frameBudgetMs = options.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
  const instructionBudget = getScaledInstructionBudget(
    options.instructionBudget,
    options.speedMultiplier
  );
  const shouldFlushOnTerminalChange = options.flushOnTerminalChange === true;
  const terminalFlushInstructionInterval = Math.max(
    1,
    Math.floor(
      options.terminalFlushInstructionInterval ?? DEFAULT_TERMINAL_FLUSH_INSTRUCTION_INTERVAL
    )
  );
  const initialSyncVersions = shouldFlushOnTerminalChange
    ? emulator.getRuntimeSyncVersions?.()
    : undefined;
  const startedAt = now();
  let instructionsExecuted = 0;

  while (instructionsExecuted < instructionBudget) {
    if (emulator.getException()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'exception',
        shouldContinue: false,
      };
    }

    if (emulator.isHalted()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'halted',
        shouldContinue: false,
      };
    }

    if (instructionsExecuted > 0 && now() - startedAt >= frameBudgetMs) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'frame_budget',
        shouldContinue: true,
      };
    }

    const stepResult = await controller.requestStep();
    instructionsExecuted += 1;

    if (stepResult?.exception || emulator.getException()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'exception',
        shouldContinue: false,
      };
    }

    if (stepResult?.halted || emulator.isHalted()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'halted',
        shouldContinue: false,
      };
    }

    if (stepResult?.waitingForInput || emulator.isWaitingForInput()) {
      return {
        instructionsExecuted,
        frameDurationMs: now() - startedAt,
        stopReason: 'waiting_for_input',
        shouldContinue: false,
      };
    }

    if (
      shouldFlushOnTerminalChange &&
      initialSyncVersions &&
      instructionsExecuted >= terminalFlushInstructionInterval
    ) {
      const currentSyncVersions = emulator.getRuntimeSyncVersions?.();
      if (
        currentSyncVersions &&
        (currentSyncVersions.terminal !== initialSyncVersions.terminal ||
          currentSyncVersions.terminalGeometry !== initialSyncVersions.terminalGeometry)
      ) {
        return {
          instructionsExecuted,
          frameDurationMs: now() - startedAt,
          stopReason: 'terminal_changed',
          shouldContinue: true,
        };
      }
    }
  }

  return {
    instructionsExecuted,
    frameDurationMs: now() - startedAt,
    stopReason: 'instruction_budget',
    shouldContinue: true,
  };
}
