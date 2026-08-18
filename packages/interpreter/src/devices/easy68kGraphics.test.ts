import { describe, expect, it } from 'vitest';
import {
  EASY68K_GRAPHICS_DEFAULT_HEIGHT,
  EASY68K_GRAPHICS_DEFAULT_WIDTH,
  Easy68kGraphicsDevice,
  easy68kColorToRgb,
  rgbToEasy68kColor,
} from './easy68kGraphics';

describe('Easy68kGraphicsDevice', () => {
  it('converts canonical $00BBGGRR colours without host byte-order dependence', () => {
    expect(easy68kColorToRgb(0x00112233)).toBe(0x00332211);
    expect(rgbToEasy68kColor(0x00332211)).toBe(0x00112233);
  });

  it('draws deterministic pixels, lines, rectangles, and ellipses', () => {
    const graphics = new Easy68kGraphicsDevice();
    graphics.consumePatch();
    graphics.setPenColor(0x000000ff);
    graphics.setFillColor(0x0000ff00);
    graphics.drawPixel(10, 10);
    graphics.drawLine(12, 10, 18, 10);
    graphics.drawRectangle(20, 20, 30, 30, true);
    graphics.drawEllipse(40, 40, 60, 60, false);

    expect(graphics.getPixel(10, 10)).toBe(0x000000ff);
    expect(graphics.getPixel(25, 25)).toBe(0x0000ff00);
    expect(graphics.getPixel(50, 40)).toBe(0x000000ff);
    const patch = graphics.consumePatch();
    expect(patch).toMatchObject({ x: 10, y: 10, full: false });
    expect(patch?.patchWidth).toBeGreaterThan(40);
  });

  it('keeps back-buffer drawing hidden until repaint', () => {
    const graphics = new Easy68kGraphicsDevice();
    graphics.consumePatch();
    graphics.setPenColor(0x00ff0000);
    graphics.setDrawingMode(17);
    graphics.drawPixel(4, 5);
    expect(graphics.consumePatch()).toBeUndefined();
    expect(graphics.getPixel(4, 5)).toBe(0x00ff0000);
    graphics.repaint();
    expect(graphics.consumePatch()).toMatchObject({ full: true });
  });

  it('uses copy-on-write buffers for bounded undo snapshots', () => {
    const graphics = new Easy68kGraphicsDevice();
    graphics.setPenColor(0x000000ff);
    graphics.drawPixel(1, 1);
    const snapshot = graphics.snapshot();
    graphics.setPenColor(0x0000ff00);
    graphics.drawPixel(1, 1);
    expect(graphics.getPixel(1, 1)).toBe(0x0000ff00);
    graphics.restore(snapshot);
    expect(graphics.getPixel(1, 1)).toBe(0x000000ff);
    expect(snapshot.width).toBe(EASY68K_GRAPHICS_DEFAULT_WIDTH);
    expect(snapshot.height).toBe(EASY68K_GRAPHICS_DEFAULT_HEIGHT);
  });

  it('copies only touched tiles after a snapshot', () => {
    const graphics = new Easy68kGraphicsDevice();
    const before = graphics.snapshot();
    graphics.setPenColor(0x000000ff);
    graphics.drawPixel(1, 1);
    const after = graphics.snapshot();
    const changedTiles = after.frontTiles.filter(
      (tile, index) => tile !== before.frontTiles[index]
    );
    expect(changedTiles).toHaveLength(1);
  });

  it('ignores Boolean drawing mode for task-82-style pixels', () => {
    const graphics = new Easy68kGraphicsDevice();
    graphics.setPenColor(0x000000ff);
    graphics.setDrawingMode(0);
    graphics.drawPixel(3, 4);
    expect(graphics.getPixel(3, 4)).toBe(0x000000ff);
    graphics.drawLine(5, 4, 6, 4);
    expect(graphics.getPixel(5, 4)).toBe(0);
  });

  it('flood fills a bounded region without crossing its border', () => {
    const graphics = new Easy68kGraphicsDevice();
    graphics.setPenColor(0x000000ff);
    graphics.drawRectangle(0, 0, 10, 10, false);
    graphics.setFillColor(0x0000ff00);
    graphics.floodFill(5, 5);
    expect(graphics.getPixel(5, 5)).toBe(0x0000ff00);
    expect(graphics.getPixel(0, 0)).toBe(0x000000ff);
    expect(graphics.getPixel(11, 11)).toBe(0);
  });
});
