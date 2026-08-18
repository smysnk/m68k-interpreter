import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createPanelPreset } from '@/panels/panelPresets';
import {
  clampFloatingRect,
  normalizePanelLayoutDocument,
  normalizePanelLayoutState,
} from '@/store/panelLayoutValidation';
import {
  MAX_PANEL_COLUMNS,
  MAX_PANEL_INSTANCES,
  MAX_SAVED_PANEL_VIEWS,
  MIN_PANEL_COLUMNS,
  createPanelConfiguration,
  getPanelDefaultTitle,
  getPanelHardwareDeviceConfigs,
  type FloatingPanelRect,
  type PanelCreateTarget,
  type PanelInstanceId,
  type PanelKind,
  type PanelLayoutDocument,
  type PanelLayoutState,
  type PanelPresetId,
} from '@/store/panelLayoutTypes';

function removePlacement(document: PanelLayoutDocument, panelId: string): void {
  for (const column of document.columns)
    column.panelIds = column.panelIds.filter((id) => id !== panelId);
  document.floatingPanelIds = document.floatingPanelIds.filter((id) => id !== panelId);
}

function visibleTerminalReplacement(document: PanelLayoutDocument): string | null {
  const candidates = [
    document.focusedPanelId,
    ...[...document.floatingPanelIds].reverse(),
    ...document.columns.flatMap((column) => column.panelIds),
  ].filter((id): id is string => Boolean(id));
  return (
    candidates.find(
      (id) => document.instances[id]?.kind === 'terminal' && !document.instances[id]?.minimized
    ) ??
    Object.values(document.instances).find((panel) => panel.kind === 'terminal')?.id ??
    null
  );
}

function addInstance(
  document: PanelLayoutDocument,
  kind: PanelKind,
  target: PanelCreateTarget = {}
): string | null {
  if (Object.keys(document.instances).length >= MAX_PANEL_INSTANCES) return null;
  const id = `panel-${kind}-${document.nextInstanceSequence}`;
  let config;
  try {
    config = createPanelConfiguration(kind, {
      instanceId: id,
      existingDevices: getPanelHardwareDeviceConfigs(Object.values(document.instances)),
    });
  } catch {
    return null;
  }
  document.nextInstanceSequence += 1;
  document.instances[id] = {
    id,
    kind,
    title: getPanelDefaultTitle(kind),
    minimized: false,
    config,
  };
  if (target.floatingRect) {
    document.instances[id]!.floatingRect = clampFloatingRect(target.floatingRect);
    document.floatingPanelIds.push(id);
  } else {
    const column =
      document.columns.find((candidate) => candidate.id === target.columnId) ??
      [...document.columns].reverse().sort((left, right) => {
        const expanded = (candidate: typeof left) =>
          candidate.panelIds.filter((panelId) => !document.instances[panelId]?.minimized).length;
        return expanded(left) - expanded(right);
      })[0] ??
      document.columns[0]!;
    const index = Math.min(
      column.panelIds.length,
      Math.max(0, target.index ?? column.panelIds.length)
    );
    column.panelIds.splice(index, 0, id);
  }
  document.focusedPanelId = id;
  if (kind === 'terminal' && !document.terminalOwnerPanelId) document.terminalOwnerPanelId = id;
  return id;
}

function markDirty(state: PanelLayoutState): void {
  state.activeLayoutDirty = true;
}

export const initialPanelLayoutState: PanelLayoutState = {
  activeLayout: createPanelPreset('classic'),
  activeSourceViewId: null,
  activeLayoutDirty: false,
  userViews: {},
  userViewOrder: [],
};

const panelLayoutSlice = createSlice({
  name: 'panelLayout',
  initialState: initialPanelLayoutState,
  reducers: {
    hydratePanelLayout(_state, action: PayloadAction<unknown>) {
      return normalizePanelLayoutState(action.payload);
    },
    createPanel(state, action: PayloadAction<{ kind: PanelKind; target?: PanelCreateTarget }>) {
      if (addInstance(state.activeLayout, action.payload.kind, action.payload.target))
        markDirty(state);
    },
    duplicatePanel(
      state,
      action: PayloadAction<{ sourcePanelId: string; target?: PanelCreateTarget }>
    ) {
      const source = state.activeLayout.instances[action.payload.sourcePanelId];
      if (!source) return;
      const id = addInstance(state.activeLayout, source.kind, action.payload.target);
      if (id) {
        state.activeLayout.instances[id]!.title = source.title;
        if (
          source.config.kind !== 'hardware-display' &&
          source.config.kind !== 'hardware-digital-io'
        ) {
          state.activeLayout.instances[id]!.config = { ...source.config };
        }
        markDirty(state);
      }
    },
    commitHardwarePanelConfiguration(
      state,
      action: PayloadAction<{
        panelId: string;
        config:
          | Extract<
              PanelLayoutDocument['instances'][string]['config'],
              { kind: 'hardware-display' }
            >
          | Extract<
              PanelLayoutDocument['instances'][string]['config'],
              { kind: 'hardware-digital-io' }
            >;
      }>
    ) {
      const panel = state.activeLayout.instances[action.payload.panelId];
      if (!panel || panel.kind !== action.payload.config.kind) return;
      const previousDeviceId =
        panel.config.kind === 'hardware-display' || panel.config.kind === 'hardware-digital-io'
          ? panel.config.deviceId
          : undefined;
      for (const candidate of Object.values(state.activeLayout.instances)) {
        if (
          previousDeviceId &&
          candidate.config.kind === action.payload.config.kind &&
          candidate.config.deviceId === previousDeviceId
        ) {
          candidate.config = { ...action.payload.config };
        }
      }
      markDirty(state);
    },
    commitMultimediaPanelConfiguration(
      state,
      action: PayloadAction<{
        panelId: string;
        config:
          | Extract<PanelLayoutDocument['instances'][string]['config'], { kind: 'graphics' }>
          | Extract<PanelLayoutDocument['instances'][string]['config'], { kind: 'sound' }>;
      }>
    ) {
      const panel = state.activeLayout.instances[action.payload.panelId];
      if (!panel || panel.kind !== action.payload.config.kind) return;
      panel.config = { ...action.payload.config };
      markDirty(state);
    },
    closePanel(state, action: PayloadAction<PanelInstanceId>) {
      const id = action.payload;
      if (!state.activeLayout.instances[id]) return;
      removePlacement(state.activeLayout, id);
      delete state.activeLayout.instances[id];
      if (state.activeLayout.focusedPanelId === id) state.activeLayout.focusedPanelId = null;
      if (state.activeLayout.terminalOwnerPanelId === id)
        state.activeLayout.terminalOwnerPanelId = visibleTerminalReplacement(state.activeLayout);
      markDirty(state);
    },
    togglePanelMinimized(state, action: PayloadAction<PanelInstanceId>) {
      const panel = state.activeLayout.instances[action.payload];
      if (!panel) return;
      panel.minimized = !panel.minimized;
      if (panel.minimized && state.activeLayout.terminalOwnerPanelId === panel.id)
        state.activeLayout.terminalOwnerPanelId = visibleTerminalReplacement(state.activeLayout);
      markDirty(state);
    },
    focusPanel(state, action: PayloadAction<PanelInstanceId>) {
      const panel = state.activeLayout.instances[action.payload];
      if (!panel) return;
      panel.minimized = false;
      state.activeLayout.focusedPanelId = panel.id;
      if (state.activeLayout.floatingPanelIds.includes(panel.id)) {
        state.activeLayout.floatingPanelIds = state.activeLayout.floatingPanelIds.filter(
          (id) => id !== panel.id
        );
        state.activeLayout.floatingPanelIds.push(panel.id);
      }
    },
    setTerminalOwner(state, action: PayloadAction<PanelInstanceId>) {
      const panel = state.activeLayout.instances[action.payload];
      if (panel?.kind !== 'terminal') return;
      panel.minimized = false;
      state.activeLayout.terminalOwnerPanelId = panel.id;
      state.activeLayout.focusedPanelId = panel.id;
      markDirty(state);
    },
    revealPanelKind(state, action: PayloadAction<PanelKind>) {
      const panel = Object.values(state.activeLayout.instances).find(
        (candidate) => candidate.kind === action.payload
      );
      if (panel) {
        panel.minimized = false;
        state.activeLayout.focusedPanelId = panel.id;
      } else if (addInstance(state.activeLayout, action.payload)) {
        markDirty(state);
      }
    },
    setColumnCount(state, action: PayloadAction<number>) {
      const count = Math.max(
        MIN_PANEL_COLUMNS,
        Math.min(MAX_PANEL_COLUMNS, Math.trunc(action.payload))
      );
      const document = state.activeLayout;
      while (document.columns.length < count)
        document.columns.push({
          id: `column-${document.nextColumnSequence++}`,
          width: 1,
          panelIds: [],
        });
      if (document.columns.length > count) {
        const removed = document.columns.splice(count);
        document.columns[count - 1]!.panelIds.push(...removed.flatMap((column) => column.panelIds));
      }
      document.columnCount = count;
      document.columns.forEach((column) => {
        column.width = 100 / count;
      });
      markDirty(state);
    },
    commitColumnWidths(state, action: PayloadAction<number[]>) {
      if (action.payload.length !== state.activeLayout.columns.length) return;
      const total = action.payload.reduce(
        (sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0),
        0
      );
      if (total <= 0) return;
      state.activeLayout.columns.forEach((column, index) => {
        column.width = (action.payload[index]! / total) * 100;
      });
      markDirty(state);
    },
    movePanel(state, action: PayloadAction<{ panelId: string; columnId: string; index?: number }>) {
      const { panelId, columnId } = action.payload;
      const column = state.activeLayout.columns.find((candidate) => candidate.id === columnId);
      if (!column || !state.activeLayout.instances[panelId]) return;
      removePlacement(state.activeLayout, panelId);
      delete state.activeLayout.instances[panelId]!.floatingRect;
      column.panelIds.splice(
        Math.min(
          column.panelIds.length,
          Math.max(0, action.payload.index ?? column.panelIds.length)
        ),
        0,
        panelId
      );
      state.activeLayout.focusedPanelId = panelId;
      markDirty(state);
    },
    floatPanel(state, action: PayloadAction<{ panelId: string; rect?: FloatingPanelRect }>) {
      const panel = state.activeLayout.instances[action.payload.panelId];
      if (!panel) return;
      removePlacement(state.activeLayout, panel.id);
      panel.floatingRect = clampFloatingRect(action.payload.rect);
      state.activeLayout.floatingPanelIds.push(panel.id);
      state.activeLayout.focusedPanelId = panel.id;
      markDirty(state);
    },
    moveFloatingPanel(state, action: PayloadAction<{ panelId: string; rect: FloatingPanelRect }>) {
      const panel = state.activeLayout.instances[action.payload.panelId];
      if (!panel || !state.activeLayout.floatingPanelIds.includes(panel.id)) return;
      panel.floatingRect = clampFloatingRect(action.payload.rect);
      state.activeLayout.floatingPanelIds = state.activeLayout.floatingPanelIds.filter(
        (id) => id !== panel.id
      );
      state.activeLayout.floatingPanelIds.push(panel.id);
      state.activeLayout.focusedPanelId = panel.id;
      markDirty(state);
    },
    bringFloatingPanelToFront(state, action: PayloadAction<string>) {
      if (!state.activeLayout.floatingPanelIds.includes(action.payload)) return;
      state.activeLayout.floatingPanelIds = state.activeLayout.floatingPanelIds.filter(
        (id) => id !== action.payload
      );
      state.activeLayout.floatingPanelIds.push(action.payload);
      state.activeLayout.focusedPanelId = action.payload;
    },
    resetToPreset(state, action: PayloadAction<PanelPresetId>) {
      state.activeLayout = createPanelPreset(action.payload);
      state.activeSourceViewId = `preset:${action.payload}`;
      state.activeLayoutDirty = false;
    },
    restoreSourceIdeBaseline(
      state,
      action: PayloadAction<
        Pick<PanelLayoutState, 'activeLayout' | 'activeSourceViewId' | 'activeLayoutDirty'>
      >
    ) {
      state.activeLayout = normalizePanelLayoutDocument(action.payload.activeLayout);
      state.activeSourceViewId = action.payload.activeSourceViewId;
      state.activeLayoutDirty = action.payload.activeLayoutDirty;
    },
    replaceActiveLayout(state, action: PayloadAction<unknown>) {
      state.activeLayout = normalizePanelLayoutDocument(action.payload);
      state.activeLayoutDirty = true;
    },
    saveView(state, action: PayloadAction<{ id?: string; name: string }>) {
      const name = action.payload.name.trim().slice(0, 60);
      if (!name) return;
      const id = action.payload.id ?? `view-${Date.now().toString(36)}`;
      if (!state.userViews[id] && state.userViewOrder.length >= MAX_SAVED_PANEL_VIEWS) return;
      const now = new Date().toISOString();
      state.userViews[id] = {
        id,
        name,
        createdAt: state.userViews[id]?.createdAt ?? now,
        updatedAt: now,
        document: normalizePanelLayoutDocument(state.activeLayout),
      };
      if (!state.userViewOrder.includes(id)) state.userViewOrder.push(id);
      state.activeSourceViewId = id;
      state.activeLayoutDirty = false;
    },
    restoreView(state, action: PayloadAction<string>) {
      const view = state.userViews[action.payload];
      if (!view) return;
      state.activeLayout = normalizePanelLayoutDocument(view.document);
      state.activeSourceViewId = view.id;
      state.activeLayoutDirty = false;
    },
    renameView(state, action: PayloadAction<{ viewId: string; name: string }>) {
      const view = state.userViews[action.payload.viewId];
      const name = action.payload.name.trim().slice(0, 60);
      if (view && name) {
        view.name = name;
        view.updatedAt = new Date().toISOString();
      }
    },
    deleteView(state, action: PayloadAction<string>) {
      if (!state.userViews[action.payload]) return;
      delete state.userViews[action.payload];
      state.userViewOrder = state.userViewOrder.filter((id) => id !== action.payload);
      if (state.activeSourceViewId === action.payload) state.activeSourceViewId = null;
    },
  },
});

export const {
  hydratePanelLayout,
  createPanel,
  duplicatePanel,
  closePanel,
  togglePanelMinimized,
  focusPanel,
  commitHardwarePanelConfiguration,
  commitMultimediaPanelConfiguration,
  setTerminalOwner,
  revealPanelKind,
  setColumnCount,
  commitColumnWidths,
  movePanel,
  floatPanel,
  moveFloatingPanel,
  bringFloatingPanelToFront,
  resetToPreset,
  restoreSourceIdeBaseline,
  replaceActiveLayout,
  saveView,
  restoreView,
  renameView,
  deleteView,
} = panelLayoutSlice.actions;
export default panelLayoutSlice.reducer;
