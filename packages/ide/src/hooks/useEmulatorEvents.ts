import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import {
  createStoreBackedReducerInterpreterAdapter,
  type InterpreterReduxAction,
} from '@m68k/interpreter-redux';
import { Emulator, type ExecutionState } from '@m68k/interpreter';
import { ideStore } from '@/store';
import { runEmulationFrame } from '@/runtime/executionLoop';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { syncRuntimeFrameToIde } from '@/runtime/syncRuntimeFrame';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { useEmulatorStore, type RuntimeMetrics } from '@/stores/emulatorStore';
import type { AppDispatch, RootState } from '@/store';

declare global {
  interface Window {
    editorCode: string;
    emulatorInstance: IdeRuntimeSession | null;
  }
}

const FRAME_FALLBACK_MS = 16;
const TEST_FRAME_FALLBACK_MS = 0;
const TEST_FRAME_BUDGET_MS = 250;
const HIDDEN_FRAME_BUDGET_MS = 24;

function isJsdomEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

function shouldUseTimerFrame(): boolean {
  if (isJsdomEnvironment()) {
    return true;
  }

  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function getFrameBudgetForEnvironment(): number | undefined {
  if (isJsdomEnvironment()) {
    return TEST_FRAME_BUDGET_MS;
  }

  if (shouldUseTimerFrame()) {
    return HIDDEN_FRAME_BUDGET_MS;
  }

  return undefined;
}

function requestFrame(callback: () => void): number {
  if (isJsdomEnvironment()) {
    return window.setTimeout(callback, TEST_FRAME_FALLBACK_MS) as unknown as number;
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    !shouldUseTimerFrame()
  ) {
    return window.requestAnimationFrame(() => callback());
  }

  return window.setTimeout(callback, FRAME_FALLBACK_MS) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.cancelAnimationFrame === 'function' &&
    !shouldUseTimerFrame()
  ) {
    window.cancelAnimationFrame(handle);
    return;
  }

  window.clearTimeout(handle);
}

export const useEmulatorEvents = () => {
  const engineMode = useSelector((state: RootState) => state.settings.engineMode);
  const {
    editorCode,
    reset,
    setExecutionState,
    setEmulatorInstance,
    syncEmulatorFrame,
    toggleShowFlags,
    delay,
    speedMultiplier,
  } = useEmulatorStore();
  const emulatorRef = useRef<IdeRuntimeSession | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const executionDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutionScheduledRef = useRef(false);
  const delayRef = useRef(delay);
  const speedMultiplierRef = useRef(speedMultiplier);
  const engineModeRef = useRef(engineMode);

  useEffect(() => {
    window.editorCode = editorCode;
  }, [editorCode]);

  useEffect(() => {
    delayRef.current = delay;
  }, [delay]);

  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(() => {
    engineModeRef.current = engineMode;
  }, [engineMode]);

  useEffect(() => {
    const syncStoreFromEmulator = (
      emulator: IdeRuntimeSession,
      options: {
        executionState?: Partial<ExecutionState>;
        runtimeMetrics?: Partial<RuntimeMetrics>;
      } = {}
    ): void => {
      syncRuntimeFrameToIde(emulator, syncEmulatorFrame, options);
    };

    const clearScheduledExecution = (): void => {
      if (executionDelayTimeoutRef.current) {
        clearTimeout(executionDelayTimeoutRef.current);
        executionDelayTimeoutRef.current = null;
      }

      if (animationFrameRef.current !== null) {
        cancelFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      isExecutionScheduledRef.current = false;
    };

    const createReducerEngine = (code: string): IdeRuntimeSession => {
      const adapter = createStoreBackedReducerInterpreterAdapter({
        dispatch: (action: InterpreterReduxAction) =>
          ideStore.dispatch(action as Parameters<AppDispatch>[0]),
        getState: () => ideStore.getState().interpreterRedux,
        getRuntimeStore: () => ideStore.getInterpreterReduxRuntimeStore(),
      });

      adapter.loadProgram(code);
      return adapter;
    };

    const executeFrame = (): void => {
      const emulator = emulatorRef.current;
      if (!emulator) {
        return;
      }

      const frameResult = runEmulationFrame(emulator, {
        frameBudgetMs: getFrameBudgetForEnvironment(),
        speedMultiplier: speedMultiplierRef.current,
      });
      const hasException = Boolean(emulator.getException());
      const halted = emulator.isHalted();
      const waitingForInput = emulator.isWaitingForInput();

      syncStoreFromEmulator(emulator, {
        executionState: {
          started: !halted && !hasException,
          ended: halted || hasException,
          stopped: waitingForInput,
        },
        runtimeMetrics: {
          lastFrameInstructions: frameResult.instructionsExecuted,
          lastFrameDurationMs: frameResult.frameDurationMs,
          lastStopReason: frameResult.stopReason,
        },
      });

      if (frameResult.shouldContinue) {
        scheduleExecutionFrame();
        return;
      }

      clearScheduledExecution();
    };

    const scheduleExecutionFrame = (): void => {
      if (!emulatorRef.current || isExecutionScheduledRef.current) {
        return;
      }

      const queueFrame = (): void => {
        executionDelayTimeoutRef.current = null;
        animationFrameRef.current = requestFrame(() => {
          animationFrameRef.current = null;
          isExecutionScheduledRef.current = false;
          executeFrame();
        });
      };

      const executionDelayMs = delayRef.current > 0 ? Math.max(delayRef.current * 1000, FRAME_FALLBACK_MS) : 0;
      isExecutionScheduledRef.current = true;

      if (executionDelayMs > 0) {
        executionDelayTimeoutRef.current = setTimeout(queueFrame, executionDelayMs);
        return;
      }

      queueFrame();
    };

    const initializeEmulator = (code: string): IdeRuntimeSession | null => {
      clearScheduledExecution();

      const emulator =
        engineModeRef.current === 'interpreter-redux'
          ? createReducerEngine(code)
          : new Emulator(code);
      emulatorRef.current = emulator;
      setEmulatorInstance(emulator);
      window.emulatorInstance = emulator;

      if (emulator.getException()) {
        syncStoreFromEmulator(emulator, {
          executionState: {
            started: false,
            ended: true,
            stopped: false,
          },
          runtimeMetrics: {
            lastFrameInstructions: 0,
            lastFrameDurationMs: 0,
            lastStopReason: 'exception',
          },
        });
        return null;
      }

      syncStoreFromEmulator(emulator, {
        executionState: {
          started: true,
          ended: false,
          stopped: false,
        },
        runtimeMetrics: {
          lastFrameInstructions: 0,
          lastFrameDurationMs: 0,
          lastStopReason: 'initialized',
        },
      });

      return emulator;
    };

    const getCurrentEditorCode = (): string => ideStore.getState().emulator.editorCode || '';

    const handleRun = (): void => {
      const code = getCurrentEditorCode();
      if (!code.trim()) {
        setExecutionState({
          lastInstruction: 'Error: No code to execute',
          exception: 'No code provided',
        });
        return;
      }

      const emulator = initializeEmulator(code);
      if (!emulator) {
        return;
      }

      scheduleExecutionFrame();
    };

    const handleResume = (): void => {
      const emulator = emulatorRef.current;
      if (!emulator || emulator.isHalted() || emulator.getException()) {
        return;
      }

      setExecutionState({
        started: true,
        ended: false,
        stopped: false,
      });
      scheduleExecutionFrame();
    };

    const handleStep = (): void => {
      clearScheduledExecution();

      if (!emulatorRef.current) {
        const code = getCurrentEditorCode();
        if (!code.trim()) {
          setExecutionState({
            lastInstruction: 'Error: No code to step through',
            exception: 'No code provided',
          });
          return;
        }

        const emulator = initializeEmulator(code);
        if (!emulator) {
          return;
        }
      }

      const emulator = emulatorRef.current;
      if (!emulator) {
        return;
      }

      const finished = emulator.emulationStep();
      const hasException = Boolean(emulator.getException());
      const halted = emulator.isHalted() || finished;
      const waitingForInput = emulator.isWaitingForInput();

      syncStoreFromEmulator(emulator, {
        executionState: {
          started: !halted && !hasException,
          ended: halted || hasException,
          stopped: waitingForInput,
        },
        runtimeMetrics: {
          lastFrameInstructions: 1,
          lastFrameDurationMs: 0,
          lastStopReason: waitingForInput
            ? 'waiting_for_input'
            : halted
              ? 'halted'
              : hasException
                ? 'exception'
                : 'manual_step',
        },
      });
    };

    const handleUndo = (): void => {
      clearScheduledExecution();

      if (!emulatorRef.current) {
        return;
      }

      emulatorRef.current.undoFromStack();
      syncStoreFromEmulator(emulatorRef.current, {
        executionState: {
          started: false,
          ended: false,
          stopped: true,
        },
        runtimeMetrics: {
          lastFrameInstructions: 0,
          lastFrameDurationMs: 0,
          lastStopReason: 'undo',
        },
      });
    };

    const handleReset = (): void => {
      clearScheduledExecution();
      const { columns, rows } = ideStore.getState().emulator.terminal;
      terminalSurfaceStore.reset(columns, rows);
      reset();
      emulatorRef.current = null;
      setEmulatorInstance(null);
      window.emulatorInstance = null;
    };

    const handleShowFlags = (): void => {
      toggleShowFlags();
    };

    window.addEventListener('emulator:run', handleRun);
    window.addEventListener('emulator:resume', handleResume);
    window.addEventListener('emulator:step', handleStep);
    window.addEventListener('emulator:undo', handleUndo);
    window.addEventListener('emulator:reset', handleReset);
    window.addEventListener('emulator:showflags', handleShowFlags);

    return () => {
      window.removeEventListener('emulator:run', handleRun);
      window.removeEventListener('emulator:resume', handleResume);
      window.removeEventListener('emulator:step', handleStep);
      window.removeEventListener('emulator:undo', handleUndo);
      window.removeEventListener('emulator:reset', handleReset);
      window.removeEventListener('emulator:showflags', handleShowFlags);
      clearScheduledExecution();
      terminalSurfaceStore.reset();
      emulatorRef.current = null;
      setEmulatorInstance(null);
      window.emulatorInstance = null;
    };
  }, [reset, setExecutionState, setEmulatorInstance, syncEmulatorFrame, toggleShowFlags]);
};
