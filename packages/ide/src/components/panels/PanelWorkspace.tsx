import React from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useDispatch, useSelector } from 'react-redux';
import {
  commitColumnWidths, createPanel, focusPanel, selectActivePanelLayout, type AppDispatch,
} from '@/store';
import { useCompactShell } from '@/hooks/useCompactShell';
import { panelKeyboardCoordinates, usePanelDragController } from '@/hooks/usePanelDragController';
import { createPanelDockTargets } from '@/panels/panelDragModel';
import FloatingPanelLayer from './FloatingPanelLayer';
import PanelDockZone from './PanelDockZone';
import PanelDragOverlay from './PanelDragOverlay';
import PanelFrame from './PanelFrame';
import PanelRenderer from './PanelRenderer';

export default function PanelWorkspace(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const document = useSelector(selectActivePanelLayout);
  const compact = useCompactShell();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: panelKeyboardCoordinates }),
  );
  const drag = usePanelDragController(document);
  const activeInstance = drag.session ? document.instances[drag.session.panelId] : undefined;

  if (compact) {
    const focused = document.focusedPanelId ? document.instances[document.focusedPanelId] : undefined;
    const instance = focused ?? Object.values(document.instances).find((panel) => !panel.minimized) ?? Object.values(document.instances)[0];
    if (instance?.kind === 'terminal' && document.terminalOwnerPanelId === instance.id) {
      return (
        <div className="panel-workspace panel-workspace-compact panel-workspace-terminal-focus" data-testid="panel-workspace">
          <PanelRenderer instance={instance} interactive />
        </div>
      );
    }
    return (
      <div className="panel-workspace panel-workspace-compact" data-testid="panel-workspace">
        <div className="compact-panel-switcher" role="tablist" aria-label="Open panels">
          {Object.values(document.instances).map((panel) => <button aria-selected={panel.id === instance?.id} key={panel.id} onClick={() => dispatch(focusPanel(panel.id))} role="tab" type="button">{panel.title}</button>)}
        </div>
        {instance ? <PanelFrame columns={document.columns} draggableEnabled={false} instance={instance} interactive={document.terminalOwnerPanelId === instance.id} /> : null}
      </div>
    );
  }

  const handleLayout = (layout: Layout): void => {
    const widths = document.columns.map((column) => layout[column.id]).filter((value): value is number => typeof value === 'number');
    const changed = widths.some((width, index) => Math.abs(width - document.columns[index]!.width) > 0.05);
    if (widths.length === document.columns.length && changed) dispatch(commitColumnWidths(widths));
  };
  return (
    <div
      className="panel-workspace"
      data-panel-drag-active={drag.session ? 'true' : 'false'}
      data-testid="panel-workspace"
      ref={drag.workspaceRef}
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
        <Group className="panel-column-group" onLayoutChanged={handleLayout} orientation="horizontal">
          {document.columns.map((column, columnIndex) => {
            const targets = createPanelDockTargets(document, column.id, columnIndex);
            return (
              <React.Fragment key={column.id}>
                {columnIndex > 0 ? <Separator className="panel-column-separator" /> : null}
                <Panel defaultSize={`${column.width}`} id={column.id} minSize="16">
                  <section className="panel-column" data-panel-column-id={column.id} data-testid={`panel-column-${columnIndex + 1}`}>
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
                          <PanelFrame columns={document.columns} instance={instance} interactive={document.terminalOwnerPanelId === panelId} />
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
                    {column.panelIds.length === 0 ? <button className="empty-panel-column" onClick={() => dispatch(createPanel({ kind: 'terminal', target: { columnId: column.id } }))} type="button">+ Add panel</button> : null}
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
      </DndContext>
    </div>
  );
}
