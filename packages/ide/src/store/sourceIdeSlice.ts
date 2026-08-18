import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CpuModel, MachineProfile } from '@m68k/interpreter';
import type { SourceIdeDirective, SourceIdeRunMode } from '@/config/sourceIdeDirective';
import type { PanelLayoutDocument, PanelViewId } from '@/store/panelLayoutTypes';

export interface SourceIdeBaseline {
  cpuModel: CpuModel;
  machineProfile: MachineProfile;
  speedMultiplier: number;
  panelLayout: {
    activeLayout: PanelLayoutDocument;
    activeSourceViewId: PanelViewId | null;
    activeLayoutDirty: boolean;
  };
}

export type SourceIdeCurrentState =
  | { status: 'none' }
  | { status: 'invalid'; fileId: string; raw: string; diagnostics: string[] }
  | { status: 'ignored'; fileId: string; raw: string }
  | {
      status: 'applied';
      fileId: string;
      raw: string;
      signature: string;
      directive: SourceIdeDirective;
      run: SourceIdeRunMode;
      diagnostics: string[];
      applySequence: number;
      terminalGeometryVersion: number;
    };

export interface SourceIdeState {
  baseline: SourceIdeBaseline | null;
  current: SourceIdeCurrentState;
  ignoredFileIds: string[];
  reapplyRequest: number;
}

export const initialSourceIdeState: SourceIdeState = {
  baseline: null,
  current: { status: 'none' },
  ignoredFileIds: [],
  reapplyRequest: 0,
};

const sourceIdeSlice = createSlice({
  name: 'sourceIde',
  initialState: initialSourceIdeState,
  reducers: {
    sourceIdeApplied(
      state,
      action: PayloadAction<{
        baseline: SourceIdeBaseline;
        fileId: string;
        raw: string;
        signature: string;
        directive: SourceIdeDirective;
        diagnostics: string[];
        terminalGeometryVersion: number;
      }>
    ) {
      state.baseline ??= action.payload.baseline;
      const previousSequence = state.current.status === 'applied' ? state.current.applySequence : 0;
      state.current = {
        status: 'applied',
        fileId: action.payload.fileId,
        raw: action.payload.raw,
        signature: action.payload.signature,
        directive: action.payload.directive,
        run: action.payload.directive.run ?? 'manual',
        diagnostics: action.payload.diagnostics,
        applySequence: previousSequence + 1,
        terminalGeometryVersion: action.payload.terminalGeometryVersion,
      };
    },
    sourceIdeInvalid(
      state,
      action: PayloadAction<{ fileId: string; raw: string; diagnostics: string[] }>
    ) {
      state.baseline = null;
      state.current = { status: 'invalid', ...action.payload };
    },
    sourceIdeIgnored(state, action: PayloadAction<{ fileId: string; raw: string }>) {
      if (!state.ignoredFileIds.includes(action.payload.fileId))
        state.ignoredFileIds.push(action.payload.fileId);
      state.baseline = null;
      state.current = { status: 'ignored', ...action.payload };
    },
    sourceIdeCleared(state) {
      state.baseline = null;
      state.current = { status: 'none' };
    },
    requestSourceIdeIgnore(state, action: PayloadAction<string>) {
      if (!state.ignoredFileIds.includes(action.payload)) state.ignoredFileIds.push(action.payload);
      state.reapplyRequest += 1;
    },
    requestSourceIdeReapply(state, action: PayloadAction<string>) {
      state.ignoredFileIds = state.ignoredFileIds.filter((fileId) => fileId !== action.payload);
      state.reapplyRequest += 1;
    },
    resetSourceIdeState() {
      return initialSourceIdeState;
    },
  },
});

export const {
  requestSourceIdeIgnore,
  requestSourceIdeReapply,
  resetSourceIdeState,
  sourceIdeApplied,
  sourceIdeCleared,
  sourceIdeIgnored,
  sourceIdeInvalid,
} = sourceIdeSlice.actions;

export default sourceIdeSlice.reducer;
