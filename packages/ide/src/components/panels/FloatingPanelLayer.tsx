import React from 'react';
import { useDispatch } from 'react-redux';
import { moveFloatingPanel, type AppDispatch, type PanelLayoutDocument } from '@/store';
import PanelFrame from './PanelFrame';

export default function FloatingPanelLayer({
  document,
  layerRef,
}: {
  document: PanelLayoutDocument;
  layerRef?: React.Ref<HTMLDivElement>;
}): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  return (
    <div className="floating-panel-layer" aria-label="Floating panels" ref={layerRef}>
      {document.floatingPanelIds.map((panelId, zIndex) => {
        const instance = document.instances[panelId];
        if (!instance) return null;
        const rect = instance.floatingRect ?? { x: 32, y: 32, width: 520, height: 420 };
        return (
          <div className="floating-panel-window" key={panelId} style={{ left: rect.x, top: rect.y, width: rect.width, height: instance.minimized ? 'auto' : rect.height, zIndex: zIndex + 1 }}>
            <PanelFrame floating instance={instance} interactive={document.terminalOwnerPanelId === panelId} />
            {!instance.minimized ? (
              <button
                aria-label={`Resize ${instance.title}`}
                className="floating-panel-resize-handle"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  const target = event.currentTarget.parentElement;
                  if (!target) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
                  let finished = false;
                  const move = (next: PointerEvent): void => {
                    target.style.width = `${Math.max(280, start.width + next.clientX - start.x)}px`;
                    target.style.height = `${Math.max(180, start.height + next.clientY - start.y)}px`;
                  };
                  const cleanup = (): void => {
                    target.removeEventListener('pointermove', move);
                    target.removeEventListener('pointerup', finish);
                    target.removeEventListener('pointercancel', cancel);
                  };
                  const finish = (next: PointerEvent): void => {
                    if (finished) return;
                    finished = true;
                    cleanup();
                    dispatch(moveFloatingPanel({ panelId, rect: { ...rect, width: Math.max(280, start.width + next.clientX - start.x), height: Math.max(180, start.height + next.clientY - start.y) } }));
                  };
                  const cancel = (): void => {
                    if (finished) return;
                    finished = true;
                    cleanup();
                    target.style.width = `${rect.width}px`;
                    target.style.height = `${rect.height}px`;
                  };
                  target.addEventListener('pointermove', move);
                  target.addEventListener('pointerup', finish);
                  target.addEventListener('pointercancel', cancel);
                }}
                type="button"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
