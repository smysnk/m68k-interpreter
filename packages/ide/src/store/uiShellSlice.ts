import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { resetSettingsState } from '@/store/settingsSlice';

export type WorkspaceTab = 'terminal' | 'code' | 'registers' | 'memory';
export type InspectorView = 'registers' | 'memory' | 'flags';
export type ContextView = 'help' | 'none';
export type AppSubmenu = 'style' | 'terminal-input' | null;

export interface UiShellLayoutState {
  rootHorizontal: [number, number];
  rootHorizontalWithContext: [number, number, number];
  inspectorVertical: [number, number];
}

export interface UiShellChromeOffsets {
  top: number;
  bottom: number;
}

export interface UiShellState {
  workspaceTab: WorkspaceTab;
  inspectorView: Exclude<InspectorView, 'flags'>;
  contextView: ContextView;
  contextOpen: boolean;
  appMenuOpen: boolean;
  activeSubmenu: AppSubmenu;
  editorCursorLine: number;
  editorCursorColumn: number;
  chromeOffsets: UiShellChromeOffsets;
  layout: UiShellLayoutState;
}

export const initialUiShellState: UiShellState = {
  workspaceTab: 'terminal',
  inspectorView: 'registers',
  contextView: 'none',
  contextOpen: false,
  appMenuOpen: false,
  activeSubmenu: null,
  editorCursorLine: 1,
  editorCursorColumn: 1,
  chromeOffsets: {
    top: 58,
    bottom: 38,
  },
  layout: {
    rootHorizontal: [61, 39],
    rootHorizontalWithContext: [50, 32, 18],
    inspectorVertical: [54, 46],
  },
};

const uiShellSlice = createSlice({
  name: 'uiShell',
  initialState: initialUiShellState,
  reducers: {
    setWorkspaceTab(state, action: PayloadAction<WorkspaceTab>) {
      state.workspaceTab = action.payload;
    },
    setInspectorView(state, action: PayloadAction<Exclude<InspectorView, 'flags'>>) {
      state.inspectorView = action.payload;
    },
    toggleInspectorView(state) {
      state.inspectorView = state.inspectorView === 'memory' ? 'registers' : 'memory';
    },
    setContextView(state, action: PayloadAction<ContextView>) {
      state.contextView = action.payload;
      state.contextOpen = action.payload !== 'none';
    },
    openContextView(state, action: PayloadAction<Exclude<ContextView, 'none'>>) {
      state.contextView = action.payload;
      state.contextOpen = true;
    },
    closeContextPane(state) {
      state.contextOpen = false;
      state.contextView = 'none';
    },
    toggleContextView(state, action: PayloadAction<Exclude<ContextView, 'none'>>) {
      const nextView = action.payload;

      if (state.contextOpen && state.contextView === nextView) {
        state.contextOpen = false;
        state.contextView = 'none';
        return;
      }

      state.contextOpen = true;
      state.contextView = nextView;
    },
    setAppMenuOpen(state, action: PayloadAction<boolean>) {
      state.appMenuOpen = action.payload;
      if (!action.payload) {
        state.activeSubmenu = null;
      }
    },
    toggleAppMenu(state) {
      state.appMenuOpen = !state.appMenuOpen;
      if (!state.appMenuOpen) {
        state.activeSubmenu = null;
      }
    },
    setActiveSubmenu(state, action: PayloadAction<AppSubmenu>) {
      state.activeSubmenu = action.payload;
    },
    closeAppMenu(state) {
      state.appMenuOpen = false;
      state.activeSubmenu = null;
    },
    setEditorCursorPosition(
      state,
      action: PayloadAction<{
        line: number;
        column: number;
      }>
    ) {
      state.editorCursorLine = action.payload.line;
      state.editorCursorColumn = action.payload.column;
    },
    setChromeOffsets(state, action: PayloadAction<UiShellChromeOffsets>) {
      state.chromeOffsets = action.payload;
    },
    setRootHorizontalLayout(state, action: PayloadAction<[number, number]>) {
      state.layout.rootHorizontal = action.payload;
    },
    setRootHorizontalWithContextLayout(state, action: PayloadAction<[number, number, number]>) {
      state.layout.rootHorizontalWithContext = action.payload;
    },
    setInspectorVerticalLayout(state, action: PayloadAction<[number, number]>) {
      state.layout.inspectorVertical = action.payload;
    },
    resetUiShellState() {
      return { ...initialUiShellState };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetSettingsState, () => ({ ...initialUiShellState }));
  },
});

export const {
  setWorkspaceTab,
  setInspectorView,
  toggleInspectorView,
  setContextView,
  openContextView,
  closeContextPane,
  toggleContextView,
  setAppMenuOpen,
  toggleAppMenu,
  setActiveSubmenu,
  closeAppMenu,
  setEditorCursorPosition,
  setChromeOffsets,
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  setInspectorVerticalLayout,
  resetUiShellState,
} = uiShellSlice.actions;

export default uiShellSlice.reducer;
