import { createPanelPreset, getPanelDefaultTitle } from '@/panels/panelPresets';
import {
  MAX_PANEL_COLUMNS,
  MAX_PANEL_INSTANCES,
  MIN_PANEL_COLUMNS,
  PANEL_LAYOUT_SCHEMA_VERSION,
  createPanelConfiguration,
  type FloatingPanelRect,
  type PanelKind,
  type PanelLayoutDocument,
  type PanelLayoutState,
  type SavedPanelView,
} from '@/store/panelLayoutTypes';
import type { UiShellState, WorkspaceTab } from '@/store/uiShellSlice';

const PANEL_KINDS = new Set<PanelKind>(['terminal', 'code', 'registers', 'memory', 'hardware', 'help']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clampFloatingRect(value: unknown): FloatingPanelRect {
  const rect = isRecord(value) ? value : {};
  return {
    x: Math.max(0, finite(rect.x, 32)),
    y: Math.max(0, finite(rect.y, 32)),
    width: Math.max(280, finite(rect.width, 520)),
    height: Math.max(180, finite(rect.height, 420)),
  };
}

export function normalizePanelLayoutDocument(value: unknown): PanelLayoutDocument {
  if (!isRecord(value) || !Array.isArray(value.columns) || !isRecord(value.instances)) {
    return createPanelPreset('classic');
  }

  const sourceInstances = value.instances as Record<string, unknown>;
  const instances: PanelLayoutDocument['instances'] = {};
  for (const [id, raw] of Object.entries(sourceInstances).slice(0, MAX_PANEL_INSTANCES)) {
    if (!isRecord(raw) || typeof raw.kind !== 'string' || !PANEL_KINDS.has(raw.kind as PanelKind)) {
      continue;
    }
    const kind = raw.kind as PanelKind;
    instances[id] = {
      id,
      kind,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : kind,
      minimized: raw.minimized === true,
      config: createPanelConfiguration(kind),
      ...(raw.floatingRect ? { floatingRect: clampFloatingRect(raw.floatingRect) } : {}),
    };
  }

  const requestedCount = Math.trunc(finite(value.columnCount, value.columns.length));
  const columnCount = Math.min(MAX_PANEL_COLUMNS, Math.max(MIN_PANEL_COLUMNS, requestedCount));
  const seen = new Set<string>();
  const columns = value.columns.slice(0, columnCount).map((rawColumn, index) => {
    const column = isRecord(rawColumn) ? rawColumn : {};
    const panelIds = Array.isArray(column.panelIds)
      ? column.panelIds.filter((id): id is string => {
          if (typeof id !== 'string' || !instances[id] || seen.has(id)) return false;
          seen.add(id);
          delete instances[id]!.floatingRect;
          return true;
        })
      : [];
    return {
      id: typeof column.id === 'string' ? column.id : `column-${index + 1}`,
      width: finite(column.width, 100 / columnCount),
      panelIds,
    };
  });
  while (columns.length < columnCount) {
    columns.push({ id: `column-${columns.length + 1}`, width: 100 / columnCount, panelIds: [] });
  }

  const floatingPanelIds = Array.isArray(value.floatingPanelIds)
    ? value.floatingPanelIds.filter((id): id is string => {
        if (typeof id !== 'string' || !instances[id] || seen.has(id)) return false;
        seen.add(id);
        instances[id]!.floatingRect = clampFloatingRect(instances[id]!.floatingRect);
        return true;
      })
    : [];
  for (const id of Object.keys(instances)) {
    if (!seen.has(id)) {
      columns[0]!.panelIds.push(id);
      delete instances[id]!.floatingRect;
      seen.add(id);
    }
  }

  if (Object.keys(instances).length === 0) return createPanelPreset('classic');
  const equalWidth = 100 / columns.length;
  const totalWidth = columns.reduce((total, column) => total + Math.max(0.1, column.width), 0);
  for (const column of columns) {
    column.width = totalWidth > 0 ? (Math.max(0.1, column.width) / totalWidth) * 100 : equalWidth;
  }
  const terminalIds = Object.values(instances).filter((panel) => panel.kind === 'terminal').map((panel) => panel.id);
  const focusedPanelId = typeof value.focusedPanelId === 'string' && instances[value.focusedPanelId] ? value.focusedPanelId : null;
  const requestedOwner = typeof value.terminalOwnerPanelId === 'string' ? value.terminalOwnerPanelId : null;

  return {
    schemaVersion: PANEL_LAYOUT_SCHEMA_VERSION,
    name: typeof value.name === 'string' ? value.name.slice(0, 80) : 'Workspace',
    columnCount: columns.length,
    columns,
    floatingPanelIds,
    instances,
    focusedPanelId,
    terminalOwnerPanelId: requestedOwner && terminalIds.includes(requestedOwner) ? requestedOwner : terminalIds[0] ?? null,
    nextInstanceSequence: Math.max(1, Math.trunc(finite(value.nextInstanceSequence, Object.keys(instances).length + 1))),
    nextColumnSequence: Math.max(columns.length + 1, Math.trunc(finite(value.nextColumnSequence, columns.length + 1))),
  };
}

export function normalizePanelLayoutState(value: unknown): PanelLayoutState {
  const source = isRecord(value) ? value : {};
  const rawViews = isRecord(source.userViews) ? source.userViews : {};
  const userViews: Record<string, SavedPanelView> = {};
  for (const [id, rawView] of Object.entries(rawViews).slice(0, 20)) {
    if (!isRecord(rawView) || typeof rawView.name !== 'string' || id.startsWith('preset:')) continue;
    const now = new Date(0).toISOString();
    userViews[id] = {
      id,
      name: rawView.name.trim().slice(0, 60) || 'Saved view',
      createdAt: typeof rawView.createdAt === 'string' ? rawView.createdAt : now,
      updatedAt: typeof rawView.updatedAt === 'string' ? rawView.updatedAt : now,
      document: normalizePanelLayoutDocument(rawView.document),
    };
  }
  const userViewOrder = Array.isArray(source.userViewOrder)
    ? source.userViewOrder.filter((id): id is string => typeof id === 'string' && Boolean(userViews[id]))
    : [];
  for (const id of Object.keys(userViews)) if (!userViewOrder.includes(id)) userViewOrder.push(id);
  return {
    activeLayout: normalizePanelLayoutDocument(source.activeLayout),
    activeSourceViewId:
      typeof source.activeSourceViewId === 'string' &&
      (source.activeSourceViewId.startsWith('preset:') || Boolean(userViews[source.activeSourceViewId]))
        ? source.activeSourceViewId
        : null,
    activeLayoutDirty: source.activeLayoutDirty === true,
    userViews,
    userViewOrder,
  };
}

export function getPanelLayoutInvariantErrors(document: PanelLayoutDocument): string[] {
  const errors: string[] = [];
  if (document.columnCount !== document.columns.length || document.columnCount < 1 || document.columnCount > 4) errors.push('invalid column count');
  const placements = [...document.columns.flatMap((column) => column.panelIds), ...document.floatingPanelIds];
  if (new Set(placements).size !== placements.length) errors.push('duplicate placement');
  if (placements.length !== Object.keys(document.instances).length) errors.push('instances must be placed exactly once');
  if (placements.some((id) => !document.instances[id])) errors.push('placement references missing instance');
  if (document.terminalOwnerPanelId && document.instances[document.terminalOwnerPanelId]?.kind !== 'terminal') errors.push('terminal owner is invalid');
  return errors;
}

export function migrateLegacyPanelLayout(
  uiShell: Partial<UiShellState> | undefined
): PanelLayoutState {
  const workspaceKind = (uiShell?.workspaceTab ?? 'terminal') as WorkspaceTab;
  const inspectorKind = uiShell?.inspectorView ?? 'registers';
  const kinds: PanelKind[] = [workspaceKind, inspectorKind];
  if (kinds[0] === kinds[1]) kinds[1] = kinds[0] === 'terminal' ? 'registers' : 'terminal';
  if (uiShell?.contextOpen && uiShell.contextView === 'help') kinds.push('help');
  const widthSource = kinds.length === 3
    ? uiShell?.layout?.rootHorizontalWithContext
    : uiShell?.layout?.rootHorizontal;
  const widths = widthSource && widthSource.length === kinds.length
    ? [...widthSource]
    : kinds.map(() => 100 / kinds.length);
  const instances: PanelLayoutDocument['instances'] = {};
  const columns = kinds.map((kind, index) => {
    const id = `panel-${kind}-${index + 1}`;
    instances[id] = {
      id,
      kind,
      title: getPanelDefaultTitle(kind),
      minimized: false,
      config: createPanelConfiguration(kind),
    };
    return { id: `column-${index + 1}`, width: widths[index]!, panelIds: [id] };
  });
  return normalizePanelLayoutState({
    activeLayout: {
      schemaVersion: PANEL_LAYOUT_SCHEMA_VERSION,
      name: 'Migrated workspace',
      columnCount: columns.length,
      columns,
      floatingPanelIds: [],
      instances,
      focusedPanelId: columns[0]?.panelIds[0] ?? null,
      terminalOwnerPanelId: Object.values(instances).find((panel) => panel.kind === 'terminal')?.id ?? null,
      nextInstanceSequence: kinds.length + 1,
      nextColumnSequence: kinds.length + 1,
    },
  });
}
