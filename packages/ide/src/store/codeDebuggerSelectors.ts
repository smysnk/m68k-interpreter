import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import {
  isActionableDebuggerStop,
  selectExecutionToolbarModel,
} from '@/store/executionControlSelectors';

export { isActionableDebuggerStop } from '@/store/executionControlSelectors';

export const selectPauseForDebuggingControlModel = createSelector(
  [selectExecutionToolbarModel, (state: RootState) => state.debugger.pauseRequestPending],
  (toolbar, pauseRequestPending) => ({
    canPause: toolbar.controls.debug.enabled,
    pauseRequestPending,
  })
);

export const selectCodeDebuggerControlModel = createSelector(
  [
    selectPauseForDebuggingControlModel,
    (state: RootState) => state.emulator.runtime.ready,
    (state: RootState) => state.debugger.snapshot,
    (state: RootState) => state.files.activeFileId,
    (state: RootState) => state.uiShell.editorCursorLine,
  ],
  (pauseControl, runtimeReady, snapshot, activeFileId, cursorLine) => {
    const stopReason = snapshot.stop?.reason;
    const controlsExpanded = isActionableDebuggerStop(stopReason);
    const runToAddress =
      controlsExpanded && snapshot.program?.fileId === activeFileId
        ? snapshot.program.sourceMap.find(
            (entry) => entry.kind === 'instruction' && entry.line === cursorLine
          )?.address
        : undefined;

    return {
      ...pauseControl,
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
