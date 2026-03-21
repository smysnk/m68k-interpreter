import { describe, expect, it } from 'vitest';
import {
  createIdeStore,
  setActiveFile,
  setEditorCode,
  setEditorCursorPosition,
  setRuntimeMetrics,
  setWorkspaceTab,
} from '@/store';
import { selectActiveInspectorPane, selectStatusBarModel } from '@/store/statusBarSelectors';

describe('statusBarSelectors', () => {
  it('derives the default status bar model from Redux state', () => {
    const store = createIdeStore();
    const model = selectStatusBarModel(store.getState());

    expect(model.runtime.label).toBe('Ready');
    expect(model.engineLabel).toBe('Interpreter');
    expect(model.programLabel).toBe('nibbles.asm');
    expect(model.terminalGeometryLabel).toBe('80x25');
    expect(model.locationLabel).toBe('Cursor 1:1');
    expect(model.stopLabel).toBe('idle');
  });

  it('switches location labels for the code workspace and tracks the active file name', () => {
    const store = createIdeStore();

    store.dispatch(setActiveFile('workspace:scratch.asm'));
    store.dispatch(setWorkspaceTab('code'));
    store.dispatch(setEditorCursorPosition({ line: 18, column: 9 }));
    store.dispatch(setEditorCode('MOVE.L #1,D0'));

    const model = selectStatusBarModel(store.getState());

    expect(model.programLabel).toBe('scratch.asm');
    expect(model.viewLabel).toBe('Code');
    expect(model.locationLabel).toBe('Ln 18, Col 9');
  });

  it('humanizes underscored stop reasons for the status bar', () => {
    const store = createIdeStore();

    store.dispatch(
      setRuntimeMetrics({
        lastStopReason: 'waiting_for_input',
      })
    );

    const model = selectStatusBarModel(store.getState());

    expect(model.stopLabel).toBe('waiting for input');
  });

  it('selects the flags pane when the flags view is active', () => {
    const store = createIdeStore();

    store.dispatch({ type: 'emulator/toggleShowFlags' });

    expect(selectActiveInspectorPane(store.getState())).toBe('flags');
  });
});
