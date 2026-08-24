import { createSelector } from '@reduxjs/toolkit';
import type { DebugStopReason } from '@m68k/interpreter';
import type { RootState } from '@/store';

const ACTIONABLE_DEBUG_STOPS = new Set<DebugStopReason>([
  'breakpoint',
  'watchpoint',
  'manual-pause',
  'step-complete',
  'run-to-cursor',
  'exception',
  'interrupt',
]);

export const selectCodeDebuggerControlModel = createSelector(
  [
    (state: RootState) => state.emulator.runtime.ready,
    (state: RootState) => state.emulator.executionState,
    (state: RootState) => state.debugger.snapshot,
    (state: RootState) => state.files.activeFileId,
    (state: RootState) => state.uiShell.editorCursorLine,
  ],
  (runtimeReady, executionState, snapshot, activeFileId, cursorLine) => {
    const stopReason = snapshot.stop?.reason;
    const controlsExpanded = stopReason !== undefined && ACTIONABLE_DEBUG_STOPS.has(stopReason);
    const runToAddress =
      controlsExpanded && snapshot.program?.fileId === activeFileId
        ? snapshot.program.sourceMap.find(
            (entry) => entry.kind === 'instruction' && entry.line === cursorLine
          )?.address
        : undefined;

    return {
      canPause:
        runtimeReady &&
        executionState.started &&
        !executionState.ended &&
        !executionState.stopped &&
        snapshot.status === 'running' &&
        snapshot.stop === undefined,
      controlsExpanded,
      stopReason,
      currentSourceLocation: snapshot.stop?.source,
      canStepOver: runtimeReady && controlsExpanded,
      canStepInto: runtimeReady && controlsExpanded,
      canStepOut: runtimeReady && controlsExpanded && snapshot.callStack.length > 0,
      runToAddress,
    };
  }
);
