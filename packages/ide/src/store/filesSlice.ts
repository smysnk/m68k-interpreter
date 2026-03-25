import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { initialEditorCode } from '@/store/emulatorSlice';
import { bundledExampleFiles } from '@/programs/examples';
import type { RootState } from '@/store';

export type IdeFileKind = 'workspace' | 'example';

export interface IdeFileDocument {
  id: string;
  name: string;
  path: string;
  kind: IdeFileKind;
  content: string;
}

export interface FilesState {
  activeFileId: string;
  items: IdeFileDocument[];
}

export const NIBBLES_FILE_ID = 'example:nibbles.asm';
export const SCRATCH_FILE_ID = 'workspace:scratch.asm';

export function createDefaultFilesState(): FilesState {
  return {
    activeFileId: NIBBLES_FILE_ID,
    items: [
      {
        id: SCRATCH_FILE_ID,
        name: 'scratch.asm',
        path: 'workspace/scratch.asm',
        kind: 'workspace',
        content: initialEditorCode,
      },
      ...bundledExampleFiles,
    ],
  };
}

export const initialFilesState: FilesState = createDefaultFilesState();

function dedupeFiles(items: IdeFileDocument[]): IdeFileDocument[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

export function normalizeFilesState(value?: Partial<FilesState>): FilesState {
  const defaults = createDefaultFilesState();
  const persistedItems = Array.isArray(value?.items)
    ? value.items.filter(
        (item): item is IdeFileDocument =>
          typeof item?.id === 'string' &&
          typeof item?.name === 'string' &&
          typeof item?.path === 'string' &&
          (item?.kind === 'workspace' || item?.kind === 'example') &&
          typeof item?.content === 'string'
      )
    : [];

  const persistedById = new Map(persistedItems.map((item) => [item.id, item]));
  const mergedDefaults = defaults.items.map((item) => {
    const persistedItem = persistedById.get(item.id);

    if (!persistedItem) {
      return item;
    }

    // Bundled example files should stay aligned with the shipped source so
    // fixture/asset updates are reflected even when older local storage exists.
    if (item.kind === 'example') {
      return item;
    }

    return persistedItem;
  });
  const extraItems = persistedItems.filter((item) => !defaults.items.some((defaultItem) => defaultItem.id === item.id));
  const items = dedupeFiles([...mergedDefaults, ...extraItems]);
  const activeFileId =
    typeof value?.activeFileId === 'string' && items.some((item) => item.id === value.activeFileId)
      ? value.activeFileId
      : defaults.activeFileId;

  return {
    activeFileId,
    items,
  };
}

export function getFileById(filesState: FilesState, fileId: string): IdeFileDocument | undefined {
  return filesState.items.find((item) => item.id === fileId);
}

export function getActiveFile(filesState: FilesState): IdeFileDocument {
  return (
    getFileById(filesState, filesState.activeFileId) ??
    filesState.items[0] ??
    createDefaultFilesState().items[0]
  );
}

const filesSlice = createSlice({
  name: 'files',
  initialState: initialFilesState,
  reducers: {
    setActiveFile(state, action: PayloadAction<string>) {
      if (state.items.some((item) => item.id === action.payload)) {
        state.activeFileId = action.payload;
      }
    },
    setActiveFileContent(state, action: PayloadAction<string>) {
      const activeFile = state.items.find((item) => item.id === state.activeFileId);

      if (activeFile) {
        activeFile.content = action.payload;
      }
    },
    resetFilesState() {
      return createDefaultFilesState();
    },
  },
});

export const { setActiveFile, setActiveFileContent, resetFilesState } = filesSlice.actions;

export const selectFilesState = (state: RootState): FilesState => state.files;
export const selectFiles = createSelector([selectFilesState], (filesState) => filesState.items);
export const selectActiveFileId = createSelector(
  [selectFilesState],
  (filesState) => filesState.activeFileId
);
export const selectActiveFile = createSelector([selectFilesState], (filesState) =>
  getActiveFile(filesState)
);
export const selectActiveFileContent = createSelector(
  [selectActiveFile],
  (activeFile) => activeFile.content
);
export const selectActiveFileName = createSelector(
  [selectActiveFile],
  (activeFile) => activeFile.name
);

export default filesSlice.reducer;
