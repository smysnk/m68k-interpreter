import { describe, expect, it } from 'vitest';
import {
  getScaledInstructionBudget,
  runAsyncEmulationFrame,
  runEmulationFrame,
  type FrameExecutionEmulator,
} from './executionLoop';

function createClock(values: number[]): () => number {
  let index = 0;

  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

describe('executionLoop', () => {
  it('stops when the emulator begins waiting for input', () => {
    let waitingForInput = false;
    let steps = 0;

    const emulator: FrameExecutionEmulator = {
      emulationStep: () => {
        steps += 1;
        waitingForInput = true;
        return false;
      },
      isWaitingForInput: () => waitingForInput,
      isHalted: () => false,
      getException: () => null,
    };

    const result = runEmulationFrame(emulator, {
      frameBudgetMs: 10,
      instructionBudget: 10,
      now: createClock([0, 0, 1]),
    });

    expect(steps).toBe(1);
    expect(result.stopReason).toBe('waiting_for_input');
    expect(result.shouldContinue).toBe(false);
  });

  it('stops at the frame budget and requests another frame', () => {
    let steps = 0;

    const emulator: FrameExecutionEmulator = {
      emulationStep: () => {
        steps += 1;
        return false;
      },
      isWaitingForInput: () => false,
      isHalted: () => false,
      getException: () => null,
    };

    const result = runEmulationFrame(emulator, {
      frameBudgetMs: 5,
      instructionBudget: 20,
      now: createClock([0, 2, 7]),
    });

    expect(steps).toBe(2);
    expect(result.stopReason).toBe('frame_budget');
    expect(result.shouldContinue).toBe(true);
  });

  it('scales the instruction budget with the speed multiplier', () => {
    let steps = 0;

    const emulator: FrameExecutionEmulator = {
      emulationStep: () => {
        steps += 1;
        return false;
      },
      isWaitingForInput: () => false,
      isHalted: () => false,
      getException: () => null,
    };

    const result = runEmulationFrame(emulator, {
      frameBudgetMs: 100,
      instructionBudget: 4,
      speedMultiplier: 2,
      now: () => 0,
    });

    expect(getScaledInstructionBudget(4, 2)).toBe(8);
    expect(steps).toBe(8);
    expect(result.stopReason).toBe('instruction_budget');
    expect(result.shouldContinue).toBe(true);
  });

  it('prioritizes an exception stop reason over a finished step', () => {
    let exception: string | null = null;

    const emulator: FrameExecutionEmulator = {
      emulationStep: () => {
        exception = 'divide by zero';
        return true;
      },
      isWaitingForInput: () => false,
      isHalted: () => false,
      getException: () => exception,
    };

    const result = runEmulationFrame(emulator, {
      frameBudgetMs: 100,
      instructionBudget: 4,
      now: () => 0,
    });

    expect(result.stopReason).toBe('exception');
    expect(result.shouldContinue).toBe(false);
  });

  it('flushes early when terminal output changes after enough instructions', () => {
    let steps = 0;
    let terminalVersion = 1;

    const emulator: FrameExecutionEmulator = {
      emulationStep: () => {
        steps += 1;
        if (steps === 2) {
          terminalVersion = 2;
        }
        return false;
      },
      isWaitingForInput: () => false,
      isHalted: () => false,
      getException: () => null,
      getRuntimeSyncVersions: () => ({
        terminal: terminalVersion,
        terminalGeometry: 1,
      }),
    };

    const result = runEmulationFrame(emulator, {
      frameBudgetMs: 100,
      instructionBudget: 20,
      flushOnTerminalChange: true,
      terminalFlushInstructionInterval: 3,
      now: () => 0,
    });

    expect(steps).toBe(3);
    expect(result.stopReason).toBe('terminal_changed');
    expect(result.shouldContinue).toBe(true);
  });

  it('can drive an async frame loop against a cached worker-backed runtime', async () => {
    let waitingForInput = false;
    let steps = 0;

    const emulator = {
      isWaitingForInput: () => waitingForInput,
      isHalted: () => false,
      getException: () => null,
    };

    const result = await runAsyncEmulationFrame(
      emulator,
      {
        requestStep: async () => {
          steps += 1;
          waitingForInput = true;
          return {
            halted: false,
            waitingForInput: true,
            exception: null,
          };
        },
      },
      {
        frameBudgetMs: 10,
        instructionBudget: 10,
        now: createClock([0, 0, 1]),
      }
    );

    expect(steps).toBe(1);
    expect(result.stopReason).toBe('waiting_for_input');
    expect(result.shouldContinue).toBe(false);
  });
});
