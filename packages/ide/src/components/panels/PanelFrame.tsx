import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useDispatch } from 'react-redux';
import { PANEL_REGISTRY, getPanelDomIds } from '@/panels/panelRegistry';
import {
  closePanel, duplicatePanel, floatPanel, focusPanel, movePanel, setTerminalOwner,
  togglePanelMinimized, type AppDispatch, type PanelColumn, type PanelInstance,
} from '@/store';
import PanelRenderer from './PanelRenderer';

interface Props {
  columns: PanelColumn[];
  draggableEnabled?: boolean;
  floating?: boolean;
  instance: PanelInstance;
  interactive: boolean;
}

export default function PanelFrame({ columns, draggableEnabled = true, floating = false, instance, interactive }: Props): React.ReactElement {
  const draggable = useDraggable({
    id: instance.id,
    data: { type: 'panel', panelId: instance.id, title: instance.title, floating },
    disabled: !draggableEnabled,
  });
  return (
    <PanelFrameView
      columns={columns}
      drag={draggable}
      floating={floating}
      instance={instance}
      interactive={interactive}
    />
  );
}

function PanelFrameView({
  columns,
  drag,
  floating = false,
  instance,
  interactive,
}: Props & { drag: ReturnType<typeof useDraggable> }): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const entry = PANEL_REGISTRY[instance.kind];
  const integratedHeader = instance.minimized ? undefined : entry.integratedHeader;
  const ids = getPanelDomIds(instance.id);
  const currentColumnIndex = columns.findIndex((column) => column.panelIds.includes(instance.id));
  const currentColumn = columns[currentColumnIndex];
  const currentRow = currentColumn?.panelIds.indexOf(instance.id) ?? -1;
  const moveBy = (offset: number): void => {
    if (!currentColumn || currentRow < 0) return;
    dispatch(movePanel({ panelId: instance.id, columnId: currentColumn.id, index: Math.max(0, currentRow + offset) }));
  };

  return (
    <article
      className={`panel-frame ${instance.minimized ? 'panel-frame-minimized' : ''} ${floating ? 'panel-frame-floating' : ''} ${drag.isDragging ? 'panel-frame-dragging' : ''}`}
      data-panel-dragging={drag.isDragging ? 'true' : 'false'}
      data-panel-instance-id={instance.id}
      data-panel-kind={instance.kind}
      data-testid={ids.testId}
      id={ids.frameId}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest('.panel-frame-header')) {
          dispatch(focusPanel(instance.id));
        }
      }}
      ref={drag.setNodeRef}
    >
      <header
        className={`panel-frame-header ${integratedHeader ? 'panel-frame-header-integrated' : ''}`.trim()}
        data-panel-drag-activator={instance.id}
        id={ids.headerId}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('button, summary, input, select, textarea, a, [contenteditable="true"]')) return;
          drag.listeners?.onPointerDown?.(event);
        }}
      >
        <button
          aria-label={`Drag ${instance.title} panel`}
          className="panel-drag-handle"
          ref={drag.setActivatorNodeRef}
          type="button"
          {...drag.attributes}
          {...drag.listeners}
        >⠇</button>
        {integratedHeader ? (
          <div className="pane-title-group panel-frame-integrated-title">
            <p className="pane-eyebrow">{integratedHeader.eyebrow}</p>
            <h2 className="pane-title">{integratedHeader.title}</h2>
            <p className="pane-caption">{integratedHeader.caption}</p>
          </div>
        ) : (
          <>
            <span aria-hidden="true" className="panel-kind-icon">{entry.icon}</span>
            <h2>{instance.title}</h2>
            {instance.kind === 'terminal' ? (
              <span className={`panel-owner-badge ${interactive ? 'active' : ''}`}>{interactive ? 'Interactive' : 'Mirror'}</span>
            ) : null}
          </>
        )}
        {!instance.minimized && entry.HeaderAccessory ? (
          <div
            className="panel-frame-header-accessory"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <entry.HeaderAccessory instance={instance} />
          </div>
        ) : null}
        <div
          aria-label={`${instance.title} panel controls`}
          className="panel-frame-actions"
          onPointerDown={(event) => event.stopPropagation()}
          role="toolbar"
        >
          <button aria-controls={ids.bodyId} aria-expanded={!instance.minimized} aria-label={`${instance.minimized ? 'Restore' : 'Minimize'} ${instance.title}`} onClick={() => dispatch(togglePanelMinimized(instance.id))} type="button">
            {instance.minimized ? '+' : '−'}
          </button>
          {entry.canDuplicate ? (
            <button aria-label={`Duplicate ${instance.title}`} onClick={() => dispatch(duplicatePanel({ sourcePanelId: instance.id, target: currentColumn ? { columnId: currentColumn.id, index: currentRow + 1 } : undefined }))} type="button">□</button>
          ) : null}
          {entry.canFloat ? (
            <button aria-label={`${floating ? 'Dock' : 'Float'} ${instance.title}`} onClick={() => floating ? dispatch(movePanel({ panelId: instance.id, columnId: columns[0]!.id })) : dispatch(floatPanel({ panelId: instance.id }))} type="button">{floating ? '↲' : '↗'}</button>
          ) : null}
          <details className="panel-action-menu">
            <summary aria-label={`More actions for ${instance.title}`}>⋮</summary>
            <div className="panel-action-menu-popover">
              <button disabled={floating || currentRow <= 0} onClick={() => moveBy(-1)} type="button">Move up</button>
              <button disabled={floating || !currentColumn || currentRow >= currentColumn.panelIds.length - 1} onClick={() => moveBy(1)} type="button">Move down</button>
              {columns.map((column, index) => <button key={column.id} onClick={() => dispatch(movePanel({ panelId: instance.id, columnId: column.id }))} type="button">Move to column {index + 1}</button>)}
              {instance.kind === 'terminal' && !interactive ? <button onClick={() => dispatch(setTerminalOwner(instance.id))} type="button">Make interactive</button> : null}
            </div>
          </details>
          <button aria-label={`Close ${instance.title}`} onClick={() => dispatch(closePanel(instance.id))} type="button">×</button>
        </div>
      </header>
      {!instance.minimized ? <PanelRenderer instance={instance} interactive={interactive} /> : null}
    </article>
  );
}
