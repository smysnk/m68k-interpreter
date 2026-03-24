import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { selectActiveFileId, selectFiles } from '@/store/filesSlice';

export const selectFileExplorerModel = createSelector(
  [
    selectFiles,
    selectActiveFileId,
    (state: RootState) => state.settings.engineMode,
    (state: RootState) => state.uiShell.chromeOffsets,
  ],
  (files, activeFileId, engineMode, chromeOffsets) => ({
    files,
    activeFileId,
    engineMode,
    chromeOffsets,
    groupedFiles: [
      {
        label: 'Workspace',
        items: files.filter((file) => file.kind === 'workspace'),
      },
      {
        label: 'Examples',
        items: files.filter((file) => file.kind === 'example'),
      },
    ].filter((group) => group.items.length > 0),
  })
);
