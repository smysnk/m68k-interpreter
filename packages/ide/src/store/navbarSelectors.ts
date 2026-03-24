import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { selectActiveInspectorPane, selectShowHelp } from '@/store/appShellSelectors';

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
    (state: RootState) => state.uiShell.workspaceTab,
    selectActiveInspectorPane,
    (state: RootState) => state.settings.editorTheme,
    (state: RootState) => state.settings.followSystemTheme,
    (state: RootState) => state.settings.lineNumbers,
    (state: RootState) => state.emulator.speedMultiplier,
    selectShowHelp,
  ],
  (
    activeWorkspaceTab,
    activeInspectorPane,
    editorTheme,
    followSystemTheme,
    lineNumbers,
    speedMultiplier,
    showHelp
  ) => ({
    activeWorkspaceTab,
    activeInspectorPane,
    editorTheme,
    followSystemTheme,
    lineNumbers,
    speedMultiplier,
    showHelp,
  })
);

export const selectNavbarPresentationModel = createSelector([selectNavbarViewModel], (model) => ({
  ...model,
  registersMenuActive: model.activeInspectorPane === 'registers',
  memoryMenuActive: model.activeInspectorPane === 'memory',
  flagsMenuActive: model.activeInspectorPane === 'flags',
  helpMenuActive: model.showHelp,
  followSystemActive: model.followSystemTheme,
  lightThemeActive: !model.followSystemTheme && model.editorTheme === EditorThemeEnum.M68K_LIGHT,
  darkThemeActive: !model.followSystemTheme && model.editorTheme === EditorThemeEnum.M68K_DARK,
}));
