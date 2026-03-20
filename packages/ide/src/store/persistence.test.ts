import { beforeEach, describe, expect, it } from 'vitest';
import { createIdeStore, setEditorTheme, setRootHorizontalWithContextLayout, setWorkspaceTab, toggleContextView } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { IDE_PERSISTENCE_KEY, clearPersistedIdeState, readPersistedIdeState } from '@/store/persistence';

describe('store persistence', () => {
  beforeEach(() => {
    clearPersistedIdeState();
  });

  it('writes shell and preference state to localStorage', () => {
    const store = createIdeStore();

    store.dispatch(setEditorTheme(EditorThemeEnum.M68K_DARK));
    store.dispatch(setWorkspaceTab('code'));
    store.dispatch(toggleContextView('help'));
    store.dispatch(setRootHorizontalWithContextLayout([44, 36, 20]));

    const persisted = readPersistedIdeState();

    expect(persisted?.settings?.editorTheme).toBe(EditorThemeEnum.M68K_DARK);
    expect(persisted?.uiShell?.workspaceTab).toBe('code');
    expect(persisted?.uiShell?.contextOpen).toBe(true);
    expect(persisted?.uiShell?.layout.rootHorizontalWithContext).toEqual([44, 36, 20]);
  });

  it('hydrates a new store from localStorage', () => {
    window.localStorage.setItem(
      IDE_PERSISTENCE_KEY,
      JSON.stringify({
        settings: {
          editorTheme: EditorThemeEnum.M68K_DARK,
          followSystemTheme: false,
          lineNumbers: true,
          engineMode: 'interpreter',
        },
        uiShell: {
          workspaceTab: 'code',
          inspectorView: 'memory',
          contextView: 'help',
          contextOpen: true,
          layout: {
            rootHorizontal: [58, 42],
            rootHorizontalWithContext: [48, 32, 20],
            inspectorVertical: [46, 54],
          },
        },
      })
    );

    const store = createIdeStore();

    expect(store.getState().settings.editorTheme).toBe(EditorThemeEnum.M68K_DARK);
    expect(store.getState().uiShell.workspaceTab).toBe('code');
    expect(store.getState().uiShell.contextOpen).toBe(true);
    expect(store.getState().uiShell.layout.rootHorizontalWithContext).toEqual([48, 32, 20]);
  });
});
