import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';

export const selectCodeDebuggerControlModel = createSelector(
  [
    (state: RootState) => state.emulator.runtime.ready,
    (state: RootState) => state.debugger.snapshot,
    (state: RootState) => state.files.activeFileId,
    (state: RootState) => state.uiShell.editorCursorLine,
  ],
  (runtimeReady, snapshot, activeFileId, cursorLine) => {
    const runToAddress =
      snapshot.program?.fileId === activeFileId
        ? snapshot.program.sourceMap.find(
            (entry) => entry.kind === 'instruction' && entry.line === cursorLine
          )?.address
        : undefined;

    return {
      canStepBackward: runtimeReady,
      canStepOut: runtimeReady && snapshot.callStack.length > 0,
      runToAddress,
    };
  }
);
