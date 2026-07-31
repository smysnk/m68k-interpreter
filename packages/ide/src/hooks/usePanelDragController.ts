import React from 'react';
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { useDispatch } from 'react-redux';
import { getPanelDomIds } from '@/panels/panelRegistry';
import {
  calculateDroppedFloatingRect,
  describePanelDockTarget,
  getPanelDragSource,
  isNoOpPanelDock,
  normalizePanelDockIndex,
  type PanelDockTarget,
  type PanelDragSession,
} from '@/panels/panelDragModel';
import { recordPanelWorkspaceDrag } from '@/runtime/idePerformanceTelemetry';
import {
  floatPanel,
  moveFloatingPanel,
  movePanel,
  type AppDispatch,
  type PanelLayoutDocument,
} from '@/store';

type DragOutcome = 'dock' | 'float' | 'noop';

export const panelKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.code)) return;
  const targets = args.context.droppableContainers
    .getEnabled()
    .filter((container) => container.data.current?.type === 'panel-dock-target')
    .sort((left, right) => {
      const leftTarget = left.data.current?.dockTarget as PanelDockTarget;
      const rightTarget = right.data.current?.dockTarget as PanelDockTarget;
      return leftTarget.columnIndex - rightTarget.columnIndex || leftTarget.index - rightTarget.index;
    });
  if (targets.length === 0) return args.currentCoordinates;
  event.preventDefault();
  const currentIndex = targets.findIndex((target) => target.id === args.context.over?.id);
  const direction = event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 1;
  const nextIndex =
    currentIndex < 0
      ? direction < 0 ? targets.length - 1 : 0
      : Math.max(0, Math.min(targets.length - 1, currentIndex + direction));
  const nextTarget = targets[nextIndex]!;
  const rect =
    args.context.droppableRects.get(nextTarget.id) ??
    nextTarget.rect.current;
  return rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : args.currentCoordinates;
};

function eventPoint(event: Event, rect: PanelDragSession['initialClientRect']): { x: number; y: number } {
  if ('clientX' in event && 'clientY' in event) {
    return { x: Number(event.clientX), y: Number(event.clientY) };
  }
  return { x: rect.x + rect.width / 2, y: rect.y + 20 };
}

export function usePanelDragController(document: PanelLayoutDocument) {
  const dispatch = useDispatch<AppDispatch>();
  const workspaceRef = React.useRef<HTMLDivElement | null>(null);
  const floatingLayerRef = React.useRef<HTMLDivElement | null>(null);
  const [session, setSession] = React.useState<PanelDragSession | null>(null);
  const [activeDockTarget, setActiveDockTarget] = React.useState<PanelDockTarget | null>(null);
  const sessionRef = React.useRef<PanelDragSession | null>(null);
  const dragStartedAtRef = React.useRef(0);
  const keyboardDragRef = React.useRef(false);
  const frameRequestRef = React.useRef<number | null>(null);
  const lastFrameAtRef = React.useRef<number | null>(null);
  const frameIntervalsRef = React.useRef<number[]>([]);

  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    const droppableContainers = args.droppableContainers.filter(
      (container) => container.data.current?.type === 'panel-dock-target',
    );
    if (droppableContainers.length === 0) return [];
    const filteredArgs = { ...args, droppableContainers };
    return keyboardDragRef.current
      ? closestCenter(filteredArgs)
      : pointerWithin(filteredArgs);
  }, []);

  const startFrameSampling = React.useCallback((): void => {
    frameIntervalsRef.current = [];
    lastFrameAtRef.current = null;
    const sample = (timestamp: number): void => {
      if (lastFrameAtRef.current !== null) {
        frameIntervalsRef.current.push(timestamp - lastFrameAtRef.current);
      }
      lastFrameAtRef.current = timestamp;
      frameRequestRef.current = window.requestAnimationFrame(sample);
    };
    frameRequestRef.current = window.requestAnimationFrame(sample);
  }, []);

  const stopFrameSampling = React.useCallback((): number[] => {
    if (frameRequestRef.current !== null) window.cancelAnimationFrame(frameRequestRef.current);
    frameRequestRef.current = null;
    lastFrameAtRef.current = null;
    return frameIntervalsRef.current;
  }, []);

  const finishTelemetry = React.useCallback((kind: 'cancel' | 'drop', outcome?: DragOutcome): void => {
    recordPanelWorkspaceDrag(kind, {
      durationMs: Math.max(0, performance.now() - dragStartedAtRef.current),
      outcome,
      frameIntervalsMs: stopFrameSampling(),
    });
  }, [stopFrameSampling]);

  const clearSession = React.useCallback((): void => {
    sessionRef.current = null;
    setSession(null);
    setActiveDockTarget(null);
    keyboardDragRef.current = false;
  }, []);

  const onDragStart = React.useCallback((event: DragStartEvent): void => {
    const panelId = String(event.active.id);
    const source = getPanelDragSource(document, panelId);
    const activatorTarget = event.activatorEvent.target;
    const activatedPanel =
      activatorTarget instanceof Element
        ? activatorTarget.closest<HTMLElement>('[data-panel-instance-id]')
        : null;
    const initial =
      event.active.rect.current.initial ??
      activatedPanel?.getBoundingClientRect() ??
      null;
    if (!source || !initial) return;
    const initialClientRect = {
      x: initial.left,
      y: initial.top,
      width: initial.width,
      height: initial.height,
    };
    const point = eventPoint(event.activatorEvent, initialClientRect);
    const nextSession: PanelDragSession = {
      panelId,
      source,
      pointerOffset: {
        x: point.x - initialClientRect.x,
        y: point.y - initialClientRect.y,
      },
      measuredSize: { width: initial.width, height: initial.height },
      initialClientRect,
    };
    keyboardDragRef.current = event.activatorEvent instanceof KeyboardEvent;
    sessionRef.current = nextSession;
    setSession(nextSession);
    setActiveDockTarget(null);
    dragStartedAtRef.current = performance.now();
    startFrameSampling();
    recordPanelWorkspaceDrag('start');
  }, [document, startFrameSampling]);

  const onDragOver = React.useCallback((event: DragOverEvent): void => {
    const target = event.over?.data.current?.dockTarget as PanelDockTarget | undefined;
    setActiveDockTarget(target ?? null);
  }, []);

  const onDragEnd = React.useCallback((event: DragEndEvent): void => {
    const activeSession = sessionRef.current;
    if (!activeSession) {
      clearSession();
      return;
    }
    const target = event.over?.data.current?.dockTarget as PanelDockTarget | undefined;
    let outcome: DragOutcome = 'noop';
    if (target) {
      if (!isNoOpPanelDock(activeSession.source, target)) {
        dispatch(movePanel({
          panelId: activeSession.panelId,
          columnId: target.columnId,
          index: normalizePanelDockIndex(activeSession.source, target),
        }));
        outcome = 'dock';
      }
    } else {
      const layerRect =
        floatingLayerRef.current?.getBoundingClientRect() ??
        workspaceRef.current?.getBoundingClientRect();
      if (layerRect) {
        const rect = calculateDroppedFloatingRect({
          delta: event.delta,
          initialClientRect: activeSession.initialClientRect,
          layerClientRect: layerRect,
        });
        if (activeSession.source.kind === 'floating') {
          dispatch(moveFloatingPanel({ panelId: activeSession.panelId, rect }));
        } else {
          dispatch(floatPanel({ panelId: activeSession.panelId, rect }));
        }
        outcome = 'float';
      }
    }
    finishTelemetry('drop', outcome);
    window.requestAnimationFrame(() => {
      window.document
        .getElementById(getPanelDomIds(activeSession.panelId).frameId)
        ?.querySelector<HTMLElement>('.panel-drag-activator-sr-only')
        ?.focus();
    });
    clearSession();
  }, [clearSession, dispatch, finishTelemetry]);

  const onDragCancel = React.useCallback((_event: DragCancelEvent): void => {
    if (sessionRef.current) finishTelemetry('cancel');
    clearSession();
  }, [clearSession, finishTelemetry]);

  React.useEffect(() => () => {
    if (frameRequestRef.current !== null) window.cancelAnimationFrame(frameRequestRef.current);
  }, []);

  const announcements = React.useMemo(() => ({
    onDragStart: ({ active }: { active: { data: { current?: Record<string, unknown> } } }) =>
      `Picked up ${String(active.data.current?.title ?? 'panel')}. Move to an indicated dock target or release elsewhere to float.`,
    onDragOver: ({ active, over }: {
      active: { data: { current?: Record<string, unknown> } };
      over: { data: { current?: Record<string, unknown> } } | null;
    }) => {
      const target = over?.data.current?.dockTarget as PanelDockTarget | undefined;
      return target
        ? describePanelDockTarget(target, String(active.data.current?.title ?? 'panel'), document)
        : 'Outside a dock target. Releasing will leave the panel floating.';
    },
    onDragEnd: ({ active, over }: {
      active: { data: { current?: Record<string, unknown> } };
      over: { data: { current?: Record<string, unknown> } } | null;
    }) => {
      const target = over?.data.current?.dockTarget as PanelDockTarget | undefined;
      return target
        ? describePanelDockTarget(target, String(active.data.current?.title ?? 'panel'), document)
        : `${String(active.data.current?.title ?? 'Panel')} is floating.`;
    },
    onDragCancel: ({ active }: { active: { data: { current?: Record<string, unknown> } } }) =>
      `Cancelled moving ${String(active.data.current?.title ?? 'panel')}.`,
  }), [document]);

  return {
    activeDockTarget,
    announcements,
    collisionDetection,
    floatingLayerRef,
    onDragCancel,
    onDragEnd,
    onDragOver,
    onDragStart,
    screenReaderInstructions: {
      draggable: 'Press Space or Enter to pick up a panel. Use arrow keys to move between dock targets, Enter to drop, or Escape to cancel.',
    },
    session,
    workspaceRef,
  };
}
