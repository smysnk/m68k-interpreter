import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import type { InspectorView } from '@/store/uiShellSlice';

export type ActiveInspectorPane = InspectorView;
export type WorkspaceTabPanel = 'terminal' | 'code' | 'registers' | 'memory';
export type InspectorPanelKind = 'registers' | 'memory';

export const selectShowHelp = (state: RootState) =>
  state.uiShell.contextOpen && state.uiShell.contextView === 'help';

export const selectActiveInspectorPane = (state: RootState): ActiveInspectorPane =>
  state.uiShell.inspectorView;

export const selectAppShellModel = createSelector(
  [
    (state: RootState) => state.uiShell.workspaceTab,
    selectActiveInspectorPane,
    selectShowHelp,
    (state: RootState) => state.uiShell.layout.rootHorizontal,
    (state: RootState) => state.uiShell.layout.rootHorizontalWithContext,
    (state: RootState) => state.uiShell.chromeOffsets,
  ],
  (
    workspaceTab,
    activeInspectorPane,
    showHelp,
    rootHorizontalLayout,
    rootHorizontalWithContextLayout,
    chromeOffsets
  ) => ({
    workspaceTab,
    activeInspectorPane,
    showHelp,
    rootHorizontalLayout,
    rootHorizontalWithContextLayout,
    chromeOffsets,
  })
);

export const selectRootPanelLayoutModel = createSelector([selectAppShellModel], (model) => {
  const layout = model.showHelp ? model.rootHorizontalWithContextLayout : model.rootHorizontalLayout;

  return {
    shellKey: model.showHelp ? 'main-shell-with-context' : 'main-shell-default',
    hasContextPanel: model.showHelp,
    workspaceDefaultSize: layout[0],
    inspectorDefaultSize: layout[1],
    contextDefaultSize: model.showHelp ? model.rootHorizontalWithContextLayout[2] : null,
  };
});

export const selectWorkspacePanelModel = createSelector(
  [(state: RootState) => state.uiShell.workspaceTab],
  (workspaceTab) => ({
    activeWorkspaceTab: workspaceTab,
    terminalActive: workspaceTab === 'terminal',
    codeActive: workspaceTab === 'code',
    registersActive: workspaceTab === 'registers',
    memoryActive: workspaceTab === 'memory',
  })
);

export const selectInspectorPanelModel = createSelector([selectActiveInspectorPane], (activeInspectorPane) => ({
  activeInspectorPane,
  showRegisters: activeInspectorPane === 'registers',
  showMemory: activeInspectorPane === 'memory',
  activePanelComponent: activeInspectorPane as InspectorPanelKind,
}));
