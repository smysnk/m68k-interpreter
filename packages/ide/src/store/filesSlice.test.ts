import { describe, expect, it } from 'vitest';
import {
  NIBBLES_FILE_ID,
  createDefaultFilesState,
  getActiveFile,
  normalizeFilesState,
  resetFilesState,
  setActiveFile,
  setActiveFileContent,
} from '@/store/filesSlice';
import { bundledExampleFiles } from '@/programs/examples';
import filesReducer from '@/store/filesSlice';

describe('filesSlice', () => {
  it('seeds the default workspace with nibbles selected', () => {
    const state = createDefaultFilesState();

    expect(getActiveFile(state).name).toBe('nibbles.asm');
    expect(state.items).toHaveLength(1 + bundledExampleFiles.length);
    expect(state.items.filter((item) => item.kind === 'example').map((item) => item.name)).toEqual(
      bundledExampleFiles.map((item) => item.name)
    );
  });

  it('normalizes persisted file state and restores defaults when items are missing', () => {
    const normalized = normalizeFilesState({
      activeFileId: 'missing-file',
      items: [
        {
          id: 'workspace:scratch.asm',
          name: 'scratch.asm',
          path: 'workspace/scratch.asm',
          kind: 'workspace',
          content: 'CUSTOM',
        },
      ],
    });

    expect(normalized.items.some((item) => item.id === 'example:nibbles.asm')).toBe(true);
    expect(getActiveFile(normalized).id).toBe('example:nibbles.asm');
  });

  it('refreshes bundled example file content when persisted local storage is stale', () => {
    const normalized = normalizeFilesState({
      activeFileId: NIBBLES_FILE_ID,
      items: [
        {
          id: NIBBLES_FILE_ID,
          name: 'nibbles.asm',
          path: 'fixtures/nibbles.asm',
          kind: 'example',
          content: 'stale local example content',
        },
      ],
    });

    expect(getActiveFile(normalized).id).toBe(NIBBLES_FILE_ID);
    expect(getActiveFile(normalized).content).not.toBe('stale local example content');
    expect(getActiveFile(normalized).content).toContain('Author: Joshua Bellamy');
  });

  it('updates the active file content and can reset to defaults', () => {
    const state = createDefaultFilesState();
    const selectedState = filesReducer(state, setActiveFile('workspace:scratch.asm'));
    const editedState = filesReducer(selectedState, setActiveFileContent('MOVE.L #1,D0'));

    expect(getActiveFile(editedState).content).toBe('MOVE.L #1,D0');

    const resetState = filesReducer(editedState, resetFilesState());
    expect(getActiveFile(resetState).name).toBe('nibbles.asm');
  });
});
