import { beforeEach, describe, expect, it } from 'vitest';
import { createIdeStore, setContextView, setInspectorView, setWorkspaceTab } from '@/store';
import {
  selectAppShellModel,
  selectInspectorPanelModel,
  selectRootPanelLayoutModel,
  selectWorkspacePanelModel,
} from '@/store/appShellSelectors';

describe('appShellSelectors', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('builds the app shell model from store state', () => {
    const store = createIdeStore();
    store.dispatch(setWorkspaceTab('terminal'));
    store.dispatch(setInspectorView('memory'));
    store.dispatch(setContextView('help'));

    const model = selectAppShellModel(store.getState());

    expect(model.workspaceTab).toBe('terminal');
    expect(model.activeInspectorPane).toBe('memory');
    expect(model.showHelp).toBe(true);
    expect(model.rootHorizontalLayout).toEqual([61, 39]);
    expect(model.rootHorizontalWithContextLayout).toEqual([50, 32, 18]);
  });

  it('builds the root panel layout model without inline shell branching', () => {
    const store = createIdeStore();

    expect(selectRootPanelLayoutModel(store.getState())).toMatchObject({
      shellKey: 'main-shell-default',
      hasContextPanel: false,
      workspaceDefaultSize: 61,
      inspectorDefaultSize: 39,
      contextDefaultSize: null,
    });

    store.dispatch(setContextView('help'));

    expect(selectRootPanelLayoutModel(store.getState())).toMatchObject({
      shellKey: 'main-shell-with-context',
      hasContextPanel: true,
      workspaceDefaultSize: 50,
      inspectorDefaultSize: 32,
      contextDefaultSize: 18,
    });
  });

  it('builds the workspace panel model', () => {
    const store = createIdeStore();
    store.dispatch(setWorkspaceTab('code'));

    expect(selectWorkspacePanelModel(store.getState())).toEqual({
      activeWorkspaceTab: 'code',
      terminalActive: false,
      codeActive: true,
      registersActive: false,
      memoryActive: false,
    });
  });

  it('builds the inspector panel model', () => {
    const store = createIdeStore();

    store.dispatch(setInspectorView('memory'));
    expect(selectInspectorPanelModel(store.getState())).toMatchObject({
      activeInspectorPane: 'memory',
      showRegisters: false,
      showMemory: true,
      activePanelComponent: 'memory',
    });
  });
});
