import { describe, expect, it, vi } from 'vitest';
import { createGraphicsSurfaceStore } from '@/runtime/graphicsSurfaceStore';

const state = {
  width: 4,
  height: 3,
  penColor: 0,
  fillColor: 0,
  penWidth: 1,
  pointX: 0,
  pointY: 0,
  drawingMode: 4,
  doubleBuffered: false,
  version: 2,
  geometryVersion: 1,
};

describe('graphicsSurfaceStore', () => {
  it('applies dirty rectangles without replacing untouched pixels', () => {
    const store = createGraphicsSurfaceStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.publish(state, {
      width: 4,
      height: 3,
      x: 1,
      y: 1,
      patchWidth: 2,
      patchHeight: 1,
      pixels: Uint32Array.of(0xff0000, 0x00ff00),
      version: 2,
      geometryVersion: 1,
      full: false,
    });
    expect(Array.from(store.getSnapshot().pixels)).toEqual([
      0, 0, 0, 0, 0, 0xff0000, 0x00ff00, 0, 0, 0, 0, 0,
    ]);
    expect(store.getSnapshot().patch).toMatchObject({ x: 1, y: 1, patchWidth: 2 });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
