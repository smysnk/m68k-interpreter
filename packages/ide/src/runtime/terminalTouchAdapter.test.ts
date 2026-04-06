import { describe, expect, it, vi } from 'vitest';
import {
  buildTerminalTouchCellEvent,
  mapPointerToTerminalCell,
  shouldHandleTerminalPointer,
} from '@/runtime/terminalTouchAdapter';

describe('terminalTouchAdapter', () => {
  it('maps pixel coordinates into 1-based terminal cells', () => {
    const root = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'retro-lcd__grid';
    root.appendChild(grid);

    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
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

    expect(mapPointerToTerminalCell(root, 56, 46, 10, 5)).toEqual({
      col: 5,
      row: 3,
    });
  });

  it('builds a touch packet-ready cell event from the retro screen geometry', () => {
    const root = document.createElement('div');
    const grid = document.createElement('div');
    grid.className = 'retro-lcd__grid';
    root.appendChild(grid);

    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
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

    expect(
      buildTerminalTouchCellEvent({
        root,
        clientX: 56,
        clientY: 46,
        columns: 10,
        rows: 5,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      })
    ).toEqual({
      row: 3,
      col: 5,
      phase: 'down',
      pointerType: 'touch',
      buttons: 1,
    });
  });

  it('only accepts a fresh pointer-down in touch-only mode', () => {
    expect(
      shouldHandleTerminalPointer({
        isTouchOnlyMode: false,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      })
    ).toBe(false);
    expect(
      shouldHandleTerminalPointer({
        isTouchOnlyMode: true,
        phase: 'move',
        pointerType: 'mouse',
        buttons: 0,
      })
    ).toBe(false);
    expect(
      shouldHandleTerminalPointer({
        isTouchOnlyMode: true,
        phase: 'up',
        pointerType: 'touch',
        buttons: 0,
      })
    ).toBe(false);
    expect(
      shouldHandleTerminalPointer({
        isTouchOnlyMode: true,
        phase: 'move',
        pointerType: 'touch',
        buttons: 0,
      })
    ).toBe(false);
    expect(
      shouldHandleTerminalPointer({
        isTouchOnlyMode: true,
        phase: 'down',
        pointerType: 'touch',
        buttons: 0,
      })
    ).toBe(true);
  });
});
