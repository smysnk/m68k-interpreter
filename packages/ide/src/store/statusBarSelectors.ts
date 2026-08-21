import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';

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
  [
    (state: RootState) => state.emulator.executionState,
    (state: RootState) => state.debugger.snapshot,
  ],
  (executionState, debuggerSnapshot): StatusBarModel => {
    const debugStop = debuggerSnapshot.stop;
    const debugLocation = debugStop
      ? ` · $${debugStop.pc.toString(16).toUpperCase().padStart(8, '0')}${
          debugStop.source ? ` · L${debugStop.source.line}` : ''
        }`
      : '';
    const runtime =
      debugStop?.reason === 'breakpoint'
        ? { label: `Breakpoint${debugLocation}`, tone: 'warn' as const }
        : debugStop?.reason === 'watchpoint'
          ? { label: `Watchpoint${debugLocation}`, tone: 'warn' as const }
          : debugStop?.reason === 'manual-pause' || debugStop?.reason === 'step-complete' || debugStop?.reason === 'run-to-cursor'
            ? { label: `Paused${debugLocation}`, tone: 'warn' as const }
      : executionState.exception !== null
        ? { label: 'Exception', tone: 'danger' as const }
        : executionState.stopped && !executionState.ended
          ? { label: 'Waiting', tone: 'warn' as const }
          : executionState.ended
            ? { label: 'Halted', tone: 'neutral' as const }
            : executionState.started
            ? { label: 'Running', tone: 'good' as const }
              : { label: 'Ready', tone: 'neutral' as const };

    return {
      runtime,
    };
  }
);
