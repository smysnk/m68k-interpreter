export const PANEL_LAYOUT_SCHEMA_VERSION = 1 as const;
export const MIN_PANEL_COLUMNS = 1;
export const MAX_PANEL_COLUMNS = 4;
export const MAX_PANEL_INSTANCES = 32;
export const MAX_SAVED_PANEL_VIEWS = 20;

export type PanelKind = 'terminal' | 'code' | 'registers' | 'memory' | 'hardware' | 'help';
export type PanelInstanceId = string;
export type PanelColumnId = string;
export type PanelViewId = string;
export type PanelPresetId = 'classic' | 'code-run' | 'hardware-lab' | 'debug' | 'terminal-focus';

export interface FloatingPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PanelConfiguration =
  | { kind: 'terminal' }
  | { kind: 'code'; fileId?: string }
  | { kind: 'registers' }
  | { kind: 'memory'; startAddress?: number }
  | { kind: 'hardware' }
  | { kind: 'help' };

export interface PanelInstance {
  id: PanelInstanceId;
  kind: PanelKind;
  title: string;
  minimized: boolean;
  floatingRect?: FloatingPanelRect;
  config: PanelConfiguration;
}

export interface PanelColumn {
  id: PanelColumnId;
  width: number;
  panelIds: PanelInstanceId[];
}

export interface PanelLayoutDocument {
  schemaVersion: typeof PANEL_LAYOUT_SCHEMA_VERSION;
  name: string;
  columnCount: number;
  columns: PanelColumn[];
  floatingPanelIds: PanelInstanceId[];
  instances: Record<PanelInstanceId, PanelInstance>;
  focusedPanelId: PanelInstanceId | null;
  terminalOwnerPanelId: PanelInstanceId | null;
  nextInstanceSequence: number;
  nextColumnSequence: number;
}

export interface SavedPanelView {
  id: PanelViewId;
  name: string;
  createdAt: string;
  updatedAt: string;
  document: PanelLayoutDocument;
}

export interface PanelLayoutState {
  activeLayout: PanelLayoutDocument;
  activeSourceViewId: PanelViewId | null;
  activeLayoutDirty: boolean;
  userViews: Record<PanelViewId, SavedPanelView>;
  userViewOrder: PanelViewId[];
}

export interface PanelPlacementTarget {
  columnId: PanelColumnId;
  index?: number;
}

export interface PanelCreateTarget extends Partial<PanelPlacementTarget> {
  floatingRect?: FloatingPanelRect;
}

export function createPanelConfiguration(kind: PanelKind): PanelConfiguration {
  return { kind } as PanelConfiguration;
}
