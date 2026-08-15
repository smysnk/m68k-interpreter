import React from 'react';
import { PANEL_KIND_ORDER, PANEL_REGISTRY } from '@/panels/panelRegistry';
import type { PanelKind } from '@/store';
import MenuItem from './menus/MenuItem';

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
          <MenuItem
            aria-label={`Add ${panel.title} panel`}
            key={kind}
            label={panel.title}
            meta={panel.icon}
            onClick={() => onSelect(kind)}
          />
        );
      })}
    </>
  );
}
