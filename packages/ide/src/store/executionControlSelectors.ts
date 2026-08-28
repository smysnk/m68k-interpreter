import { createSelector } from '@reduxjs/toolkit';
import type { DebugStopReason } from '@m68k/interpreter';
import type { ExecutionCommand } from '@/runtime/executionCoordinator';
import { getActiveFile } from '@/store/filesSlice';
import type { RootState } from '@/store';

export type RuntimePhase =
  | 'empty'
  | 'ready'
  | 'starting'
  | 'running'
  | 'pause-requested'
  | 'paused'
  | 'waiting'
  | 'source-stale'
  | 'halted'
  | 'exception'
  | 'stopping'
  | 'restarting';

export type SettledRuntimePhase = Exclude<
  RuntimePhase,
  'starting' | 'pause-requested' | 'stopping' | 'restarting' | 'source-stale'
>;

export type ExecutionStateTone = 'neutral' | 'running' | 'paused' | 'waiting' | 'danger';
export type ExecutionToolbarCommand = Extract<
  ExecutionCommand,
  'run' | 'resume' | 'pause' | 'stop' | 'restart'
>;

export interface RuntimePhaseModel {
  phase: RuntimePhase;
  underlyingPhase: SettledRuntimePhase;
  hasRuntime: boolean;
  runnableSource: boolean;
  sourceStale: boolean;
}

export interface ExecutionToolbarControl {
  command: ExecutionToolbarCommand;
  enabled: boolean;
  label: string;
  title: string;
  current: boolean;
  busy: boolean;
}

export interface ExecutionToolbarModel {
  phase: RuntimePhase;
  stateLabel: string;
  stateTone: ExecutionStateTone;
  sourceStale: boolean;
  controls: {
    run: ExecutionToolbarControl;
    debug: ExecutionToolbarControl;
    stop: ExecutionToolbarControl;
    restart: ExecutionToolbarControl;
  };
}

const ACTIONABLE_DEBUG_STOPS = new Set<DebugStopReason>([
  'breakpoint',
  'watchpoint',
  'manual-pause',
  'step-complete',
  'run-to-cursor',
  'exception',
  'interrupt',
]);

export function isActionableDebuggerStop(reason: DebugStopReason | undefined): boolean {
  return reason !== undefined && ACTIONABLE_DEBUG_STOPS.has(reason);
}

function deriveSettledPhase(
  runtimeReady: boolean,
  started: boolean,
  ended: boolean,
  stopped: boolean,
  exception: string | null,
  debuggerStatus: RootState['debugger']['snapshot']['status'],
  stopReason: DebugStopReason | undefined,
  runnableSource: boolean
): SettledRuntimePhase {
  if (exception !== null || debuggerStatus === 'faulted') return 'exception';
  if (stopReason === 'waiting-for-input' || debuggerStatus === 'waiting') return 'waiting';
  if (isActionableDebuggerStop(stopReason)) return 'paused';
  if (
    stopReason === 'halted' ||
    stopReason === 'completed' ||
    debuggerStatus === 'halted' ||
    ended
  ) {
    return 'halted';
  }
  if (runtimeReady && (debuggerStatus === 'running' || (started && !stopped))) return 'running';
  return runnableSource ? 'ready' : 'empty';
}

export const selectRuntimePhaseModel = createSelector(
  [
    (state: RootState) => state.emulator.runtime,
    (state: RootState) => state.emulator.runtimeCommandPending,
    (state: RootState) => state.emulator.executionState,
    (state: RootState) => state.debugger.snapshot,
    (state: RootState) => state.debugger.sourceStale,
    (state: RootState) => state.debugger.pauseRequestPending,
    (state: RootState) => getActiveFile(state.files).content,
  ],
  (
    runtime,
    runtimeCommandPending,
    executionState,
    debuggerSnapshot,
    sourceStale,
    pauseRequestPending,
    activeSource
  ): RuntimePhaseModel => {
    const runnableSource = activeSource.trim().length > 0;
    const underlyingPhase = deriveSettledPhase(
      runtime.ready,
      executionState.started,
      executionState.ended,
      executionState.stopped,
      executionState.exception,
      debuggerSnapshot.status,
      debuggerSnapshot.stop?.reason,
      runnableSource
    );
    const hasRuntime =
      runtime.ready ||
      executionState.started ||
      executionState.ended ||
      debuggerSnapshot.status !== 'idle';

    let phase: RuntimePhase = underlyingPhase;
    if (runtimeCommandPending === 'start') phase = 'starting';
    else if (runtimeCommandPending === 'stop') phase = 'stopping';
    else if (runtimeCommandPending === 'restart') phase = 'restarting';
    else if (pauseRequestPending) phase = 'pause-requested';
    else if (sourceStale && hasRuntime) phase = 'source-stale';

    return {
      phase,
      underlyingPhase,
      hasRuntime,
      runnableSource,
      sourceStale,
    };
  }
);

function control(
  command: ExecutionToolbarCommand,
  enabled: boolean,
  label: string,
  title: string,
  options: { busy?: boolean; current?: boolean } = {}
): ExecutionToolbarControl {
  return {
    command,
    enabled,
    label,
    title,
    current: options.current ?? false,
    busy: options.busy ?? false,
  };
}

export const selectExecutionToolbarModel = createSelector(
  [selectRuntimePhaseModel],
  (runtime): ExecutionToolbarModel => {
    const { phase, underlyingPhase, hasRuntime, runnableSource, sourceStale } = runtime;
    const lifecyclePending = ['starting', 'stopping', 'restarting'].includes(phase);
    const canStop =
      hasRuntime &&
      ['running', 'pause-requested', 'paused', 'waiting', 'source-stale'].includes(phase);
    const canRestart = hasRuntime && runnableSource && !lifecyclePending;
    const canPause = phase === 'running';

    let run = control('run', false, 'Start program', 'Enter source code before starting');
    if (phase === 'ready') {
      run = control('run', runnableSource, 'Start program', 'Start program (F5)');
    } else if (phase === 'paused') {
      run = control(
        'resume',
        true,
        'Continue program',
        'Continue from the current instruction (F5)'
      );
    } else if (phase === 'source-stale') {
      run = control(
        'run',
        runnableSource,
        'Run updated source',
        runnableSource ? 'Run the updated source (F5)' : 'Enter source code before starting'
      );
    } else if (phase === 'halted' || phase === 'exception') {
      run = control(
        'run',
        runnableSource,
        'Start program again',
        runnableSource ? 'Start program again (F5)' : 'Enter source code before starting'
      );
    } else if (phase === 'running') {
      run = control('resume', false, 'Program running', 'Program is already running');
    } else if (phase === 'starting') {
      run = control('run', false, 'Starting program', 'Starting program', {
        busy: true,
        current: true,
      });
    } else if (phase === 'pause-requested') {
      run = control(
        'resume',
        false,
        'Pause requested',
        'Waiting to pause at an instruction boundary'
      );
    } else if (phase === 'waiting') {
      run = control('resume', false, 'Program waiting for input', 'Waiting for terminal input');
    } else if (phase === 'stopping') {
      run = control('run', false, 'Run unavailable while stopping', 'Stopping program');
    } else if (phase === 'restarting') {
      run = control('run', false, 'Run unavailable while restarting', 'Restarting program');
    }

    const debug = control(
      'pause',
      canPause,
      phase === 'paused' ? 'Debugger paused' : 'Pause for debugging',
      canPause
        ? 'Pause for debugging (F6)'
        : phase === 'pause-requested'
          ? 'Pausing at the next instruction boundary'
          : phase === 'paused'
            ? 'Debugger is paused'
            : phase === 'waiting'
              ? 'Waiting for terminal input'
              : 'Start a running program before pausing for debugging',
      {
        busy: phase === 'pause-requested',
        current: phase === 'pause-requested' || phase === 'paused',
      }
    );
    const stop = control(
      'stop',
      canStop,
      phase === 'stopping' ? 'Stopping program' : 'Stop program',
      canStop
        ? 'Stop program (Shift+F5)'
        : phase === 'stopping'
          ? 'Stopping program'
          : 'No active program to stop',
      { busy: phase === 'stopping', current: phase === 'stopping' }
    );
    const restart = control(
      'restart',
      canRestart,
      phase === 'restarting' ? 'Restarting program' : 'Restart program',
      canRestart
        ? 'Restart program'
        : phase === 'restarting'
          ? 'Restarting program'
          : !runnableSource
            ? 'Enter source code before restarting'
            : 'Start a program before restarting',
      { busy: phase === 'restarting', current: phase === 'restarting' }
    );

    const state =
      phase === 'empty'
        ? { stateLabel: 'EMPTY', stateTone: 'neutral' as const }
        : phase === 'ready'
          ? { stateLabel: 'READY', stateTone: 'neutral' as const }
          : phase === 'starting'
            ? { stateLabel: 'STARTING', stateTone: 'running' as const }
            : phase === 'running'
              ? { stateLabel: 'RUNNING', stateTone: 'running' as const }
              : phase === 'pause-requested'
                ? { stateLabel: 'PAUSING', stateTone: 'paused' as const }
                : phase === 'paused'
                  ? { stateLabel: 'PAUSED', stateTone: 'paused' as const }
                  : phase === 'waiting'
                    ? { stateLabel: 'WAITING', stateTone: 'waiting' as const }
                    : phase === 'source-stale'
                      ? {
                          stateLabel:
                            underlyingPhase === 'running'
                              ? 'SOURCE CHANGED · OLD BUILD RUNNING'
                              : 'SOURCE CHANGED',
                          stateTone: 'waiting' as const,
                        }
                      : phase === 'halted'
                        ? { stateLabel: 'HALTED', stateTone: 'neutral' as const }
                        : phase === 'exception'
                          ? { stateLabel: 'ERROR', stateTone: 'danger' as const }
                          : phase === 'stopping'
                            ? { stateLabel: 'STOPPING', stateTone: 'neutral' as const }
                            : { stateLabel: 'RESTARTING', stateTone: 'running' as const };

    return {
      phase,
      ...state,
      sourceStale,
      controls: { run, debug, stop, restart },
    };
  }
);

export function isExecutionToolbarCommandEnabled(
  model: ExecutionToolbarModel,
  command: ExecutionToolbarCommand
): boolean {
  return Object.values(model.controls).some((item) => item.command === command && item.enabled);
}
