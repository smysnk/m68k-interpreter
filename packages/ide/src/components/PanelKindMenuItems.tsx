import React from 'react';
import { PANEL_KIND_ORDER, PANEL_REGISTRY } from '@/panels/panelRegistry';
import type { PanelKind } from '@/store';

export default function PanelKindMenuItems({
  onSelect,
}: {
  onSelect: (kind: PanelKind) => void;
}): React.ReactElement {
  return (
    <>
      {PANEL_KIND_ORDER.map((kind) => {
        const panel = PANEL_REGISTRY[kind];
        return (
          <button
            aria-label={`Add ${panel.title} panel`}
            className="navbar-menu-item"
            key={kind}
            onClick={() => onSelect(kind)}
            role="menuitem"
            type="button"
          >
            <span className="navbar-menu-copy">
              <span className="navbar-menu-title">{panel.title}</span>
            </span>
            <span aria-hidden="true" className="navbar-menu-meta">
              {panel.icon}
            </span>
          </button>
        );
      })}
    </>
  );
}
