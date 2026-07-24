import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PanelDragSession } from '@/panels/panelDragModel';
import { createPanelConfiguration, type PanelInstance } from '@/store';
import PanelDragOverlay from './PanelDragOverlay';

describe('PanelDragOverlay', () => {
  it('renders a measured inert preview without mounting a real panel body', () => {
    const instance: PanelInstance = {
      id: 'panel-terminal-test',
      kind: 'terminal',
      title: 'Screen',
      minimized: false,
      config: createPanelConfiguration('terminal'),
    };
    const session: PanelDragSession = {
      panelId: instance.id,
      source: { kind: 'docked', columnId: 'column-1', index: 0 },
      pointerOffset: { x: 100, y: 20 },
      measuredSize: { width: 540, height: 410 },
      initialClientRect: { x: 10, y: 20, width: 540, height: 410 },
    };

    const { container } = render(
      <PanelDragOverlay instance={instance} interactive session={session} />,
    );

    expect(screen.getByRole('heading', { name: 'Screen', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('Interactive')).toBeInTheDocument();
    expect(container.querySelector('.panel-drag-overlay')).toHaveStyle({
      width: '540px',
      height: '220px',
    });
    expect(container.querySelector('.panel-body')).not.toBeInTheDocument();
    expect(screen.queryByTestId('terminal-screen')).not.toBeInTheDocument();
  });
});
