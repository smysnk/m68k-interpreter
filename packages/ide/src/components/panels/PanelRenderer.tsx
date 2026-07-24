import React from 'react';
import { useDispatch } from 'react-redux';
import { PANEL_REGISTRY, getPanelDomIds } from '@/panels/panelRegistry';
import { closePanel, setTerminalOwner, type AppDispatch, type PanelInstance } from '@/store';
import { RenderProfileBoundary } from '@/runtime/idePerformanceTelemetry';
import PanelErrorBoundary from './PanelErrorBoundary';

interface Props {
  instance: PanelInstance;
  interactive: boolean;
}

export default function PanelRenderer({ instance, interactive }: Props): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const entry = PANEL_REGISTRY[instance.kind];
  const ids = getPanelDomIds(instance.id);
  return (
    <PanelErrorBoundary panelTitle={instance.title} onClose={() => dispatch(closePanel(instance.id))}>
      <RenderProfileBoundary id={`Panel:${instance.kind}`}>
        <section aria-labelledby={ids.headerId} className="panel-body" id={ids.bodyId}>
          {entry.render({
            instance,
            interactive,
            requestInteraction: () => dispatch(setTerminalOwner(instance.id)),
          })}
        </section>
      </RenderProfileBoundary>
    </PanelErrorBoundary>
  );
}
