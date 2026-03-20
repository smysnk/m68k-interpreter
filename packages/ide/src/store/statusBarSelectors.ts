import { createSelector } from '@reduxjs/toolkit';
import { nibblesSource } from '@/programs/nibbles';
import type { RootState } from '@/store';

export type RuntimeTone = 'good' | 'warn' | 'danger' | 'neutral';

export interface StatusBarModel {
  runtime: {
    label: string;
    tone: RuntimeTone;
  };
  engineLabel: string;
  programLabel: string;
  inspectorLabel: string;
  helpLabel: string;
  terminalGeometryLabel: string;
  speedLabel: string;
  delayLabel: string;
  viewLabel: string;
  locationLabel: string;
  frameLabel: string;
  stopLabel: string;
}

export const selectWorkspaceTab = (state: RootState) => state.uiShell.workspaceTab;
export const selectContextOpen = (state: RootState) =>
  state.uiShell.contextOpen && state.uiShell.contextView === 'help';
export const selectActiveInspectorPane = createSelector(
  [(state: RootState) => state.emulator.showFlags, (state: RootState) => state.uiShell.inspectorView],
  (showFlags, inspectorView) => (showFlags ? 'flags' : inspectorView)
);

export const selectStatusBarModel = createSelector(
  [
    (state: RootState) => state.settings.engineMode,
    (state: RootState) => state.emulator.editorCode,
    (state: RootState) => state.emulator.executionState,
    (state: RootState) => state.emulator.delay,
    (state: RootState) => state.emulator.speedMultiplier,
    (state: RootState) => state.emulator.runtimeMetrics,
    (state: RootState) => state.emulator.terminal,
    (state: RootState) => state.uiShell.editorCursorLine,
    (state: RootState) => state.uiShell.editorCursorColumn,
    selectWorkspaceTab,
    selectContextOpen,
    selectActiveInspectorPane,
  ],
  (
    engineMode,
    editorCode,
    executionState,
    delay,
    speedMultiplier,
    runtimeMetrics,
    terminal,
    editorCursorLine,
    editorCursorColumn,
    workspaceTab,
    contextOpen,
    activeInspectorPane
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

    const programLabel =
      editorCode === nibblesSource ? 'Nibbles' : editorCode.trim().length > 0 ? 'Custom source' : 'Empty buffer';
    const locationLabel =
      workspaceTab === 'code'
        ? `Ln ${editorCursorLine}, Col ${editorCursorColumn}`
        : `Cursor ${terminal.cursorRow + 1}:${terminal.cursorColumn + 1}`;

    return {
      runtime,
      engineLabel: engineMode === 'interpreter-redux' ? 'Interpreter Redux' : 'Interpreter',
      programLabel,
      inspectorLabel: activeInspectorPane,
      helpLabel: contextOpen ? 'Open' : 'Closed',
      terminalGeometryLabel: `${terminal.columns}x${terminal.rows}`,
      speedLabel: `${speedMultiplier}x`,
      delayLabel: `${delay}s`,
      viewLabel: workspaceTab === 'code' ? 'Code' : 'Terminal',
      locationLabel,
      frameLabel: `${runtimeMetrics.lastFrameInstructions} instr / ${runtimeMetrics.lastFrameDurationMs.toFixed(1)} ms`,
      stopLabel: runtimeMetrics.lastStopReason,
    };
  }
);
