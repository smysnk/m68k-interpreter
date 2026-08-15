import { describe, expect, it, vi } from 'vitest';
import { calculateMenuPosition } from './useMenuPosition';

function elementWithRect(rect: Partial<DOMRect>): HTMLElement {
  const element = document.createElement('button');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    toJSON: () => ({}),
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    ...rect,
  });
  return element;
}

describe('calculateMenuPosition', () => {
  it('opens a point-anchored menu left and upward at the bottom-right edge', () => {
    expect(
      calculateMenuPosition({
        anchor: { kind: 'point', x: 790, y: 590 },
        desiredHeight: 400,
        desiredWidth: 300,
        placement: 'point',
        viewportHeight: 600,
        viewportWidth: 800,
      })
    ).toEqual({ left: 488, maxHeight: 400, maxWidth: 776, top: 188 });
  });

  it('opens an element menu above when the lower edge lacks space', () => {
    const element = elementWithRect({
      bottom: 570,
      height: 60,
      left: 200,
      right: 500,
      top: 510,
      width: 300,
      x: 200,
      y: 510,
    });
    expect(
      calculateMenuPosition({
        anchor: { element, kind: 'element' },
        desiredHeight: 300,
        desiredWidth: 300,
        placement: 'block',
        viewportHeight: 600,
        viewportWidth: 800,
      })
    ).toMatchObject({ left: 200, top: 202 });
  });

  it('flips an inline submenu to the left of its trigger', () => {
    const element = elementWithRect({
      bottom: 180,
      height: 40,
      left: 700,
      right: 780,
      top: 140,
      width: 80,
      x: 700,
      y: 140,
    });
    expect(
      calculateMenuPosition({
        anchor: { element, kind: 'element' },
        desiredHeight: 260,
        desiredWidth: 300,
        placement: 'inline',
        viewportHeight: 600,
        viewportWidth: 800,
      })
    ).toMatchObject({ left: 392, top: 140 });
  });
});
