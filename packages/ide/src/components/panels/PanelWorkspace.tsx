import React from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useDispatch, useSelector } from 'react-redux';
import {
  closeAppMenu,
  commitColumnWidths,
  selectActivePanelLayout,
  type AppDispatch,
} from '@/store';
import { useCompactShell } from '@/hooks/useCompactShell';
import { panelKeyboardCoordinates, usePanelDragController } from '@/hooks/usePanelDragController';
import { createPanelDockTargets, resolvePanelCreateTarget } from '@/panels/panelDragModel';
import FloatingPanelLayer from './FloatingPanelLayer';
import EmptyPanelColumn from './EmptyPanelColumn';
import PanelDockZone from './PanelDockZone';
import PanelDragOverlay from './PanelDragOverlay';
import PanelFrame from './PanelFrame';
import PanelRenderer from './PanelRenderer';
import PanelWorkspaceContextMenu, {
  type PendingPanelContextMenu,
} from './PanelWorkspaceContextMenu';

export default function PanelWorkspace(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const document = useSelector(selectActivePanelLayout);
  const compact = useCompactShell();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: panelKeyboardCoordinates })
  );
  const drag = usePanelDragController(document);
  const [pendingContextMenu, setPendingContextMenu] =
    React.useState<PendingPanelContextMenu | null>(null);
  const activeInstance = drag.session ? document.instances[drag.session.panelId] : undefined;

  const closeContextMenu = React.useCallback((): void => {
    setPendingContextMenu(null);
  }, []);

  const openContextMenu = React.useCallback(
    ({
      clientX,
      clientY,
      eventTarget,
      restoreFocusTo,
    }: {
      clientX: number;
      clientY: number;
      eventTarget: EventTarget | null;
      restoreFocusTo: HTMLElement | null;
    }): void => {
      const workspaceElement = drag.workspaceRef.current;
      if (!workspaceElement || drag.session) return;
      dispatch(closeAppMenu());
      setPendingContextMenu({
        anchor: { kind: 'point', x: clientX, y: clientY },
        restoreFocusTo,
        target: resolvePanelCreateTarget({
          clientX,
          clientY,
          compact,
          document,
          eventTarget,
          workspaceElement,
        }),
      });
    },
    [compact, dispatch, document, drag.session, drag.workspaceRef]
  );

  const workspaceInteractionProps = {
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      openContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        eventTarget: event.target,
        restoreFocusTo: event.target instanceof HTMLElement ? event.target : null,
      });
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
      event.preventDefault();
      const target = event.target instanceof HTMLElement ? event.target : null;
      const panel = target?.closest<HTMLElement>('[data-panel-instance-id]');
      const anchorRect =
        panel?.getBoundingClientRect() ?? drag.workspaceRef.current?.getBoundingClientRect();
      if (!anchorRect) return;
      openContextMenu({
        clientX: anchorRect.left + Math.min(32, anchorRect.width / 2),
        clientY: panel ? anchorRect.bottom - 1 : anchorRect.top + 32,
        eventTarget: panel ?? target,
        restoreFocusTo: target,
      });
    },
  };

  if (compact) {
    const focused = document.focusedPanelId
      ? document.instances[document.focusedPanelId]
      : undefined;
    const instance =
      focused ??
      Object.values(document.instances).find((panel) => !panel.minimized) ??
      Object.values(document.instances)[0];
    if (instance?.kind === 'terminal' && document.terminalOwnerPanelId === instance.id) {
      return (
        <div
          className="panel-workspace panel-workspace-compact panel-workspace-terminal-focus"
          data-testid="panel-workspace"
          ref={drag.workspaceRef}
          {...workspaceInteractionProps}
        >
          <PanelRenderer instance={instance} interactive />
          <PanelWorkspaceContextMenu
            onClose={closeContextMenu}
            pending={pendingContextMenu}
            workspaceElement={drag.workspaceRef.current}
          />
        </div>
      );
    }
    return (
      <div
        className="panel-workspace panel-workspace-compact"
        data-testid="panel-workspace"
        ref={drag.workspaceRef}
        {...workspaceInteractionProps}
      >
        {instance ? (
          <PanelFrame
            draggableEnabled={false}
            instance={instance}
            interactive={document.terminalOwnerPanelId === instance.id}
          />
        ) : null}
        <PanelWorkspaceContextMenu
          onClose={closeContextMenu}
          pending={pendingContextMenu}
          workspaceElement={drag.workspaceRef.current}
        />
      </div>
    );
  }

  const handleLayout = (layout: Layout): void => {
    const widths = document.columns
      .map((column) => layout[column.id])
      .filter((value): value is number => typeof value === 'number');
    const changed = widths.some(
      (width, index) => Math.abs(width - document.columns[index]!.width) > 0.05
    );
    if (widths.length === document.columns.length && changed) dispatch(commitColumnWidths(widths));
  };
  return (
    <div
      className="panel-workspace"
      data-panel-drag-active={drag.session ? 'true' : 'false'}
      data-testid="panel-workspace"
      ref={drag.workspaceRef}
      {...workspaceInteractionProps}
    >
      <DndContext
        accessibility={{
          announcements: drag.announcements,
          screenReaderInstructions: drag.screenReaderInstructions,
        }}
        collisionDetection={drag.collisionDetection}
        onDragCancel={drag.onDragCancel}
        onDragEnd={drag.onDragEnd}
        onDragOver={drag.onDragOver}
        onDragStart={drag.onDragStart}
        sensors={sensors}
      >
        <Group
          className="panel-column-group"
          onLayoutChanged={handleLayout}
          orientation="horizontal"
        >
          {document.columns.map((column, columnIndex) => {
            const targets = createPanelDockTargets(document, column.id, columnIndex);
            return (
              <React.Fragment key={column.id}>
                {columnIndex > 0 ? <Separator className="panel-column-separator" /> : null}
                <Panel defaultSize={`${column.width}`} id={column.id} minSize="16">
                  <section
                    className="panel-column"
                    data-panel-column-id={column.id}
                    data-testid={`panel-column-${columnIndex + 1}`}
                  >
                    <PanelDockZone
                      active={drag.activeDockTarget?.id === targets[0]?.id}
                      document={document}
                      enabled={Boolean(drag.session)}
                      panelTitle={activeInstance?.title ?? 'Panel'}
                      target={targets[0]!}
                    />
                    {column.panelIds.map((panelId, panelIndex) => {
                      const instance = document.instances[panelId];
                      return instance ? (
                        <React.Fragment key={panelId}>
                          <PanelFrame
                            instance={instance}
                            interactive={document.terminalOwnerPanelId === panelId}
                          />
                          <PanelDockZone
                            active={drag.activeDockTarget?.id === targets[panelIndex + 1]?.id}
                            document={document}
                            enabled={Boolean(drag.session)}
                            panelTitle={activeInstance?.title ?? 'Panel'}
                            target={targets[panelIndex + 1]!}
                          />
                        </React.Fragment>
                      ) : null;
                    })}
                    {column.panelIds.length === 0 ? (
                      <EmptyPanelColumn columnId={column.id} columnIndex={columnIndex} />
                    ) : null}
                  </section>
                </Panel>
              </React.Fragment>
            );
          })}
        </Group>
        <FloatingPanelLayer document={document} layerRef={drag.floatingLayerRef} />
        <DragOverlay adjustScale={false} dropAnimation={null} zIndex={100}>
          {drag.session && activeInstance ? (
            <PanelDragOverlay
              instance={activeInstance}
              interactive={document.terminalOwnerPanelId === activeInstance.id}
              session={drag.session}
            />
          ) : null}
        </DragOverlay>
        <PanelWorkspaceContextMenu
          onClose={closeContextMenu}
          pending={pendingContextMenu}
          workspaceElement={drag.workspaceRef.current}
        />
      </DndContext>
    </div>
  );
}
