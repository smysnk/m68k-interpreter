import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createStoreBackedReducerInterpreterAdapter,
  type InterpreterReduxAction,
} from '@m68k/interpreter-redux';
import { Emulator, type ExecutionState } from '@m68k/interpreter';
import { ideStore, selectActiveFile } from '@/store';
import { runEmulationFrame } from '@/runtime/executionLoop';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { syncRuntimeFrameToIde } from '@/runtime/syncRuntimeFrame';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import type { RuntimeMetrics } from '@/stores/emulatorStore';
import {
  resetEmulatorState,
  setEmulatorInstance as setEmulatorInstanceAction,
  setExecutionState as setExecutionStateAction,
  syncEmulatorFrame as syncEmulatorFrameAction,
  type AppDispatch,
  type RootState,
} from '@/store';

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
const REGISTER_SYNC_INTERVAL_MS = 250;

function getCurrentTimestamp(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

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
  const dispatch = useDispatch<AppDispatch>();
  const runtimeIntents = useSelector((state: RootState) => state.emulator.runtimeIntents);
  const engineMode = useSelector((state: RootState) => state.settings.engineMode);
  const currentRegisters = useSelector((state: RootState) => state.emulator.registers);
  const delay = useSelector((state: RootState) => state.emulator.delay);
  const speedMultiplier = useSelector((state: RootState) => state.emulator.speedMultiplier);
  const activeFile = useSelector((state: RootState) => selectActiveFile(state));
  const emulatorRef = useRef<IdeRuntimeSession | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const executionDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutionScheduledRef = useRef(false);
  const delayRef = useRef(delay);
  const speedMultiplierRef = useRef(speedMultiplier);
  const engineModeRef = useRef(engineMode);
  const handleRunRef = useRef<() => void>(() => undefined);
  const handleResumeRef = useRef<() => void>(() => undefined);
  const handleStepRef = useRef<() => void>(() => undefined);
  const handleUndoRef = useRef<() => void>(() => undefined);
  const handleResetRef = useRef<() => void>(() => undefined);
  const previousRunIntentRef = useRef(runtimeIntents.run);
  const previousResumeIntentRef = useRef(runtimeIntents.resume);
  const previousStepIntentRef = useRef(runtimeIntents.step);
  const previousUndoIntentRef = useRef(runtimeIntents.undo);
  const previousResetIntentRef = useRef(runtimeIntents.reset);
  const lastRegisterSyncAtRef = useRef<number>(0);
  const currentRegistersRef = useRef(currentRegisters);

  useEffect(() => {
    window.editorCode = activeFile.content;
  }, [activeFile.content]);

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
    currentRegistersRef.current = currentRegisters;
  }, [currentRegisters]);

  useEffect(() => {
    const syncStoreFromEmulator = (
      emulator: IdeRuntimeSession,
      options: {
        executionState?: Partial<ExecutionState>;
        runtimeMetrics?: Partial<RuntimeMetrics>;
        forceRegisterSync?: boolean;
      } = {}
    ): void => {
      const now = getCurrentTimestamp();
      const shouldSyncRegisters =
        options.forceRegisterSync === true || now - lastRegisterSyncAtRef.current >= REGISTER_SYNC_INTERVAL_MS;

      if (shouldSyncRegisters) {
        lastRegisterSyncAtRef.current = now;
      }

      syncRuntimeFrameToIde(emulator, (frame) => dispatch(syncEmulatorFrameAction(frame)), {
        executionState: options.executionState,
        runtimeMetrics: options.runtimeMetrics,
        registersOverride: shouldSyncRegisters ? undefined : currentRegistersRef.current,
      });
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
        forceRegisterSync: waitingForInput || halted || hasException,
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

    const initializeEmulator = (code: string, nextEngineMode = engineModeRef.current): IdeRuntimeSession | null => {
      clearScheduledExecution();

      const emulator = nextEngineMode === 'interpreter-redux' ? createReducerEngine(code) : new Emulator(code);
      emulatorRef.current = emulator;
      dispatch(setEmulatorInstanceAction(emulator));
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
          forceRegisterSync: true,
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
        forceRegisterSync: true,
      });

      return emulator;
    };

    const getCurrentEditorCode = (): string =>
      selectActiveFile(ideStore.getState()).content || ideStore.getState().emulator.editorCode || '';

    const handleRun = (): void => {
        const code = getCurrentEditorCode();
        if (!code.trim()) {
          dispatch(setExecutionStateAction({
            lastInstruction: 'Error: No code to execute',
            exception: 'No code provided',
          }));
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

      dispatch(setExecutionStateAction({
        started: true,
        ended: false,
        stopped: false,
      }));
      scheduleExecutionFrame();
    };

    const handleStep = (): void => {
      clearScheduledExecution();

      if (!emulatorRef.current) {
        const code = getCurrentEditorCode();
        if (!code.trim()) {
          dispatch(setExecutionStateAction({
            lastInstruction: 'Error: No code to step through',
            exception: 'No code provided',
          }));
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
        forceRegisterSync: true,
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
        forceRegisterSync: true,
      });
    };

    const handleReset = (): void => {
      clearScheduledExecution();
      lastRegisterSyncAtRef.current = 0;
      const { columns, rows } = ideStore.getState().emulator.terminal;
      terminalSurfaceStore.reset(columns, rows);
      dispatch(resetEmulatorState());
      emulatorRef.current = null;
      dispatch(setEmulatorInstanceAction(null));
      window.emulatorInstance = null;
    };

    handleRunRef.current = handleRun;
    handleResumeRef.current = handleResume;
    handleStepRef.current = handleStep;
    handleUndoRef.current = handleUndo;
    handleResetRef.current = handleReset;

    return () => {
      clearScheduledExecution();
      terminalSurfaceStore.reset();
      emulatorRef.current = null;
      dispatch(setEmulatorInstanceAction(null));
      window.emulatorInstance = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (runtimeIntents.reset === previousResetIntentRef.current) {
      return;
    }

    previousResetIntentRef.current = runtimeIntents.reset;
    handleResetRef.current();
  }, [runtimeIntents.reset]);

  useEffect(() => {
    if (runtimeIntents.run === previousRunIntentRef.current) {
      return;
    }

    previousRunIntentRef.current = runtimeIntents.run;
    handleRunRef.current();
  }, [runtimeIntents.run]);

  useEffect(() => {
    if (runtimeIntents.resume === previousResumeIntentRef.current) {
      return;
    }

    previousResumeIntentRef.current = runtimeIntents.resume;
    handleResumeRef.current();
  }, [runtimeIntents.resume]);

  useEffect(() => {
    if (runtimeIntents.step === previousStepIntentRef.current) {
      return;
    }

    previousStepIntentRef.current = runtimeIntents.step;
    handleStepRef.current();
  }, [runtimeIntents.step]);

  useEffect(() => {
    if (runtimeIntents.undo === previousUndoIntentRef.current) {
      return;
    }

    previousUndoIntentRef.current = runtimeIntents.undo;
    handleUndoRef.current();
  }, [runtimeIntents.undo]);
};
