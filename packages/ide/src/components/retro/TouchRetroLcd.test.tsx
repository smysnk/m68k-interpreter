import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRetroLcdController, RetroLcd } from 'react-retro-display-tty-ansi';

function mockGridRect(): HTMLElement {
  const grid = document.querySelector('.retro-lcd__grid') as HTMLElement | null;
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
  return grid as HTMLElement;
}

function readMeasuredGeometry(): { rows: number; cols: number } {
  const display = document.querySelector('.retro-lcd') as HTMLElement | null;
  expect(display).not.toBeNull();
  const rows = Number(display?.getAttribute('data-rows'));
  const cols = Number(display?.getAttribute('data-cols'));
  expect(Number.isFinite(rows)).toBe(true);
  expect(Number.isFinite(cols)).toBe(true);
  return {
    rows,
    cols,
  };
}

describe('RetroLcd touch input', () => {
  it('maps pointer presses into 1-based terminal cells', async () => {
    const onTouchCell = vi.fn(async () => undefined);
    const controller = createRetroLcdController({
      rows: 5,
      cols: 10,
    });

    render(
      <RetroLcd
        className="terminal-retro-lcd"
        controller={controller}
        gridMode="auto"
        mode="terminal"
        touchInput={{
          enabled: true,
          overlayTestId: 'retro-touch-overlay',
          onTouchCell,
        }}
      />
    );

    await waitFor(() => {
      expect(document.querySelector('.retro-lcd__grid')).not.toBeNull();
    });

    mockGridRect();
    const geometry = readMeasuredGeometry();
    const expectedRow = Math.max(1, Math.min(geometry.rows, Math.floor(((46 - 20) / 50) * geometry.rows) + 1));
    const expectedCol = Math.max(1, Math.min(geometry.cols, Math.floor(((56 - 10) / 100) * geometry.cols) + 1));

    fireEvent.pointerDown(screen.getByTestId('retro-touch-overlay'), {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(onTouchCell).toHaveBeenCalledWith({
        row: expectedRow,
        col: expectedCol,
        rows: geometry.rows,
        cols: geometry.cols,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      });
    });
  });

  it('treats a long press as a single touch until the pointer is released', async () => {
    const onTouchCell = vi.fn(async () => undefined);
    const controller = createRetroLcdController({
      rows: 5,
      cols: 10,
    });

    render(
      <RetroLcd
        className="terminal-retro-lcd"
        controller={controller}
        gridMode="auto"
        mode="terminal"
        touchInput={{
          enabled: true,
          overlayTestId: 'retro-touch-overlay',
          onTouchCell,
        }}
      />
    );

    await waitFor(() => {
      expect(document.querySelector('.retro-lcd__grid')).not.toBeNull();
    });

    mockGridRect();

    const overlay = screen.getByTestId('retro-touch-overlay');

    fireEvent.pointerDown(overlay, {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(onTouchCell).toHaveBeenCalledTimes(1);
    });

    fireEvent.pointerMove(overlay, {
      clientX: 86,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 1,
    });
    fireEvent.pointerDown(overlay, {
      clientX: 86,
      clientY: 46,
      pointerId: 2,
      pointerType: 'touch',
      buttons: 1,
    });

    expect(onTouchCell).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(overlay, {
      clientX: 56,
      clientY: 46,
      pointerId: 1,
      pointerType: 'touch',
      buttons: 0,
    });

    fireEvent.pointerDown(overlay, {
      clientX: 86,
      clientY: 46,
      pointerId: 2,
      pointerType: 'touch',
      buttons: 1,
    });

    await waitFor(() => {
      expect(onTouchCell).toHaveBeenCalledTimes(2);
    });
  });

  it('does not render the touch overlay when touch input is disabled', () => {
    const controller = createRetroLcdController({
      rows: 5,
      cols: 10,
    });

    render(
      <RetroLcd
        className="terminal-retro-lcd"
        controller={controller}
        gridMode="auto"
        mode="terminal"
        touchInput={{
          enabled: false,
          overlayTestId: 'retro-touch-overlay',
          onTouchCell: vi.fn(),
        }}
      />
    );

    expect(screen.queryByTestId('retro-touch-overlay')).not.toBeInTheDocument();
  });
});
