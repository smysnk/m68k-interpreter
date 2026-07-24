import { clampFloatingRect } from '@/store/panelLayoutValidation';
import type {
  FloatingPanelRect,
  PanelColumnId,
  PanelInstanceId,
  PanelLayoutDocument,
} from '@/store/panelLayoutTypes';

export type PanelDockRelation = 'before' | 'between' | 'after' | 'empty';

export interface PanelDockTarget {
  id: string;
  columnId: PanelColumnId;
  columnIndex: number;
  index: number;
  relation: PanelDockRelation;
  beforePanelId?: PanelInstanceId;
  afterPanelId?: PanelInstanceId;
}

export type PanelDragSource =
  | { kind: 'docked'; columnId: PanelColumnId; index: number }
  | { kind: 'floating'; rect: FloatingPanelRect };

export interface PanelDragSession {
  panelId: PanelInstanceId;
  source: PanelDragSource;
  pointerOffset: { x: number; y: number };
  measuredSize: { width: number; height: number };
  initialClientRect: FloatingPanelRect;
}

export function createPanelDockTargetId(target: Pick<PanelDockTarget, 'columnId' | 'index'>): string {
  return `dock:${encodeURIComponent(target.columnId)}:${target.index}`;
}

export function createPanelDockTargets(
  document: PanelLayoutDocument,
  columnId: PanelColumnId,
  columnIndex: number,
): PanelDockTarget[] {
  const column = document.columns.find((candidate) => candidate.id === columnId);
  if (!column) return [];
  if (column.panelIds.length === 0) {
    const target = { columnId, columnIndex, index: 0, relation: 'empty' as const };
    return [{ ...target, id: createPanelDockTargetId(target) }];
  }
  return Array.from({ length: column.panelIds.length + 1 }, (_, index) => {
    const relation: PanelDockRelation =
      index === 0 ? 'before' : index === column.panelIds.length ? 'after' : 'between';
    const target = {
      columnId,
      columnIndex,
      index,
      relation,
      beforePanelId: index > 0 ? column.panelIds[index - 1] : undefined,
      afterPanelId: index < column.panelIds.length ? column.panelIds[index] : undefined,
    };
    return { ...target, id: createPanelDockTargetId(target) };
  });
}

export function getPanelDragSource(
  document: PanelLayoutDocument,
  panelId: PanelInstanceId,
): PanelDragSource | null {
  const floating = document.instances[panelId]?.floatingRect;
  if (document.floatingPanelIds.includes(panelId) && floating) {
    return { kind: 'floating', rect: floating };
  }
  for (const column of document.columns) {
    const index = column.panelIds.indexOf(panelId);
    if (index >= 0) return { kind: 'docked', columnId: column.id, index };
  }
  return null;
}

export function normalizePanelDockIndex(
  source: PanelDragSource,
  target: PanelDockTarget,
): number {
  if (source.kind !== 'docked' || source.columnId !== target.columnId) return target.index;
  return source.index < target.index ? Math.max(0, target.index - 1) : target.index;
}

export function isNoOpPanelDock(source: PanelDragSource, target: PanelDockTarget): boolean {
  return source.kind === 'docked' &&
    source.columnId === target.columnId &&
    source.index === normalizePanelDockIndex(source, target);
}

export function calculateDroppedFloatingRect({
  delta,
  initialClientRect,
  layerClientRect,
}: {
  delta: { x: number; y: number };
  initialClientRect: FloatingPanelRect;
  layerClientRect: { x: number; y: number; width: number; height: number };
}): FloatingPanelRect {
  const width = Math.min(initialClientRect.width, Math.max(280, layerClientRect.width));
  const height = Math.min(initialClientRect.height, Math.max(180, layerClientRect.height));
  const unclamped = clampFloatingRect({
    x: initialClientRect.x + delta.x - layerClientRect.x,
    y: initialClientRect.y + delta.y - layerClientRect.y,
    width,
    height,
  });
  return {
    ...unclamped,
    x: Math.min(unclamped.x, Math.max(0, layerClientRect.width - 48)),
    y: Math.min(unclamped.y, Math.max(0, layerClientRect.height - 40)),
  };
}

export function describePanelDockTarget(
  target: PanelDockTarget,
  panelTitle: string,
  document: PanelLayoutDocument,
): string {
  const beforeTitle = target.beforePanelId ? document.instances[target.beforePanelId]?.title : null;
  const afterTitle = target.afterPanelId ? document.instances[target.afterPanelId]?.title : null;
  const column = target.columnIndex + 1;
  if (target.relation === 'empty') return `Dock ${panelTitle} in empty column ${column}`;
  if (beforeTitle && afterTitle) return `Dock ${panelTitle} between ${beforeTitle} and ${afterTitle} in column ${column}`;
  if (afterTitle) return `Dock ${panelTitle} before ${afterTitle} in column ${column}`;
  if (beforeTitle) return `Dock ${panelTitle} after ${beforeTitle} in column ${column}`;
  return `Dock ${panelTitle} in column ${column}`;
}
