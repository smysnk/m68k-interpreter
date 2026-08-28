import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { selectRuntimePhaseModel } from '@/store/executionControlSelectors';

export type RuntimeTone = 'good' | 'warn' | 'danger' | 'neutral';

export interface StatusBarModel {
  runtime: {
    label: string;
    tone: RuntimeTone;
  };
}

export const selectWorkspaceTab = (state: RootState) => state.uiShell.workspaceTab;
export const selectActiveInspectorPane = createSelector(
  [(state: RootState) => state.uiShell.inspectorView],
  (inspectorView) => inspectorView
);

export const selectStatusBarModel = createSelector(
  [selectRuntimePhaseModel, (state: RootState) => state.debugger.snapshot],
  (phaseModel, debuggerSnapshot): StatusBarModel => {
    const debugStop = debuggerSnapshot.stop;
    const debugLocation = debugStop
      ? ` · $${debugStop.pc.toString(16).toUpperCase().padStart(8, '0')}${
          debugStop.source ? ` · L${debugStop.source.line}` : ''
        }`
      : '';
    const runtime =
      phaseModel.phase === 'source-stale'
        ? {
            label:
              phaseModel.underlyingPhase === 'running'
                ? 'Source changed · old build running'
                : 'Source changed',
            tone: 'warn' as const,
          }
        : phaseModel.phase === 'starting'
          ? { label: 'Starting', tone: 'neutral' as const }
          : phaseModel.phase === 'pause-requested'
            ? { label: 'Pausing', tone: 'warn' as const }
            : phaseModel.phase === 'stopping'
              ? { label: 'Stopping', tone: 'neutral' as const }
              : phaseModel.phase === 'restarting'
                ? { label: 'Restarting', tone: 'neutral' as const }
                : debugStop?.reason === 'breakpoint'
                  ? { label: `Breakpoint${debugLocation}`, tone: 'warn' as const }
                  : debugStop?.reason === 'watchpoint'
                    ? { label: `Watchpoint${debugLocation}`, tone: 'warn' as const }
                    : phaseModel.phase === 'paused'
                      ? { label: `Paused${debugLocation}`, tone: 'warn' as const }
                      : phaseModel.phase === 'exception'
                        ? { label: 'Exception', tone: 'danger' as const }
                        : phaseModel.phase === 'waiting'
                          ? { label: 'Waiting', tone: 'warn' as const }
                          : phaseModel.phase === 'halted'
                            ? { label: 'Halted', tone: 'neutral' as const }
                            : phaseModel.phase === 'running'
                              ? { label: 'Running', tone: 'good' as const }
                              : { label: 'Ready', tone: 'neutral' as const };

    return {
      runtime,
    };
  }
);
