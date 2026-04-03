import { describe, expect, it } from 'vitest';
import {
  closeAppMenu,
  resetSettingsState,
  setActiveSubmenu,
  setChromeOffsets,
  setWorkspaceTab,
  toggleAppMenu,
  toggleContextView,
  toggleInspectorView,
} from '@/store';
import uiShellReducer, { type UiShellState } from '@/store/uiShellSlice';

describe('uiShellSlice', () => {
  it('defaults to the terminal workspace and registers inspector', () => {
    const state = uiShellReducer(undefined, { type: 'unknown' });

    expect(state.workspaceTab).toBe('terminal');
    expect(state.inspectorView).toBe('registers');
    expect(state.contextOpen).toBe(false);
    expect(state.contextView).toBe('none');
    expect(state.appMenuOpen).toBe(false);
    expect(state.activeSubmenu).toBeNull();
    expect(state.editorCursorLine).toBe(1);
    expect(state.editorCursorColumn).toBe(1);
    expect(state.chromeOffsets).toEqual({ top: 58, bottom: 38 });
    expect(state.layout.rootHorizontalWithContext).toEqual([50, 32, 18]);
  });

  it('tracks workspace, inspector, and context state in Redux', () => {
    let state = uiShellReducer(undefined, setWorkspaceTab('memory'));
    state = uiShellReducer(state, toggleInspectorView());
    state = uiShellReducer(state, toggleContextView('help'));
    state = uiShellReducer(state, toggleAppMenu());
    state = uiShellReducer(state, setActiveSubmenu('style'));
    state = uiShellReducer(state, setChromeOffsets({ top: 64, bottom: 40 }));

    expect(state.workspaceTab).toBe('memory');
    expect(state.inspectorView).toBe('memory');
    expect(state.contextOpen).toBe(true);
    expect(state.contextView).toBe('help');
    expect(state.appMenuOpen).toBe(true);
    expect(state.activeSubmenu).toBe('style');
    expect(state.chromeOffsets).toEqual({ top: 64, bottom: 40 });
  });

  it('clears submenu state when the app menu closes', () => {
    let state = uiShellReducer(undefined, toggleAppMenu());
    state = uiShellReducer(state, setActiveSubmenu('style'));
    state = uiShellReducer(state, closeAppMenu());

    expect(state.appMenuOpen).toBe(false);
    expect(state.activeSubmenu).toBeNull();
  });

  it('resets shell state when settings are reset', () => {
    const startingState: UiShellState = {
      workspaceTab: 'code',
      inspectorView: 'memory',
      contextOpen: true,
      contextView: 'help',
      appMenuOpen: true,
      activeSubmenu: 'style',
      editorCursorLine: 9,
      editorCursorColumn: 14,
      chromeOffsets: {
        top: 70,
        bottom: 44,
      },
      layout: {
        rootHorizontal: [55, 45],
        rootHorizontalWithContext: [45, 35, 20],
        inspectorVertical: [40, 60],
      },
    };

    const state = uiShellReducer(startingState, resetSettingsState());

    expect(state.workspaceTab).toBe('terminal');
    expect(state.inspectorView).toBe('registers');
    expect(state.contextOpen).toBe(false);
    expect(state.contextView).toBe('none');
    expect(state.appMenuOpen).toBe(false);
    expect(state.activeSubmenu).toBeNull();
    expect(state.editorCursorLine).toBe(1);
    expect(state.editorCursorColumn).toBe(1);
    expect(state.chromeOffsets).toEqual({ top: 58, bottom: 38 });
  });
});
