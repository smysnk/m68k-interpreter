import { clampFloatingRect } from '@/store/panelLayoutValidation';
import type {
  FloatingPanelRect,
  PanelColumnId,
  PanelCreateTarget,
  PanelInstanceId,
  PanelKind,
  PanelLayoutDocument,
} from '@/store/panelLayoutTypes';
import { PANEL_KIND_DEFINITIONS } from '@/store/panelLayoutTypes';

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

function eventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function nearestColumnElement(
  workspaceElement: HTMLElement,
  target: Element | null,
  clientX: number
): HTMLElement | null {
  const containingColumn = target?.closest<HTMLElement>('[data-panel-column-id]');
  if (containingColumn && workspaceElement.contains(containingColumn)) return containingColumn;

  return (
    Array.from(workspaceElement.querySelectorAll<HTMLElement>('[data-panel-column-id]')).reduce<{
      distance: number;
      element: HTMLElement;
    } | null>((nearest, element) => {
      const rect = element.getBoundingClientRect();
      const distance =
        clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      return !nearest || distance < nearest.distance ? { distance, element } : nearest;
    }, null)?.element ?? null
  );
}

export function resolvePanelCreateTarget({
  clientX,
  clientY,
  compact = false,
  document,
  eventTarget,
  workspaceElement,
}: {
  clientX: number;
  clientY: number;
  compact?: boolean;
  document: PanelLayoutDocument;
  eventTarget: EventTarget | null;
  workspaceElement: HTMLElement;
}): PanelCreateTarget {
  if (compact) {
    for (const column of document.columns) {
      const focusedIndex = document.focusedPanelId
        ? column.panelIds.indexOf(document.focusedPanelId)
        : -1;
      if (focusedIndex >= 0) return { columnId: column.id, index: focusedIndex + 1 };
    }
    return { columnId: document.columns[0]?.id, index: 0 };
  }

  const target = eventElement(eventTarget);
  const panelElement = target?.closest<HTMLElement>('[data-panel-instance-id]');
  const panelId = panelElement?.dataset.panelInstanceId;
  if (panelId && document.floatingPanelIds.includes(panelId)) {
    const workspaceRect = workspaceElement.getBoundingClientRect();
    return {
      floatingRect: clampFloatingRect({
        height: 420,
        width: 520,
        x: clientX - workspaceRect.left + 12,
        y: clientY - workspaceRect.top + 12,
      }),
    };
  }

  const columnElement = nearestColumnElement(workspaceElement, target, clientX);
  const columnId = columnElement?.dataset.panelColumnId;
  const column = document.columns.find((candidate) => candidate.id === columnId);
  if (!column || !columnElement) return {};

  for (let index = 0; index < column.panelIds.length; index += 1) {
    const id = column.panelIds[index]!;
    const element = Array.from(
      columnElement.querySelectorAll<HTMLElement>('[data-panel-instance-id]')
    ).find(
      (candidate) =>
        candidate.dataset.panelInstanceId === id &&
        candidate.closest('[data-panel-column-id]') === columnElement
    );
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return { columnId: column.id, index };
  }

  return { columnId: column.id, index: column.panelIds.length };
}

export function fitPanelCreateTargetForKind({
  kind,
  target,
  workspaceHeight,
  workspaceWidth,
}: {
  kind: PanelKind;
  target: PanelCreateTarget;
  workspaceHeight: number;
  workspaceWidth: number;
}): PanelCreateTarget {
  if (!target.floatingRect) return target;
  const minimum = PANEL_KIND_DEFINITIONS[kind].minimumFloatingSize;
  const width = Math.min(
    Math.max(target.floatingRect.width, minimum.width),
    Math.max(280, workspaceWidth)
  );
  const height = Math.min(
    Math.max(target.floatingRect.height, minimum.height),
    Math.max(180, workspaceHeight)
  );
  return {
    floatingRect: {
      height,
      width,
      x: Math.min(Math.max(0, target.floatingRect.x), Math.max(0, workspaceWidth - width)),
      y: Math.min(Math.max(0, target.floatingRect.y), Math.max(0, workspaceHeight - height)),
    },
  };
}

export function createPanelDockTargetId(
  target: Pick<PanelDockTarget, 'columnId' | 'index'>
): string {
  return `dock:${encodeURIComponent(target.columnId)}:${target.index}`;
}

export function createPanelDockTargets(
  document: PanelLayoutDocument,
  columnId: PanelColumnId,
  columnIndex: number
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
  panelId: PanelInstanceId
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

export function normalizePanelDockIndex(source: PanelDragSource, target: PanelDockTarget): number {
  if (source.kind !== 'docked' || source.columnId !== target.columnId) return target.index;
  return source.index < target.index ? Math.max(0, target.index - 1) : target.index;
}

export function isNoOpPanelDock(source: PanelDragSource, target: PanelDockTarget): boolean {
  return (
    source.kind === 'docked' &&
    source.columnId === target.columnId &&
    source.index === normalizePanelDockIndex(source, target)
  );
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
  document: PanelLayoutDocument
): string {
  const beforeTitle = target.beforePanelId ? document.instances[target.beforePanelId]?.title : null;
  const afterTitle = target.afterPanelId ? document.instances[target.afterPanelId]?.title : null;
  const column = target.columnIndex + 1;
  if (target.relation === 'empty') return `Dock ${panelTitle} in empty column ${column}`;
  if (beforeTitle && afterTitle)
    return `Dock ${panelTitle} between ${beforeTitle} and ${afterTitle} in column ${column}`;
  if (afterTitle) return `Dock ${panelTitle} before ${afterTitle} in column ${column}`;
  if (beforeTitle) return `Dock ${panelTitle} after ${beforeTitle} in column ${column}`;
  return `Dock ${panelTitle} in column ${column}`;
}
