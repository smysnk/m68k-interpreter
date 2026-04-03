import { beforeEach, describe, expect, it } from 'vitest';
import { createIdeStore, resetFilesState, resetSettingsState, setActiveFile } from '@/store';
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
    store.dispatch(setActiveFile('workspace:scratch.asm'));

    const model = selectFileExplorerModel(store.getState());

    expect(model.activeFileId).toBe('workspace:scratch.asm');
    expect(model.groupedFiles.map((group) => group.label)).toEqual(['Workspace', 'Examples']);
    expect(model.groupedFiles[1]?.items.map((item) => item.name)).toEqual([
      'nibbles.asm',
      'hello-terminal.asm',
      'echo-input.asm',
      'polling-input.asm',
      'arithmetic-registers.asm',
      'sum-1-to-10.asm',
      'memory-copy.asm',
      'subroutine-stack.asm',
      'flags-compare.asm',
    ]);
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
