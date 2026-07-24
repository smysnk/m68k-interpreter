import type { RootState } from '@/store';
import type { PanelKind } from '@/store/panelLayoutTypes';

export const selectPanelLayoutState = (state: RootState) => state.panelLayout;
export const selectActivePanelLayout = (state: RootState) => state.panelLayout.activeLayout;
export const selectPanelColumns = (state: RootState) => state.panelLayout.activeLayout.columns;
export const selectFloatingPanelIds = (state: RootState) => state.panelLayout.activeLayout.floatingPanelIds;
export const selectInteractiveTerminalPanelId = (state: RootState) => state.panelLayout.activeLayout.terminalOwnerPanelId;

export function selectVisiblePanelKinds(state: RootState): PanelKind[] {
  const document = state.panelLayout.activeLayout;
  const ids = [...document.columns.flatMap((column) => column.panelIds), ...document.floatingPanelIds];
  return [...new Set(ids.filter((id) => !document.instances[id]?.minimized).map((id) => document.instances[id]?.kind).filter((kind): kind is PanelKind => Boolean(kind)))];
}

export const selectExpandedMemoryPanelVisible = (state: RootState): boolean => selectVisiblePanelKinds(state).includes('memory');
export const selectInteractiveTerminalVisible = (state: RootState): boolean => {
  const id = selectInteractiveTerminalPanelId(state);
  return Boolean(id && !state.panelLayout.activeLayout.instances[id]?.minimized);
};

export function selectMostRecentlyFocusedPanelByKind(state: RootState, kind: PanelKind) {
  const document = state.panelLayout.activeLayout;
  const focused = document.focusedPanelId ? document.instances[document.focusedPanelId] : undefined;
  return focused?.kind === kind ? focused : Object.values(document.instances).find((panel) => panel.kind === kind);
}

export const selectPanelRuntimeSurfacePolicy = createSelector(
  [selectInteractiveTerminalVisible, selectExpandedMemoryPanelVisible, selectActivePanelLayout],
  (interactiveTerminalVisible, memorySurfaceVisible, document) => ({
    interactiveTerminalVisible,
    terminalFocusedPresentation: document.focusedPanelId === document.terminalOwnerPanelId,
    memorySurfaceVisible,
  })
);
import { createSelector } from '@reduxjs/toolkit';
