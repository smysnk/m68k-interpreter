import { describe, expect, it } from 'vitest';
import {
  createDefaultFilesState,
  getActiveFile,
  normalizeFilesState,
  resetFilesState,
  setActiveFile,
  setActiveFileContent,
} from '@/store/filesSlice';
import filesReducer from '@/store/filesSlice';

describe('filesSlice', () => {
  it('seeds the default workspace with nibbles selected', () => {
    const state = createDefaultFilesState();

    expect(getActiveFile(state).name).toBe('nibbles.asm');
    expect(state.items).toHaveLength(2);
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

  it('updates the active file content and can reset to defaults', () => {
    const state = createDefaultFilesState();
    const selectedState = filesReducer(state, setActiveFile('workspace:scratch.asm'));
    const editedState = filesReducer(selectedState, setActiveFileContent('MOVE.L #1,D0'));

    expect(getActiveFile(editedState).content).toBe('MOVE.L #1,D0');

    const resetState = filesReducer(editedState, resetFilesState());
    expect(getActiveFile(resetState).name).toBe('nibbles.asm');
  });
});
