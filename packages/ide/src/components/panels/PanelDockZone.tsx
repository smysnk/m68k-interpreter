import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { describePanelDockTarget, type PanelDockTarget } from '@/panels/panelDragModel';
import type { PanelLayoutDocument } from '@/store';

export default function PanelDockZone({
  active,
  document,
  enabled,
  panelTitle,
  target,
}: {
  active: boolean;
  document: PanelLayoutDocument;
  enabled: boolean;
  panelTitle: string;
  target: PanelDockTarget;
}): React.ReactElement {
  const { isOver, setNodeRef } = useDroppable({
    id: target.id,
    data: { type: 'panel-dock-target', dockTarget: target },
    disabled: !enabled,
  });
  const highlighted = active || isOver;
  const description = describePanelDockTarget(target, panelTitle, document);
  return (
    <div
      aria-hidden="true"
      className={`panel-dock-zone panel-dock-zone-${target.relation} ${enabled ? 'available' : ''} ${highlighted ? 'active' : ''}`}
      data-panel-column-index={target.columnIndex}
      data-panel-dock-active={highlighted ? 'true' : 'false'}
      data-panel-dock-relation={target.relation}
      data-panel-dock-target={target.id}
      data-panel-dock-target-index={target.index}
      ref={setNodeRef}
      title={highlighted ? description : undefined}
    >
      <span>{highlighted ? description : ''}</span>
    </div>
  );
}
