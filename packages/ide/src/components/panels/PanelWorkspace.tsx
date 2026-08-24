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
  commitPanelSizes,
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

  const handlePanelLayout = (columnId: string, panelIds: string[], layout: Layout): void => {
    const expandedPanelIds = panelIds.filter((panelId) => !document.instances[panelId]?.minimized);
    if (expandedPanelIds.length < 2) return;
    const sizes = Object.fromEntries(
      expandedPanelIds.map((panelId) => [panelId, layout[panelId]])
    ) as Record<string, number | undefined>;
    if (expandedPanelIds.some((panelId) => typeof sizes[panelId] !== 'number')) return;
    const total = expandedPanelIds.reduce((sum, panelId) => sum + sizes[panelId]!, 0);
    if (total <= 0) return;
    const normalized = Object.fromEntries(
      panelIds.map((panelId) => [
        panelId,
        document.instances[panelId]?.minimized
          ? (document.columns.find((column) => column.id === columnId)?.panelSizes[panelId] ?? 1)
          : (sizes[panelId]! / total) * 100,
      ])
    );
    const column = document.columns.find((candidate) => candidate.id === columnId);
    const changed = panelIds.some(
      (panelId) => Math.abs(normalized[panelId]! - (column?.panelSizes[panelId] ?? 0)) > 0.05
    );
    if (changed) dispatch(commitPanelSizes({ columnId, panelSizes: normalized }));
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
                    {column.panelIds.some((panelId) =>
                      document.instances[panelId]?.kind.startsWith('hardware-')
                    ) ? (
                      <>
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
                      </>
                    ) : column.panelIds.length > 0 ? (
                      <Group
                        className="panel-row-group"
                        onLayoutChanged={(layout) =>
                          handlePanelLayout(column.id, column.panelIds, layout)
                        }
                        orientation="vertical"
                        resizeTargetMinimumSize={{ coarse: 24, fine: 12 }}
                      >
                        {column.panelIds.map((panelId, panelIndex) => {
                          const instance = document.instances[panelId];
                          if (!instance) return null;
                          const previous =
                            document.instances[column.panelIds[panelIndex - 1] ?? ''];
                          return (
                            <React.Fragment key={panelId}>
                              {panelIndex > 0 ? (
                                <Separator
                                  aria-label={`Resize ${previous?.title ?? 'panel'} and ${instance.title}`}
                                  className="panel-row-separator"
                                  data-testid={`panel-row-separator-${column.id}-${panelIndex}`}
                                  disabled={Boolean(
                                    drag.session || previous?.minimized || instance.minimized
                                  )}
                                >
                                  <PanelDockZone
                                    active={drag.activeDockTarget?.id === targets[panelIndex]?.id}
                                    document={document}
                                    enabled={Boolean(drag.session)}
                                    panelTitle={activeInstance?.title ?? 'Panel'}
                                    target={targets[panelIndex]!}
                                  />
                                </Separator>
                              ) : null}
                              <Panel
                                defaultSize={
                                  instance.minimized
                                    ? '40px'
                                    : `${column.panelSizes[panelId] ?? 100 / column.panelIds.length}`
                                }
                                disabled={instance.minimized}
                                id={panelId}
                                maxSize={instance.minimized ? '40px' : undefined}
                                minSize={instance.minimized ? '40px' : '12%'}
                              >
                                <div className="panel-row-content">
                                  {panelIndex === 0 ? (
                                    <PanelDockZone
                                      active={drag.activeDockTarget?.id === targets[0]?.id}
                                      document={document}
                                      enabled={Boolean(drag.session)}
                                      panelTitle={activeInstance?.title ?? 'Panel'}
                                      target={targets[0]!}
                                    />
                                  ) : null}
                                  <PanelFrame
                                    instance={instance}
                                    interactive={document.terminalOwnerPanelId === panelId}
                                  />
                                  {panelIndex === column.panelIds.length - 1 ? (
                                    <PanelDockZone
                                      active={
                                        drag.activeDockTarget?.id === targets[panelIndex + 1]?.id
                                      }
                                      document={document}
                                      enabled={Boolean(drag.session)}
                                      panelTitle={activeInstance?.title ?? 'Panel'}
                                      target={targets[panelIndex + 1]!}
                                    />
                                  ) : null}
                                </div>
                              </Panel>
                            </React.Fragment>
                          );
                        })}
                      </Group>
                    ) : null}
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
