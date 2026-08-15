import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useDispatch } from 'react-redux';
import { PANEL_REGISTRY, getPanelDomIds } from '@/panels/panelRegistry';
import {
  closePanel,
  focusPanel,
  togglePanelMinimized,
  type AppDispatch,
  type PanelInstance,
} from '@/store';
import PanelRenderer from './PanelRenderer';

interface Props {
  draggableEnabled?: boolean;
  floating?: boolean;
  instance: PanelInstance;
  interactive: boolean;
}

export default function PanelFrame({
  draggableEnabled = true,
  floating = false,
  instance,
  interactive,
}: Props): React.ReactElement {
  const draggable = useDraggable({
    id: instance.id,
    data: { type: 'panel', panelId: instance.id, title: instance.title, floating },
    disabled: !draggableEnabled,
  });
  return (
    <PanelFrameView
      drag={draggable}
      floating={floating}
      instance={instance}
      interactive={interactive}
    />
  );
}

function PanelFrameView({
  drag,
  floating = false,
  instance,
  interactive,
}: Props & { drag: ReturnType<typeof useDraggable> }): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const entry = PANEL_REGISTRY[instance.kind];
  const integratedHeader = instance.minimized ? undefined : entry.integratedHeader;
  const ids = getPanelDomIds(instance.id);

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
      tabIndex={-1}
    >
      <header
        className={`panel-frame-header ${integratedHeader ? 'panel-frame-header-integrated' : ''}`.trim()}
        data-panel-drag-activator={instance.id}
        id={ids.headerId}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest('button, summary, input, select, textarea, a, [contenteditable="true"]')
          )
            return;
          drag.listeners?.onPointerDown?.(event);
        }}
      >
        <button
          aria-label={`Drag ${instance.title} panel`}
          className="panel-drag-activator-sr-only"
          ref={drag.setActivatorNodeRef}
          type="button"
          {...drag.attributes}
          {...drag.listeners}
        />
        {integratedHeader ? (
          <div className="pane-title-group panel-frame-integrated-title">
            <p className="pane-eyebrow">{integratedHeader.eyebrow}</p>
            <h2 className="pane-title">{integratedHeader.title}</h2>
            <p className="pane-caption">{integratedHeader.caption}</p>
          </div>
        ) : (
          <>
            <span aria-hidden="true" className="panel-kind-icon">
              {entry.icon}
            </span>
            <h2>{instance.title}</h2>
            {instance.kind === 'terminal' ? (
              <span className={`panel-owner-badge ${interactive ? 'active' : ''}`}>
                {interactive ? 'Interactive' : 'Mirror'}
              </span>
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
          <button
            aria-controls={ids.bodyId}
            aria-expanded={!instance.minimized}
            aria-label={`${instance.minimized ? 'Restore' : 'Minimize'} ${instance.title}`}
            onClick={() => dispatch(togglePanelMinimized(instance.id))}
            type="button"
          >
            {instance.minimized ? '+' : '−'}
          </button>
          <button
            aria-label={`Close ${instance.title}`}
            onClick={() => dispatch(closePanel(instance.id))}
            type="button"
          >
            ×
          </button>
        </div>
      </header>
      {!instance.minimized ? <PanelRenderer instance={instance} interactive={interactive} /> : null}
    </article>
  );
}
