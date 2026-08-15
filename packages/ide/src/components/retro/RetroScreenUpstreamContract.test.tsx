import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createRetroScreenController,
  RetroScreen,
  type RetroScreenGeometry,
} from 'react-retro-display-tty-ansi-ascii';

describe('react-retro-display upstream contract', () => {
  it('renders the public RetroScreen DOM contract and applies controller writes', async () => {
    const controller = createRetroScreenController({ rows: 2, cols: 10 });

    render(
      <RetroScreen
        className="terminal-retro-lcd"
        controller={controller}
        gridMode="auto"
        mode="terminal"
      />
    );

    expect(document.querySelector('.retro-screen')).not.toBeNull();
    expect(document.querySelector('.retro-screen__screen')).not.toBeNull();
    expect(document.querySelector('.retro-screen__viewport')).not.toBeNull();
    expect(document.querySelector('.retro-screen__grid')).not.toBeNull();

    controller.write('READY');

    await waitFor(() => {
      expect(document.querySelector('.retro-screen__grid')).toHaveTextContent('READY');
    });
  });

  it('reports geometry and maps touch input through the public callbacks', async () => {
    const controller = createRetroScreenController({ rows: 5, cols: 10 });
    const onGeometryChange = vi.fn<(geometry: RetroScreenGeometry) => void>();
    const onTouchCell = vi.fn(async () => undefined);

    render(
      <RetroScreen
        controller={controller}
        gridMode="auto"
        mode="terminal"
        onGeometryChange={onGeometryChange}
        touchInput={{
          enabled: true,
          overlayTestId: 'upstream-touch-overlay',
          onTouchCell,
        }}
      />
    );

    await waitFor(() => {
      expect(onGeometryChange).toHaveBeenCalled();
    });

    const grid = document.querySelector('.retro-screen__grid') as HTMLElement | null;
    expect(grid).not.toBeNull();
    vi.spyOn(grid as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50,
      toJSON: () => ({}),
    } as DOMRect);

    const root = document.querySelector('.retro-screen') as HTMLElement | null;
    const rows = Number(root?.dataset.rows);
    const cols = Number(root?.dataset.cols);

    fireEvent.pointerDown(screen.getByTestId('upstream-touch-overlay'), {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(onTouchCell).toHaveBeenCalledWith({
        row: Math.max(1, Math.min(rows, Math.floor(((46 - 20) / 50) * rows) + 1)),
        col: Math.max(1, Math.min(cols, Math.floor(((56 - 10) / 100) * cols) + 1)),
        rows,
        cols,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      });
    });
  });
});
