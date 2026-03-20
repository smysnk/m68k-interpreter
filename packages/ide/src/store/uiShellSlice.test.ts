import { describe, expect, it } from 'vitest';
import {
  resetSettingsState,
  setWorkspaceTab,
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
    expect(state.editorCursorLine).toBe(1);
    expect(state.editorCursorColumn).toBe(1);
    expect(state.layout.rootHorizontalWithContext).toEqual([50, 32, 18]);
  });

  it('tracks workspace, inspector, and context state in Redux', () => {
    let state = uiShellReducer(undefined, setWorkspaceTab('code'));
    state = uiShellReducer(state, toggleInspectorView());
    state = uiShellReducer(state, toggleContextView('help'));

    expect(state.workspaceTab).toBe('code');
    expect(state.inspectorView).toBe('memory');
    expect(state.contextOpen).toBe(true);
    expect(state.contextView).toBe('help');
  });

  it('resets shell state when settings are reset', () => {
    const startingState: UiShellState = {
      workspaceTab: 'code',
      inspectorView: 'memory',
      contextOpen: true,
      contextView: 'help',
      editorCursorLine: 9,
      editorCursorColumn: 14,
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
    expect(state.editorCursorLine).toBe(1);
    expect(state.editorCursorColumn).toBe(1);
  });
});
