import React from 'react';
import { PANEL_REGISTRY } from '@/panels/panelRegistry';
import type { PanelDragSession } from '@/panels/panelDragModel';
import type { PanelInstance } from '@/store';

export default function PanelDragOverlay({
  instance,
  interactive,
  session,
}: {
  instance: PanelInstance;
  interactive: boolean;
  session: PanelDragSession;
}): React.ReactElement {
  const entry = PANEL_REGISTRY[instance.kind];
  const bodyHeight = instance.minimized
    ? 0
    : Math.max(70, Math.min(180, session.measuredSize.height - 40));
  return (
    <article
      aria-hidden="true"
      className={`panel-drag-overlay panel-frame ${instance.minimized ? 'panel-frame-minimized' : ''}`}
      data-panel-drag-overlay={instance.id}
      style={{
        width: Math.max(280, session.measuredSize.width),
        height: instance.minimized ? 40 : Math.min(session.measuredSize.height, 220),
      }}
    >
      <header className="panel-frame-header">
        <span aria-hidden="true" className="panel-kind-icon">{entry.icon}</span>
        <h2>{instance.title}</h2>
        {instance.kind === 'terminal' ? (
          <span className={`panel-owner-badge ${interactive ? 'active' : ''}`}>
            {interactive ? 'Interactive' : 'Mirror'}
          </span>
        ) : null}
      </header>
      {!instance.minimized ? (
        <div className="panel-drag-overlay-body" style={{ height: bodyHeight }}>
          <span>{instance.title}</span>
          <i />
          <i />
          <i />
        </div>
      ) : null}
    </article>
  );
}
