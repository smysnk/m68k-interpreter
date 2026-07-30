import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';

export const selectNavbarMenuState = createSelector(
  [
    (state: RootState) => state.uiShell.appMenuOpen,
    (state: RootState) => state.uiShell.activeSubmenu,
  ],
  (menuOpen, activeSubmenu) => ({
    menuOpen,
    activeSubmenu,
  })
);

export const selectNavbarThemeLabel = createSelector(
  [
    (state: RootState) => state.settings.followSystemTheme,
    (state: RootState) => state.settings.editorTheme,
  ],
  (followSystemTheme, editorTheme) => {
    if (followSystemTheme) {
      return 'Follow System';
    }

    return editorTheme === EditorThemeEnum.M68K_DARK ? 'Dark' : 'Light';
  }
);

export const selectNavbarViewModel = createSelector(
  [
    (state: RootState) => {
      const document = state.panelLayout.activeLayout;
      return document.focusedPanelId ? document.instances[document.focusedPanelId]?.kind ?? 'terminal' : 'terminal';
    },
    (state: RootState) => state.settings.editorTheme,
    (state: RootState) => state.settings.followSystemTheme,
    (state: RootState) => state.settings.lineNumbers,
    (state: RootState) => state.settings.terminalInputMode,
    (state: RootState) => state.emulator.speedMultiplier,
    (state: RootState) => Object.values(state.panelLayout.activeLayout.instances).some((panel) => panel.kind === 'help' && !panel.minimized),
  ],
  (
    activeWorkspaceTab,
    editorTheme,
    followSystemTheme,
    lineNumbers,
    terminalInputMode,
    speedMultiplier,
    showHelp
  ) => ({
    activeWorkspaceTab,
    editorTheme,
    followSystemTheme,
    lineNumbers,
    terminalInputMode,
    speedMultiplier,
    showHelp,
  })
);

export const selectNavbarPresentationModel = createSelector([selectNavbarViewModel], (model) => ({
  ...model,
  registersMenuActive: model.activeWorkspaceTab === 'registers',
  memoryMenuActive: model.activeWorkspaceTab === 'memory',
  hardwareMenuActive: model.activeWorkspaceTab.startsWith('hardware-'),
  helpMenuActive: model.showHelp,
  followSystemActive: model.followSystemTheme,
  lightThemeActive: !model.followSystemTheme && model.editorTheme === EditorThemeEnum.M68K_LIGHT,
  darkThemeActive: !model.followSystemTheme && model.editorTheme === EditorThemeEnum.M68K_DARK,
}));
