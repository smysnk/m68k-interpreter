import { beforeEach, describe, expect, it } from 'vitest';
import { createIdeStore, resetFilesState, resetSettingsState, setActiveFile, setEngineMode } from '@/store';
import { selectFileExplorerModel } from '@/store/fileExplorerSelectors';
import { selectFlagsPanelModel } from '@/store/flagsSelectors';
import { selectRegisterFlagsHeadingModel, selectRegisterGroupsModel } from '@/store/registerSelectors';

describe('viewSelectors', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('builds the file explorer model', () => {
    const store = createIdeStore();
    store.dispatch(resetFilesState());
    store.dispatch(resetSettingsState());
    store.dispatch(setEngineMode('interpreter-redux'));
    store.dispatch(setActiveFile('workspace:scratch.asm'));

    const model = selectFileExplorerModel(store.getState());

    expect(model.activeFileId).toBe('workspace:scratch.asm');
    expect(model.engineMode).toBe('interpreter-redux');
    expect(model.groupedFiles.map((group) => group.label)).toEqual(['Workspace', 'Examples']);
  });

  it('builds the flags panel model', () => {
    const store = createIdeStore();
    const model = selectFlagsPanelModel(store.getState());

    expect(model.ccrHex).toBe('0x00');
    expect(model.rows).toHaveLength(5);
    expect(model.rows[0]).toMatchObject({ key: 'z', name: 'Z (Zero)' });
  });

  it('builds the register models', () => {
    const store = createIdeStore();
    const heading = selectRegisterFlagsHeadingModel(store.getState());
    const groups = selectRegisterGroupsModel(store.getState());

    expect(heading.ccrHex).toBe('0x00');
    expect(heading.currentFlags.map((flag) => flag.label)).toEqual(['X', 'N', 'Z', 'V', 'C']);
    expect(groups.map((group) => group.id)).toEqual(['data', 'address', 'control']);
    expect(groups[0].descriptors).toHaveLength(8);
  });
});
