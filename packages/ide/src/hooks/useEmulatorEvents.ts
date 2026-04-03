import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Emulator, type ExecutionState, type UndoCaptureMode } from '@m68k/interpreter';
import { createInProcessIdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { ideStore, selectActiveFile } from '@/store';
import { runEmulationFrame } from '@/runtime/executionLoop';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  applyRuntimeFrameToIde,
  createRuntimeFrameSyncCache,
  syncRuntimeFrameToIde,
} from '@/runtime/syncRuntimeFrame';
import {
  resolveWorkerFrameBudgetMs,
  resolveWorkerPulseFrameBudgetMs,
  shouldUseTerminalFocusedWorkerProfile,
} from '@/runtime/workerExecutionPolicy';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { syncRuntimeGeometryBridge } from '@/runtime/terminalProgramBridge';
import {
  createWorkerIdeRuntimeSession,
  supportsInterpreterWorkerRuntime,
} from '@/runtime/worker/createWorkerIdeRuntimeSession';
import type { RuntimeMetrics } from '@/stores/emulatorStore';
import { useCompactShell } from '@/hooks/useCompactShell';
import {
  resetEmulatorState,
  setEmulatorInstance as setEmulatorInstanceAction,
  setExecutionState as setExecutionStateAction,
  setRuntimeMetrics as setRuntimeMetricsAction,
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
const MANUAL_RUN_GEOMETRY_RETRY_MS = 120;
const MANUAL_RUN_GEOMETRY_MAX_RETRIES = 6;
const AUTOPLAY_UNDO_CHECKPOINT_INTERVAL = 64;

function isWorkerRuntime(runtime: IdeRuntimeSession | null): boolean {
  return runtime?.getRuntimeTransport?.() === 'worker' && runtime.controller !== undefined;
}

function getWorkerController(runtime: IdeRuntimeSession | null) {
  return runtime && isWorkerRuntime(runtime) ? runtime.controller : undefined;
}

function toWorkerDelayMs(delaySeconds: number): number {
  if (delaySeconds <= 0) {
    return 0;
  }

  return Math.max(Math.round(delaySeconds * 1000), FRAME_FALLBACK_MS);
}

function setRuntimeUndoCaptureMode(
  runtime: IdeRuntimeSession | null,
  mode: UndoCaptureMode
): void {
  runtime?.setUndoCaptureMode?.(
    mode,
    mode === 'checkpointed' ? AUTOPLAY_UNDO_CHECKPOINT_INTERVAL : undefined
  );
}

async function setRuntimeUndoCaptureModeAsync(
  runtime: IdeRuntimeSession | null,
  mode: UndoCaptureMode
): Promise<void> {
  const controller = getWorkerController(runtime);
  if (controller) {
    await controller.requestSetUndoCaptureMode(
      mode,
      mode === 'checkpointed' ? AUTOPLAY_UNDO_CHECKPOINT_INTERVAL : undefined
    );
    return;
  }

  setRuntimeUndoCaptureMode(runtime, mode);
}

async function primeRuntimeForAutoplay(runtime: IdeRuntimeSession | null): Promise<void> {
  await setRuntimeUndoCaptureModeAsync(runtime, 'checkpointed');
  if (!isWorkerRuntime(runtime)) {
    runtime?.forceUndoCheckpoint?.();
  }
}

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
  const terminalGeometryVersion = useSelector(
    (state: RootState) => state.emulator.terminal.geometryVersion
  );
  const currentRegisters = useSelector((state: RootState) => state.emulator.registers);
  const currentFlags = useSelector((state: RootState) => state.emulator.flags);
  const delay = useSelector((state: RootState) => state.emulator.delay);
  const speedMultiplier = useSelector((state: RootState) => state.emulator.speedMultiplier);
  const activeFileId = useSelector((state: RootState) => state.files.activeFileId);
  const workspaceTab = useSelector((state: RootState) => state.uiShell.workspaceTab);
  const terminalInputModePreference = useSelector(
    (state: RootState) => state.settings.terminalInputMode
  );
  const activeFile = useSelector((state: RootState) => selectActiveFile(state));
  const isCompactShell = useCompactShell();
  const emulatorRef = useRef<IdeRuntimeSession | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const executionDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExecutionScheduledRef = useRef(false);
  const delayRef = useRef(delay);
  const speedMultiplierRef = useRef(speedMultiplier);
  const terminalGeometryVersionRef = useRef(terminalGeometryVersion);
  const activeFileIdRef = useRef(activeFileId);
  const workspaceTabRef = useRef(workspaceTab);
  const terminalInputModePreferenceRef = useRef(terminalInputModePreference);
  const isCompactShellRef = useRef(isCompactShell);
  const handleRunRef = useRef<() => void>(() => undefined);
  const handleResumeRef = useRef<() => void>(() => undefined);
  const handleStepRef = useRef<() => void>(() => undefined);
  const handleUndoRef = useRef<() => void>(() => undefined);
  const handleResetRef = useRef<() => void>(() => undefined);
  const handlePulseResumeRef = useRef<() => void>(() => undefined);
  const previousRunIntentRef = useRef(runtimeIntents.run);
  const previousResumeIntentRef = useRef(runtimeIntents.resume);
  const previousPulseResumeIntentRef = useRef(runtimeIntents.pulseResume);
  const previousStepIntentRef = useRef(runtimeIntents.step);
  const previousUndoIntentRef = useRef(runtimeIntents.undo);
  const previousResetIntentRef = useRef(runtimeIntents.reset);
  const lastRegisterSyncAtRef = useRef<number>(0);
  const currentRegistersRef = useRef(currentRegisters);
  const currentFlagsRef = useRef(currentFlags);
  const pendingRunUntilGeometryRef = useRef(false);
  const pendingRunRetryCountRef = useRef(0);
  const pendingRunRetryTimeoutRef = useRef<number | null>(null);
  const frameSyncCacheRef = useRef(createRuntimeFrameSyncCache());
  const runtimeEpochRef = useRef(0);
  const workerUnsubscribeRef = useRef<(() => void) | null>(null);
  const syncStoreFromEmulatorRef = useRef<
    (
      emulator: IdeRuntimeSession,
      options?: {
        executionState?: Partial<ExecutionState>;
        runtimeMetrics?: Partial<RuntimeMetrics>;
        forceRegisterSync?: boolean;
      }
    ) => void
  >(() => undefined);

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
    currentRegistersRef.current = currentRegisters;
  }, [currentRegisters]);

  useEffect(() => {
    currentFlagsRef.current = currentFlags;
  }, [currentFlags]);

  useEffect(() => {
    terminalGeometryVersionRef.current = terminalGeometryVersion;
  }, [terminalGeometryVersion]);

  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  useEffect(() => {
    workspaceTabRef.current = workspaceTab;
  }, [workspaceTab]);

  useEffect(() => {
    terminalInputModePreferenceRef.current = terminalInputModePreference;
  }, [terminalInputModePreference]);

  useEffect(() => {
    isCompactShellRef.current = isCompactShell;
  }, [isCompactShell]);

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
        options.forceRegisterSync === true ||
        now - lastRegisterSyncAtRef.current >= REGISTER_SYNC_INTERVAL_MS;

      if (shouldSyncRegisters) {
        lastRegisterSyncAtRef.current = now;
      }

      syncRuntimeFrameToIde(emulator, (frame) => dispatch(syncEmulatorFrameAction(frame)), {
        executionState: options.executionState,
        runtimeMetrics: options.runtimeMetrics,
        cache: frameSyncCacheRef.current,
        publishMemorySurface: workspaceTabRef.current === 'memory',
        suppressRegisterSync: !shouldSyncRegisters,
      });
    };

    syncStoreFromEmulatorRef.current = syncStoreFromEmulator;

    const clearWorkerSubscription = (): void => {
      if (workerUnsubscribeRef.current) {
        workerUnsubscribeRef.current();
        workerUnsubscribeRef.current = null;
      }
    };

    const buildWorkerExecutionConfig = () => ({
      delayMs: toWorkerDelayMs(delayRef.current),
      speedMultiplier: speedMultiplierRef.current,
      frameBudgetMs: resolveWorkerFrameBudgetMs({
        activeFileId: activeFileIdRef.current,
        workspaceTab: workspaceTabRef.current,
        terminalInputModePreference: terminalInputModePreferenceRef.current,
        isCompactShell: isCompactShellRef.current,
        environmentFrameBudgetMs: getFrameBudgetForEnvironment(),
      }),
      publishMemoryDuringContinuousFrames: !shouldUseTerminalFocusedWorkerProfile({
        activeFileId: activeFileIdRef.current,
        workspaceTab: workspaceTabRef.current,
        terminalInputModePreference: terminalInputModePreferenceRef.current,
        isCompactShell: isCompactShellRef.current,
      }),
      terminalFocusedContinuousFrames: shouldUseTerminalFocusedWorkerProfile({
        activeFileId: activeFileIdRef.current,
        workspaceTab: workspaceTabRef.current,
        terminalInputModePreference: terminalInputModePreferenceRef.current,
        isCompactShell: isCompactShellRef.current,
      }),
    });

    const buildWorkerPulseFrameBudget = () =>
      resolveWorkerPulseFrameBudgetMs({
        activeFileId: activeFileIdRef.current,
        workspaceTab: workspaceTabRef.current,
        terminalInputModePreference: terminalInputModePreferenceRef.current,
        isCompactShell: isCompactShellRef.current,
      });

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

    const clearPendingRunRetry = (): void => {
      if (pendingRunRetryTimeoutRef.current !== null) {
        window.clearTimeout(pendingRunRetryTimeoutRef.current);
        pendingRunRetryTimeoutRef.current = null;
      }
    };

    const disposeRuntime = async (runtime: IdeRuntimeSession | null): Promise<void> => {
      if (runtime?.controller) {
        await runtime.controller.dispose();
      }
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
      if (!emulatorRef.current || isExecutionScheduledRef.current || isWorkerRuntime(emulatorRef.current)) {
        return;
      }

      const queueFrame = (): void => {
        executionDelayTimeoutRef.current = null;
        animationFrameRef.current = requestFrame(() => {
          animationFrameRef.current = null;
          isExecutionScheduledRef.current = false;
          void executeFrame();
        });
      };

      const executionDelayMs =
        delayRef.current > 0 ? Math.max(delayRef.current * 1000, FRAME_FALLBACK_MS) : 0;
      isExecutionScheduledRef.current = true;

      if (executionDelayMs > 0) {
        executionDelayTimeoutRef.current = setTimeout(queueFrame, executionDelayMs);
        return;
      }

      queueFrame();
    };

    const scheduleImmediateExecutionFrame = (): void => {
      if (!emulatorRef.current || isWorkerRuntime(emulatorRef.current)) {
        return;
      }

      if (executionDelayTimeoutRef.current) {
        clearTimeout(executionDelayTimeoutRef.current);
        executionDelayTimeoutRef.current = null;
      }

      if (animationFrameRef.current !== null) {
        cancelFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      isExecutionScheduledRef.current = true;
      animationFrameRef.current = requestFrame(() => {
        animationFrameRef.current = null;
        isExecutionScheduledRef.current = false;
        void executeFrame();
      });
    };

    const initializeEmulator = async (code: string): Promise<IdeRuntimeSession | null> => {
      clearScheduledExecution();
      clearWorkerSubscription();
      runtimeEpochRef.current += 1;
      const epoch = runtimeEpochRef.current;
      const previousRuntime = emulatorRef.current;
      emulatorRef.current = null;
      dispatch(setEmulatorInstanceAction(null));
      window.emulatorInstance = null;
      await disposeRuntime(previousRuntime);
      const { columns, rows } = ideStore.getState().emulator.terminal;
      const emulator =
        !isJsdomEnvironment() && supportsInterpreterWorkerRuntime()
          ? createWorkerIdeRuntimeSession()
          : createInProcessIdeRuntimeSession(new Emulator(code, { columns, rows }));

      const workerController = getWorkerController(emulator);
      emulatorRef.current = emulator;
      frameSyncCacheRef.current = createRuntimeFrameSyncCache();
      dispatch(setEmulatorInstanceAction(emulator));
      window.emulatorInstance = emulator;

      if (workerController?.subscribeEvents) {
        workerUnsubscribeRef.current = workerController.subscribeEvents((event) => {
          if (runtimeEpochRef.current !== epoch || emulatorRef.current !== emulator) {
            return;
          }

          if (event.type === 'frame') {
            if (event.kind === 'heartbeat') {
              return;
            }

            applyRuntimeFrameToIde(
              emulator,
              event.frame,
              (frame) => dispatch(syncEmulatorFrameAction(frame)),
              {
                cache: frameSyncCacheRef.current,
                syncVersions: event.snapshot.syncVersions,
              }
            );
            return;
          }

          if (event.type === 'fault') {
            dispatch(
              setExecutionStateAction({
                started: false,
                ended: true,
                stopped: false,
                exception: event.exception ?? null,
                errors: event.errors,
              })
            );
            dispatch(
              setRuntimeMetricsAction({
                lastFrameInstructions: 0,
                lastFrameDurationMs: 0,
                lastStopReason: 'exception',
              })
            );
          }
        });
      }

      if (workerController) {
        await workerController.initialize?.();
        if (runtimeEpochRef.current !== epoch) {
          await disposeRuntime(emulator);
          return null;
        }
        await workerController.requestLoadProgram(code, columns, rows);
        if (runtimeEpochRef.current !== epoch) {
          await disposeRuntime(emulator);
          return null;
        }
      } else {
        syncRuntimeGeometryBridge(emulator, columns, rows);
      }

      if (emulator.getException()) {
        if (!workerController) {
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
        }
        return null;
      }

      if (!workerController) {
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
      }

      return emulator;
    };

    const getCurrentEditorCode = (): string =>
      selectActiveFile(ideStore.getState()).content ||
      ideStore.getState().emulator.editorCode ||
      '';

    const handleRun = (): void => {
      void (async () => {
        if (
          terminalGeometryVersionRef.current <= 1 &&
          pendingRunRetryCountRef.current < MANUAL_RUN_GEOMETRY_MAX_RETRIES
        ) {
          pendingRunUntilGeometryRef.current = true;
          pendingRunRetryCountRef.current += 1;
          clearPendingRunRetry();
          pendingRunRetryTimeoutRef.current = window.setTimeout(() => {
            pendingRunRetryTimeoutRef.current = null;
            handleRunRef.current();
          }, MANUAL_RUN_GEOMETRY_RETRY_MS);
          return;
        }

        clearPendingRunRetry();
        pendingRunRetryCountRef.current = 0;
        pendingRunUntilGeometryRef.current = false;

        const code = getCurrentEditorCode();
        if (!code.trim()) {
          dispatch(
            setExecutionStateAction({
              lastInstruction: 'Error: No code to execute',
              exception: 'No code provided',
            })
          );
          return;
        }

        const emulator = await initializeEmulator(code);
        if (!emulator) {
          return;
        }

        await primeRuntimeForAutoplay(emulator);
        const workerController = getWorkerController(emulator);
        if (workerController) {
          await workerController.requestRun(buildWorkerExecutionConfig());
          return;
        }

        scheduleExecutionFrame();
      })();
    };

    const handleResume = (): void => {
      void (async () => {
        const emulator = emulatorRef.current;
        if (!emulator || emulator.isHalted() || emulator.getException()) {
          return;
        }

        dispatch(
          setExecutionStateAction({
            started: true,
            ended: false,
            stopped: false,
          })
        );
        await primeRuntimeForAutoplay(emulator);
        const workerController = getWorkerController(emulator);
        if (workerController) {
          await workerController.requestResume(buildWorkerExecutionConfig());
          return;
        }

        scheduleExecutionFrame();
      })();
    };

    const handlePulseResume = (): void => {
      void (async () => {
        const emulator = emulatorRef.current;
        if (!emulator || emulator.isHalted() || emulator.getException()) {
          return;
        }

        const workerController = getWorkerController(emulator);
        if (workerController?.requestPulseExecution) {
          const accepted = await workerController.requestPulseExecution(
            buildWorkerPulseFrameBudget()
          );
          if (!accepted) {
            dispatch(
              setExecutionStateAction({
                started: true,
                ended: false,
                stopped: false,
              })
            );
            await primeRuntimeForAutoplay(emulator);
            await workerController.requestResume(buildWorkerExecutionConfig());
            await workerController.requestPulseExecution(buildWorkerPulseFrameBudget());
          }
          return;
        }

        scheduleImmediateExecutionFrame();
      })();
    };

    const handleStep = (): void => {
      void (async () => {
        clearScheduledExecution();

        if (!emulatorRef.current) {
          const code = getCurrentEditorCode();
          if (!code.trim()) {
            dispatch(
              setExecutionStateAction({
                lastInstruction: 'Error: No code to step through',
                exception: 'No code provided',
              })
            );
            return;
          }

          const emulator = await initializeEmulator(code);
          if (!emulator) {
            return;
          }
        }

        const emulator = emulatorRef.current;
        if (!emulator) {
          return;
        }

        const stepStartedAt = getCurrentTimestamp();
        await setRuntimeUndoCaptureModeAsync(emulator, 'full');

        const workerController = getWorkerController(emulator);
        if (workerController) {
          await workerController.requestStep();
          return;
        } else {
          emulator.emulationStep();
        }

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
            lastFrameInstructions: 1,
            lastFrameDurationMs: getCurrentTimestamp() - stepStartedAt,
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
      })();
    };

    const handleUndo = (): void => {
      void (async () => {
        clearScheduledExecution();

        const emulator = emulatorRef.current;
        if (!emulator) {
          return;
        }

        const workerController = getWorkerController(emulator);
        if (workerController) {
          await workerController.requestUndo();
          return;
        } else {
          emulator.undoFromStack();
        }

        syncStoreFromEmulator(emulator, {
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
      })();
    };

    const handleReset = (): void => {
      void (async () => {
        clearScheduledExecution();
        clearPendingRunRetry();
        runtimeEpochRef.current += 1;
        clearWorkerSubscription();
        lastRegisterSyncAtRef.current = 0;
        pendingRunUntilGeometryRef.current = false;
        pendingRunRetryCountRef.current = 0;
        const { columns, rows } = ideStore.getState().emulator.terminal;
        terminalSurfaceStore.reset(columns, rows);
        frameSyncCacheRef.current = createRuntimeFrameSyncCache();
        const runtime = emulatorRef.current;
        emulatorRef.current = null;
        dispatch(resetEmulatorState());
        dispatch(setEmulatorInstanceAction(null));
        window.emulatorInstance = null;
        await disposeRuntime(runtime);
      })();
    };

    handleRunRef.current = handleRun;
    handleResumeRef.current = handleResume;
    handlePulseResumeRef.current = handlePulseResume;
    handleStepRef.current = handleStep;
    handleUndoRef.current = handleUndo;
    handleResetRef.current = handleReset;

    return () => {
      clearScheduledExecution();
      clearPendingRunRetry();
      runtimeEpochRef.current += 1;
      clearWorkerSubscription();
      pendingRunRetryCountRef.current = 0;
      pendingRunUntilGeometryRef.current = false;
      terminalSurfaceStore.reset();
      frameSyncCacheRef.current = createRuntimeFrameSyncCache();
      void disposeRuntime(emulatorRef.current);
      emulatorRef.current = null;
      dispatch(setEmulatorInstanceAction(null));
      window.emulatorInstance = null;
    };
  }, [dispatch]);

  useEffect(() => {
    const controller = getWorkerController(emulatorRef.current);
    if (!controller?.requestConfigureExecution) {
      return;
    }

    void controller.requestConfigureExecution({
      delayMs: toWorkerDelayMs(delay),
      speedMultiplier,
      frameBudgetMs: resolveWorkerFrameBudgetMs({
        activeFileId,
        workspaceTab,
        terminalInputModePreference,
        isCompactShell,
        environmentFrameBudgetMs: getFrameBudgetForEnvironment(),
      }),
      publishMemoryDuringContinuousFrames: !shouldUseTerminalFocusedWorkerProfile({
        activeFileId,
        workspaceTab,
        terminalInputModePreference,
        isCompactShell,
      }),
      terminalFocusedContinuousFrames: shouldUseTerminalFocusedWorkerProfile({
        activeFileId,
        workspaceTab,
        terminalInputModePreference,
        isCompactShell,
      }),
    });
  }, [
    activeFileId,
    delay,
    isCompactShell,
    speedMultiplier,
    terminalInputModePreference,
    workspaceTab,
  ]);

  useEffect(() => {
    if (workspaceTab !== 'memory') {
      return;
    }

    const emulator = emulatorRef.current;
    const controller = getWorkerController(emulator);
    if (!emulator || !controller) {
      return;
    }

    void (async () => {
      await controller.requestSnapshot();
      syncStoreFromEmulatorRef.current(emulator, { forceRegisterSync: true });
    })();
  }, [workspaceTab]);

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
    if (!pendingRunUntilGeometryRef.current || terminalGeometryVersion <= 1) {
      return;
    }

    if (pendingRunRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingRunRetryTimeoutRef.current);
      pendingRunRetryTimeoutRef.current = null;
    }
    pendingRunUntilGeometryRef.current = false;
    pendingRunRetryCountRef.current = 0;
    handleRunRef.current();
  }, [terminalGeometryVersion]);

  useEffect(() => {
    if (runtimeIntents.resume === previousResumeIntentRef.current) {
      return;
    }

    previousResumeIntentRef.current = runtimeIntents.resume;
    handleResumeRef.current();
  }, [runtimeIntents.resume]);

  useEffect(() => {
    if (runtimeIntents.pulseResume === previousPulseResumeIntentRef.current) {
      return;
    }

    previousPulseResumeIntentRef.current = runtimeIntents.pulseResume;
    handlePulseResumeRef.current();
  }, [runtimeIntents.pulseResume]);

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
