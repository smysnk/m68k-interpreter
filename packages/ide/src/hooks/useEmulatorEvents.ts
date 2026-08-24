import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  DEFAULT_EASY68K_HARDWARE_DEVICE_CONFIG,
  Emulator,
  type ExecutionState,
  type UndoCaptureMode,
} from '@m68k/interpreter';
import { createInProcessIdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  getPanelHardwareDeviceConfigs,
  ideStore,
  selectActiveFile,
  selectPanelRuntimeSurfacePolicy,
} from '@/store';
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
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';
import { RuntimeUnavailableError, StaleRuntimeCommandError } from '@/runtime/runtimeCommandPort';
import {
  runtimeDebuggerCommandPort,
  runtimeDeviceCommandPort,
  runtimeExecutionCommandPort,
  runtimeLifecycleCommandPort,
} from '@/runtime/runtimeCommandDomains';
import { hardwareSurfaceStore } from '@/runtime/hardwareSurfaceStore';
import { graphicsSurfaceStore } from '@/runtime/graphicsSurfaceStore';
import { soundSurfaceStore } from '@/runtime/soundSurfaceStore';
import { easy68kAudioHost } from '@/runtime/easy68kAudioHost';
import { DEFAULT_EASY68K_SOUND_ASSETS } from '@/runtime/defaultSoundAssets';
import { loadPersistedEasy68kSoundAssets } from '@/runtime/easy68kSoundAssetManifest';
import { executionCoordinator } from '@/runtime/executionCoordinator';
import { recordDebuggerSnapshotDispatch } from '@/runtime/idePerformanceTelemetry';
import { syncRuntimeGeometryBridge } from '@/runtime/terminalProgramBridge';
import { buildRuntimeLoadRequest } from '@/runtime/useRuntimeConfiguration';
import { subscribeToCurrentRuntimeFrames } from '@/runtime/useRuntimeFrameSubscription';
import { disposeRuntimeReplacement } from '@/runtime/useRuntimeLifecycle';
import {
  createWorkerIdeRuntimeSession,
  supportsInterpreterWorkerRuntime,
} from '@/runtime/worker/createWorkerIdeRuntimeSession';
import type { RuntimeMetrics } from '@/stores/emulatorStore';
import type { WorkspaceTab } from '@/store/uiShellSlice';
import { useCompactShell } from '@/hooks/useCompactShell';
import {
  NIBBLES_FILE_ID,
  markDebugSourceSynchronized,
  resetEmulatorState,
  resetDebugSession,
  setRuntimeSessionMetadata,
  setExecutionState as setExecutionStateAction,
  setRuntimeMetrics as setRuntimeMetricsAction,
  syncEmulatorFrame as syncEmulatorFrameAction,
  syncDebugSnapshot,
  captureDebuggerStopRegisters,
  type AppDispatch,
  type RootState,
} from '@/store';

declare global {
  interface Window {
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

function getConfiguredHardwareDevices() {
  const state = ideStore.getState();
  const devices = getPanelHardwareDeviceConfigs(
    Object.values(state.panelLayout.activeLayout.instances)
  );
  return devices.length > 0
    ? devices
    : [
        {
          ...DEFAULT_EASY68K_HARDWARE_DEVICE_CONFIG,
          ...state.hardware.config,
        },
      ];
}

async function setRuntimeUndoCaptureModeAsync(
  runtime: IdeRuntimeSession | null,
  mode: UndoCaptureMode
): Promise<void> {
  if (!runtime) {
    return;
  }
  await runtimeExecutionCommandPort.setUndoCaptureMode(
    mode,
    mode === 'checkpointed' ? AUTOPLAY_UNDO_CHECKPOINT_INTERVAL : undefined
  );
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

function isDisposedWorkerRuntimeError(error: unknown): boolean {
  return (
    error instanceof RuntimeUnavailableError ||
    error instanceof StaleRuntimeCommandError ||
    (error instanceof Error && /disposed/i.test(error.message))
  );
}

function publishRuntimeSession(runtime: IdeRuntimeSession | null, dispatch: AppDispatch): void {
  if (runtime) {
    runtimeSessionStore.replace(runtime);
  } else {
    runtimeSessionStore.clear();
  }
  const snapshot = runtimeSessionStore.getSnapshot();
  dispatch(
    setRuntimeSessionMetadata({
      ready: snapshot.ready,
      transport: snapshot.transport,
      epoch: snapshot.epoch,
    })
  );
  window.emulatorInstance = runtime;
}

export const useEmulatorEvents = () => {
  const dispatch = useDispatch<AppDispatch>();
  const terminalColumns = useSelector((state: RootState) => state.emulator.terminal.columns);
  const terminalRows = useSelector((state: RootState) => state.emulator.terminal.rows);
  const terminalGeometryVersion = useSelector(
    (state: RootState) => state.emulator.terminal.geometryVersion
  );
  const currentRegisters = useSelector((state: RootState) => state.emulator.registers);
  const currentFlags = useSelector((state: RootState) => state.emulator.flags);
  const delay = useSelector((state: RootState) => state.emulator.delay);
  const speedMultiplier = useSelector((state: RootState) => state.emulator.speedMultiplier);
  const activeFileId = useSelector((state: RootState) => state.files.activeFileId);
  const panelSurfacePolicy = useSelector(selectPanelRuntimeSurfacePolicy);
  const workspaceTab: WorkspaceTab = panelSurfacePolicy.memorySurfaceVisible
    ? 'memory'
    : panelSurfacePolicy.terminalFocusedPresentation
      ? 'terminal'
      : 'code';
  const terminalInputModePreference = useSelector(
    (state: RootState) => state.settings.terminalInputMode
  );
  const cpuModel = useSelector((state: RootState) => state.settings.cpuModel);
  const machineProfile = useSelector((state: RootState) => state.settings.machineProfile);
  const debuggerConfiguration = useSelector((state: RootState) => state.debugger.configuration);
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
  const handleResetRef = useRef<() => void>(() => undefined);
  const previousEmulationRef = useRef(`${cpuModel}:${machineProfile}`);
  const lastRegisterSyncAtRef = useRef<number>(0);
  const lastDebugSnapshotVersionRef = useRef<number | null>(null);
  const currentRegistersRef = useRef(currentRegisters);
  const currentFlagsRef = useRef(currentFlags);
  const pendingRunUntilGeometryRef = useRef(false);
  const pendingRunRetryCountRef = useRef(0);
  const pendingRunRetryTimeoutRef = useRef<number | null>(null);
  const frameSyncCacheRef = useRef(createRuntimeFrameSyncCache());
  const runtimeEpochRef = useRef(0);
  const workerUnsubscribeRef = useRef<(() => void) | null>(null);
  const isInitializingRuntimeRef = useRef(false);
  const queuedRunAfterInitRef = useRef(false);
  const lastHandledNibblesGeometrySignatureRef = useRef(`${terminalColumns}x${terminalRows}`);
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
    if (!runtimeSessionStore.getSession()) return;
    void runtimeDebuggerCommandPort
      .configureDebugger(debuggerConfiguration)
      .catch((error: unknown) => {
        if (!isDisposedWorkerRuntimeError(error)) throw error;
      });
  }, [debuggerConfiguration]);

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
      syncDebuggerSnapshotFromRuntime(emulator);
    };

    const syncDebuggerSnapshotFromRuntime = (
      emulator: IdeRuntimeSession,
      providedSnapshot?: ReturnType<NonNullable<IdeRuntimeSession['getDebugSnapshot']>>
    ): void => {
      const publishedVersion = emulator.getRuntimeSyncVersions?.()?.debugger;
      if (
        publishedVersion !== undefined &&
        lastDebugSnapshotVersionRef.current === publishedVersion
      ) {
        return;
      }
      const debugSnapshot = providedSnapshot ?? emulator.getDebugSnapshot?.();
      if (debugSnapshot) {
        lastDebugSnapshotVersionRef.current =
          emulator.getRuntimeSyncVersions?.()?.debugger ?? publishedVersion ?? null;
        dispatch(syncDebugSnapshot(debugSnapshot));
        recordDebuggerSnapshotDispatch({
          snapshot: debugSnapshot,
          manualPause: debugSnapshot.stop?.reason === 'manual-pause',
        });
        if (debugSnapshot.stop) {
          dispatch(
            captureDebuggerStopRegisters({
              stop: debugSnapshot.stop,
              registers: ideStore.getState().emulator.registers,
            })
          );
        }
      }
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

    const synchronizeDebuggerConfiguration = async (): Promise<void> => {
      await runtimeDebuggerCommandPort.configureDebugger(
        ideStore.getState().debugger.configuration
      );
    };

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
        try {
          await runtime.controller.dispose();
        } catch (error) {
          if (!isDisposedWorkerRuntimeError(error)) {
            throw error;
          }
        }
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
      if (
        !emulatorRef.current ||
        isExecutionScheduledRef.current ||
        isWorkerRuntime(emulatorRef.current)
      ) {
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
      hardwareSurfaceStore.reset();
      graphicsSurfaceStore.reset();
      soundSurfaceStore.reset();
      await disposeRuntimeReplacement({
        previous: previousRuntime,
        clearPublishedRuntime: () => publishRuntimeSession(null, dispatch),
        dispose: disposeRuntime,
      });
      const { columns, rows } = ideStore.getState().emulator.terminal;
      const selectedSettings = ideStore.getState().settings;
      const selectedEmulation = {
        cpuModel: selectedSettings.cpuModel,
        machineProfile: selectedSettings.machineProfile,
      } as const;
      const configuredHardwareDevices = getConfiguredHardwareDevices();
      const configuredSoundAssets =
        selectedEmulation.machineProfile === 'easy68k'
          ? [...DEFAULT_EASY68K_SOUND_ASSETS, ...loadPersistedEasy68kSoundAssets()]
          : [];
      const emulator =
        !isJsdomEnvironment() && supportsInterpreterWorkerRuntime()
          ? createWorkerIdeRuntimeSession()
          : createInProcessIdeRuntimeSession(
              new Emulator(code, {
                columns,
                rows,
                emulation: selectedEmulation,
                hardwareDevices: configuredHardwareDevices,
                soundAssets: configuredSoundAssets,
                debugFileId: activeFileIdRef.current,
              })
            );

      const workerController = getWorkerController(emulator);
      emulatorRef.current = emulator;
      frameSyncCacheRef.current = createRuntimeFrameSyncCache();
      lastDebugSnapshotVersionRef.current = null;
      publishRuntimeSession(emulator, dispatch);

      if (workerController?.subscribeEvents) {
        workerUnsubscribeRef.current = subscribeToCurrentRuntimeFrames({
          controller: workerController,
          isCurrent: () => runtimeEpochRef.current === epoch && emulatorRef.current === emulator,
          onEvent: (event) => {
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
              if (event.snapshot.debugSnapshot) {
                syncDebuggerSnapshotFromRuntime(emulator, event.snapshot.debugSnapshot);
              }
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
          },
        });
      }

      if (workerController) {
        await runtimeLifecycleCommandPort.initialize();
        if (runtimeEpochRef.current !== epoch) {
          await disposeRuntime(emulator);
          return null;
        }
        await runtimeLifecycleCommandPort.loadProgram(
          buildRuntimeLoadRequest({
            source: code,
            debugFileId: activeFileIdRef.current,
            emulation: selectedEmulation,
            columns,
            rows,
            hardwareDevices: configuredHardwareDevices,
            execution: {
              delayMs: toWorkerDelayMs(delayRef.current),
              speedMultiplier: speedMultiplierRef.current,
              frameBudgetMs: getFrameBudgetForEnvironment(),
              publishMemoryDuringContinuousFrames: true,
              terminalFocusedContinuousFrames: false,
            },
            undoMode: 'full',
          })
        );
        if (runtimeEpochRef.current !== epoch) {
          await disposeRuntime(emulator);
          return null;
        }
      } else {
        easy68kAudioHost.configureAssets(configuredSoundAssets);
        easy68kAudioHost.setVoiceEndedHandler((voiceId) => {
          void runtimeDeviceCommandPort.stopCompletedSoundVoice(voiceId);
        });
        syncRuntimeGeometryBridge(emulator, columns, rows);
      }

      await synchronizeDebuggerConfiguration();
      dispatch(markDebugSourceSynchronized());

      const hardwarePreferences = ideStore.getState().hardware;
      await runtimeDeviceCommandPort.configureAutomaticInterrupts(
        hardwarePreferences.automaticInterruptLevels,
        hardwarePreferences.automaticInterruptIntervalMs
      );

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
      if (ideStore.getState().settings.machineProfile === 'easy68k') {
        void easy68kAudioHost.unlock();
      }
      void (async () => {
        if (isInitializingRuntimeRef.current) {
          queuedRunAfterInitRef.current = true;
          return;
        }

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

        isInitializingRuntimeRef.current = true;

        try {
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
            await runtimeExecutionCommandPort.run(buildWorkerExecutionConfig());
            return;
          }

          scheduleExecutionFrame();
        } catch (error) {
          if (!isDisposedWorkerRuntimeError(error)) {
            console.error(error);
          }
        } finally {
          isInitializingRuntimeRef.current = false;

          if (queuedRunAfterInitRef.current) {
            queuedRunAfterInitRef.current = false;
            window.setTimeout(() => {
              handleRunRef.current();
            }, 0);
          }
        }
      })();
    };

    const handleResume = (): void => {
      if (ideStore.getState().settings.machineProfile === 'easy68k') {
        void easy68kAudioHost.unlock();
      }
      void (async () => {
        const emulator = emulatorRef.current;
        if (!emulator || emulator.isHalted() || emulator.getException()) {
          return;
        }

        await synchronizeDebuggerConfiguration();
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
          await runtimeExecutionCommandPort.resume(buildWorkerExecutionConfig());
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

        await synchronizeDebuggerConfiguration();
        const workerController = getWorkerController(emulator);
        if (workerController?.requestPulseExecution) {
          const accepted = await runtimeExecutionCommandPort.pulse(buildWorkerPulseFrameBudget());
          if (!accepted) {
            dispatch(
              setExecutionStateAction({
                started: true,
                ended: false,
                stopped: false,
              })
            );
            await primeRuntimeForAutoplay(emulator);
            await runtimeExecutionCommandPort.resume(buildWorkerExecutionConfig());
            await runtimeExecutionCommandPort.pulse(buildWorkerPulseFrameBudget());
          }
          return;
        }

        scheduleImmediateExecutionFrame();
      })();
    };

    const handleStep = (): void => {
      if (ideStore.getState().settings.machineProfile === 'easy68k') {
        void easy68kAudioHost.unlock();
      }
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
          await runtimeExecutionCommandPort.step();
          return;
        } else {
          await runtimeExecutionCommandPort.step();
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

    const handlePause = (): void => {
      void (async () => {
        clearScheduledExecution();
        const emulator = emulatorRef.current;
        if (!emulator) return;
        await runtimeExecutionCommandPort.pause();
        if (!getWorkerController(emulator)) {
          syncStoreFromEmulator(emulator, {
            executionState: { started: false, ended: false, stopped: true },
            runtimeMetrics: { lastStopReason: 'manual-pause' },
            forceRegisterSync: true,
          });
        }
      })();
    };

    const ensureRuntimeForStep = async (): Promise<IdeRuntimeSession | null> => {
      if (emulatorRef.current) return emulatorRef.current;
      const code = getCurrentEditorCode();
      if (!code.trim()) {
        dispatch(
          setExecutionStateAction({
            lastInstruction: 'Error: No code to step through',
            exception: 'No code provided',
          })
        );
        return null;
      }
      return await initializeEmulator(code);
    };

    const handleAdvancedStep = (kind: 'over' | 'out'): void => {
      void (async () => {
        clearScheduledExecution();
        const emulator = await ensureRuntimeForStep();
        if (!emulator) return;
        await synchronizeDebuggerConfiguration();
        await setRuntimeUndoCaptureModeAsync(emulator, 'full');
        if (kind === 'over') await runtimeDebuggerCommandPort.stepOver();
        else await runtimeDebuggerCommandPort.stepOut();
        if (!getWorkerController(emulator)) {
          syncStoreFromEmulator(emulator, {
            executionState: {
              started: false,
              ended: emulator.isHalted() || Boolean(emulator.getException()),
              stopped: true,
            },
            runtimeMetrics: { lastStopReason: 'step-complete' },
            forceRegisterSync: true,
          });
        }
      })();
    };

    const handleRunToAddress = (address: number): void => {
      void (async () => {
        clearScheduledExecution();
        const emulator = await ensureRuntimeForStep();
        if (!emulator) return;
        await synchronizeDebuggerConfiguration();
        await runtimeDebuggerCommandPort.runToAddress(address, buildWorkerExecutionConfig());
        if (!getWorkerController(emulator)) {
          syncStoreFromEmulator(emulator, {
            executionState: { started: false, ended: false, stopped: true },
            runtimeMetrics: { lastStopReason: 'run-to-cursor' },
            forceRegisterSync: true,
          });
        }
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
          await runtimeExecutionCommandPort.undo();
          return;
        } else {
          await runtimeExecutionCommandPort.undo();
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
        isInitializingRuntimeRef.current = false;
        queuedRunAfterInitRef.current = false;
        const { columns, rows } = ideStore.getState().emulator.terminal;
        terminalSurfaceStore.reset(columns, rows);
        frameSyncCacheRef.current = createRuntimeFrameSyncCache();
        const runtime = emulatorRef.current;
        emulatorRef.current = null;
        dispatch(resetEmulatorState());
        dispatch(resetDebugSession());
        publishRuntimeSession(null, dispatch);
        hardwareSurfaceStore.reset();
        graphicsSurfaceStore.reset();
        soundSurfaceStore.reset();
        easy68kAudioHost.dispose();
        await disposeRuntime(runtime);
      })();
    };

    handleRunRef.current = handleRun;
    handleResetRef.current = handleReset;
    const unbindExecutionCoordinator = executionCoordinator.bind({
      run: handleRun,
      resume: handleResume,
      pulseResume: handlePulseResume,
      pause: handlePause,
      stop: handleReset,
      restart: () => {
        handleReset();
        window.setTimeout(handleRun, 0);
      },
      stepInto: handleStep,
      stepOver: () => handleAdvancedStep('over'),
      stepOut: () => handleAdvancedStep('out'),
      stepBack: handleUndo,
      reset: handleReset,
      runToAddress: handleRunToAddress,
    });

    return () => {
      unbindExecutionCoordinator();
      clearScheduledExecution();
      clearPendingRunRetry();
      runtimeEpochRef.current += 1;
      clearWorkerSubscription();
      pendingRunRetryCountRef.current = 0;
      pendingRunUntilGeometryRef.current = false;
      isInitializingRuntimeRef.current = false;
      queuedRunAfterInitRef.current = false;
      terminalSurfaceStore.reset();
      frameSyncCacheRef.current = createRuntimeFrameSyncCache();
      void disposeRuntime(emulatorRef.current);
      emulatorRef.current = null;
      publishRuntimeSession(null, dispatch);
      hardwareSurfaceStore.reset();
      graphicsSurfaceStore.reset();
      soundSurfaceStore.reset();
      easy68kAudioHost.dispose();
    };
  }, [dispatch]);

  useEffect(() => {
    const key = `${cpuModel}:${machineProfile}`;
    if (key === previousEmulationRef.current) {
      return;
    }

    previousEmulationRef.current = key;
    handleResetRef.current();
  }, [cpuModel, machineProfile]);

  useEffect(() => {
    const controller = getWorkerController(emulatorRef.current);
    if (!controller?.requestConfigureExecution) {
      return;
    }

    void runtimeExecutionCommandPort
      .configureExecution({
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
      })
      .catch((error) => {
        if (!isDisposedWorkerRuntimeError(error)) {
          console.error(error);
        }
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
      try {
        await controller.requestSnapshot();
        syncStoreFromEmulatorRef.current(emulator, { forceRegisterSync: true });
      } catch (error) {
        if (!isDisposedWorkerRuntimeError(error)) {
          console.error(error);
        }
      }
    })();
  }, [workspaceTab]);

  useEffect(() => {
    const nextGeometrySignature = `${terminalColumns}x${terminalRows}`;
    const previousGeometrySignature = lastHandledNibblesGeometrySignatureRef.current;
    lastHandledNibblesGeometrySignatureRef.current = nextGeometrySignature;

    if (pendingRunUntilGeometryRef.current && terminalGeometryVersion > 1) {
      if (pendingRunRetryTimeoutRef.current !== null) {
        window.clearTimeout(pendingRunRetryTimeoutRef.current);
        pendingRunRetryTimeoutRef.current = null;
      }
      pendingRunUntilGeometryRef.current = false;
      pendingRunRetryCountRef.current = 0;
      handleRunRef.current();
      return;
    }

    if (
      activeFileId !== NIBBLES_FILE_ID ||
      !emulatorRef.current ||
      previousGeometrySignature === nextGeometrySignature ||
      isInitializingRuntimeRef.current ||
      pendingRunUntilGeometryRef.current ||
      !ideStore.getState().emulator.executionState.started
    ) {
      return;
    }

    const runtimeMeta = emulatorRef.current.getTerminalMeta?.();
    if (runtimeMeta?.columns === terminalColumns && runtimeMeta?.rows === terminalRows) {
      return;
    }

    handleRunRef.current();
  }, [activeFileId, terminalColumns, terminalRows, terminalGeometryVersion]);
};
