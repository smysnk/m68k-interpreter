import { createSelector } from '@reduxjs/toolkit';
import { selectActiveFileName } from '@/store/filesSlice';
import type { RootState } from '@/store';

export type RuntimeTone = 'good' | 'warn' | 'danger' | 'neutral';

export interface StatusBarModel {
  runtime: {
    label: string;
    tone: RuntimeTone;
  };
  engineLabel: string;
  programLabel: string;
  locationLabel: string;
  frameLabel: string;
  stopLabel: string;
}

export const selectWorkspaceTab = (state: RootState) => state.uiShell.workspaceTab;
export const selectActiveInspectorPane = createSelector(
  [(state: RootState) => state.uiShell.inspectorView],
  (inspectorView) => inspectorView
);

const humanizeStatusToken = (value: string): string => value.replace(/_/g, ' ');

export const selectStatusBarModel = createSelector(
  [
    (state: RootState) => state.settings.engineMode,
    selectActiveFileName,
    (state: RootState) => state.emulator.executionState,
    (state: RootState) => state.emulator.runtimeMetrics,
    (state: RootState) => state.emulator.terminal,
    (state: RootState) => state.uiShell.editorCursorLine,
    (state: RootState) => state.uiShell.editorCursorColumn,
    selectWorkspaceTab,
  ],
  (
    engineMode,
    activeFileName,
    executionState,
    runtimeMetrics,
    terminal,
    editorCursorLine,
    editorCursorColumn,
    workspaceTab
  ): StatusBarModel => {
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

    const locationLabel =
      workspaceTab === 'code'
        ? `Ln ${editorCursorLine}, Col ${editorCursorColumn}`
        : `Cursor ${terminal.cursorRow + 1}:${terminal.cursorColumn + 1}`;

    return {
      runtime,
      engineLabel: engineMode === 'interpreter-redux' ? 'Interpreter Redux' : 'Interpreter',
      programLabel: activeFileName,
      locationLabel,
      frameLabel: `${runtimeMetrics.lastFrameInstructions} instr / ${runtimeMetrics.lastFrameDurationMs.toFixed(1)} ms`,
      stopLabel: humanizeStatusToken(runtimeMetrics.lastStopReason),
    };
  }
);
