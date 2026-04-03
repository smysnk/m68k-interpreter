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
  ],
  (executionState): StatusBarModel => {
    const runtime =
      executionState.exception !== null
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
