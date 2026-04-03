import { beforeEach, describe, expect, it } from 'vitest';
import {
  createIdeStore,
  NIBBLES_FILE_ID,
  setActiveFile,
  setEditorCode,
  setEditorTheme,
  setRegisterEditRadix,
  setRootHorizontalWithContextLayout,
  setWorkspaceTab,
  toggleContextView,
} from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { IDE_PERSISTENCE_KEY, clearPersistedIdeState, readPersistedIdeState } from '@/store/persistence';

describe('store persistence', () => {
  beforeEach(() => {
    clearPersistedIdeState();
  });

  it('writes shell and preference state to localStorage', () => {
    const store = createIdeStore();

    store.dispatch(setEditorTheme(EditorThemeEnum.M68K_DARK));
    store.dispatch(setRegisterEditRadix('bin'));
    store.dispatch(setActiveFile('workspace:scratch.asm'));
    store.dispatch(setEditorCode('MOVE.L #3,D0'));
    store.dispatch(setWorkspaceTab('code'));
    store.dispatch(toggleContextView('help'));
    store.dispatch(setRootHorizontalWithContextLayout([44, 36, 20]));

    const persisted = readPersistedIdeState();

    expect(persisted?.settings?.editorTheme).toBe(EditorThemeEnum.M68K_DARK);
    expect(persisted?.settings?.registerEditRadix).toBe('bin');
    expect(persisted?.files?.activeFileId).toBe('workspace:scratch.asm');
    expect(persisted?.files?.items.find((item) => item.id === 'workspace:scratch.asm')?.content).toBe('MOVE.L #3,D0');
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
          registerEditRadix: 'dec',
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
        files: {
          activeFileId: 'workspace:scratch.asm',
          items: [
            {
              id: 'workspace:scratch.asm',
              name: 'scratch.asm',
              path: 'workspace/scratch.asm',
              kind: 'workspace',
              content: 'MOVE.L #7,D0',
            },
          ],
        },
      })
    );

    const store = createIdeStore();

    expect(store.getState().settings.editorTheme).toBe(EditorThemeEnum.M68K_DARK);
    expect(store.getState().settings.registerEditRadix).toBe('dec');
    expect(store.getState().uiShell.workspaceTab).toBe('code');
    expect(store.getState().uiShell.contextOpen).toBe(true);
    expect(store.getState().uiShell.layout.rootHorizontalWithContext).toEqual([48, 32, 20]);
    expect(store.getState().files.activeFileId).toBe(NIBBLES_FILE_ID);
    expect(store.getState().files.items.find((item) => item.id === 'workspace:scratch.asm')?.content).toBe(
      'MOVE.L #7,D0'
    );
    expect(store.getState().emulator.editorCode).not.toBe('MOVE.L #7,D0');
  });
});
