export const EASY68K_GRAPHICS_DEFAULT_WIDTH = 640;
export const EASY68K_GRAPHICS_DEFAULT_HEIGHT = 480;
export const EASY68K_GRAPHICS_MIN_WIDTH = 640;
export const EASY68K_GRAPHICS_MIN_HEIGHT = 480;
export const EASY68K_GRAPHICS_MAX_WIDTH = 2048;
export const EASY68K_GRAPHICS_MAX_HEIGHT = 2048;

export interface Easy68kGraphicsPatch {
  width: number;
  height: number;
  x: number;
  y: number;
  patchWidth: number;
  patchHeight: number;
  pixels: Uint32Array<ArrayBuffer>;
  version: number;
  geometryVersion: number;
  full: boolean;
}

export interface Easy68kGraphicsState {
  width: number;
  height: number;
  penColor: number;
  fillColor: number;
  penWidth: number;
  pointX: number;
  pointY: number;
  drawingMode: number;
  doubleBuffered: boolean;
  version: number;
  geometryVersion: number;
}

export interface Easy68kGraphicsSnapshot extends Easy68kGraphicsState {
  snapshotVersion: 1;
  tileSize: number;
  frontTiles: Uint32Array<ArrayBuffer>[];
  backTiles: Uint32Array<ArrayBuffer>[];
}

interface DirtyBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const FONT_5X7: Readonly<Record<string, readonly number[]>> = {
  ' ': [0, 0, 0, 0, 0],
  '!': [0, 0, 0x5f, 0, 0],
  '.': [0, 0x60, 0x60, 0, 0],
  ',': [0, 0x40, 0x20, 0, 0],
  ':': [0, 0x36, 0x36, 0, 0],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0, 0x42, 0x7f, 0x40, 0],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0, 0x41, 0x7f, 0x41, 0],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

const TILE_SIZE = 64;

function clampDimension(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

export function easy68kColorToRgb(value: number): number {
  const color = value & 0x00ff_ffff;
  return (((color & 0xff) << 16) | (color & 0x00ff00) | ((color >>> 16) & 0xff)) >>> 0;
}

export function rgbToEasy68kColor(value: number): number {
  const color = value & 0x00ff_ffff;
  return (((color & 0xff) << 16) | (color & 0x00ff00) | ((color >>> 16) & 0xff)) >>> 0;
}

function applyDrawingMode(mode: number, background: number, draw: number): number {
  const bg = background & 0x00ff_ffff;
  const fg = draw & 0x00ff_ffff;
  switch (mode & 0x0f) {
    case 0:
      return 0;
    case 1:
      return 0x00ff_ffff;
    case 2:
      return bg;
    case 3:
      return ~bg & 0x00ff_ffff;
    case 4:
      return fg;
    case 5:
      return ~fg & 0x00ff_ffff;
    case 6:
      return (~bg | fg) & 0x00ff_ffff;
    case 7:
      return ~bg & fg & 0x00ff_ffff;
    case 8:
      return (bg | ~fg) & 0x00ff_ffff;
    case 9:
      return bg & ~fg & 0x00ff_ffff;
    case 10:
      return (bg | fg) & 0x00ff_ffff;
    case 11:
      return ~(bg | fg) & 0x00ff_ffff;
    case 12:
      return bg & fg & 0x00ff_ffff;
    case 13:
      return ~(bg & fg) & 0x00ff_ffff;
    case 14:
      return (bg ^ fg) & 0x00ff_ffff;
    case 15:
      return ~(bg ^ fg) & 0x00ff_ffff;
    default:
      return fg;
  }
}

export class Easy68kGraphicsDevice {
  private width = EASY68K_GRAPHICS_DEFAULT_WIDTH;
  private height = EASY68K_GRAPHICS_DEFAULT_HEIGHT;
  private frontTiles = this.createTiles(this.width, this.height);
  private backTiles = this.createTiles(this.width, this.height);
  private frontSharedTiles = new Set<number>();
  private backSharedTiles = new Set<number>();
  private penColor = 0;
  private fillColor = 0;
  private penWidth = 1;
  private pointX = 0;
  private pointY = 0;
  private drawingMode = 4;
  private doubleBuffered = false;
  private version = 1;
  private geometryVersion = 1;
  private dirty: DirtyBounds | null = {
    left: 0,
    top: 0,
    right: this.width - 1,
    bottom: this.height - 1,
  };

  getState(): Easy68kGraphicsState {
    return {
      width: this.width,
      height: this.height,
      penColor: rgbToEasy68kColor(this.penColor),
      fillColor: rgbToEasy68kColor(this.fillColor),
      penWidth: this.penWidth,
      pointX: this.pointX,
      pointY: this.pointY,
      drawingMode: this.drawingMode,
      doubleBuffered: this.doubleBuffered,
      version: this.version,
      geometryVersion: this.geometryVersion,
    };
  }

  getVersion(): number {
    return this.version;
  }

  resize(width: number, height: number): void {
    const nextWidth = clampDimension(width, EASY68K_GRAPHICS_MIN_WIDTH, EASY68K_GRAPHICS_MAX_WIDTH);
    const nextHeight = clampDimension(
      height,
      EASY68K_GRAPHICS_MIN_HEIGHT,
      EASY68K_GRAPHICS_MAX_HEIGHT
    );
    if (nextWidth === this.width && nextHeight === this.height) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.frontTiles = this.createTiles(nextWidth, nextHeight);
    this.backTiles = this.createTiles(nextWidth, nextHeight);
    this.frontSharedTiles.clear();
    this.backSharedTiles.clear();
    this.pointX = Math.min(this.pointX, nextWidth - 1);
    this.pointY = Math.min(this.pointY, nextHeight - 1);
    this.geometryVersion += 1;
    this.markDirty(0, 0, nextWidth - 1, nextHeight - 1);
  }

  clear(): void {
    this.frontTiles = this.createTiles(this.width, this.height);
    this.backTiles = this.createTiles(this.width, this.height);
    this.frontSharedTiles.clear();
    this.backSharedTiles.clear();
    this.markDirty(0, 0, this.width - 1, this.height - 1);
  }

  setPenColor(value: number): void {
    const color = easy68kColorToRgb(value);
    if (this.penColor === color) return;
    this.penColor = color;
    this.version += 1;
  }

  setFillColor(value: number): void {
    const color = easy68kColorToRgb(value);
    if (this.fillColor === color) return;
    this.fillColor = color;
    this.version += 1;
  }

  setPenWidth(value: number): void {
    const width = Math.max(1, Math.min(255, value & 0xff));
    if (this.penWidth === width) return;
    this.penWidth = width;
    this.version += 1;
  }

  setDrawingMode(value: number): void {
    const mode = value & 0xff;
    if (mode === 16) {
      if (!this.doubleBuffered) return;
      this.doubleBuffered = false;
      this.version += 1;
      return;
    }
    if (mode === 17) {
      if (this.doubleBuffered) return;
      this.doubleBuffered = true;
      this.version += 1;
      return;
    }
    if (mode <= 15 && this.drawingMode !== mode) {
      this.drawingMode = mode;
      this.version += 1;
    }
  }

  moveTo(x: number, y: number): void {
    const nextX = x | 0;
    const nextY = y | 0;
    if (this.pointX === nextX && this.pointY === nextY) return;
    this.pointX = nextX;
    this.pointY = nextY;
    this.version += 1;
  }

  getPoint(): { x: number; y: number } {
    return { x: this.pointX, y: this.pointY };
  }

  getPixel(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return rgbToEasy68kColor(this.readPixel(this.activeTiles(), x, y));
  }

  drawPixel(x: number, y: number): void {
    this.writePixel(x, y, this.penColor, false);
  }

  private drawStrokePixel(x: number, y: number): void {
    const radius = Math.floor((this.penWidth - 1) / 2);
    for (let py = y - radius; py < y - radius + this.penWidth; py += 1) {
      for (let px = x - radius; px < x - radius + this.penWidth; px += 1) {
        this.writePixel(px, py, this.penColor, true);
      }
    }
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    let x = x1 | 0;
    let y = y1 | 0;
    const targetX = x2 | 0;
    const targetY = y2 | 0;
    const dx = Math.abs(targetX - x);
    const sx = x < targetX ? 1 : -1;
    const dy = -Math.abs(targetY - y);
    const sy = y < targetY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      this.drawStrokePixel(x, y);
      if (x === targetX && y === targetY) break;
      const doubled = error * 2;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
    this.moveTo(targetX, targetY);
  }

  drawLineTo(x: number, y: number): void {
    this.drawLine(this.pointX, this.pointY, x, y);
  }

  drawRectangle(left: number, top: number, right: number, bottom: number, filled: boolean): void {
    const x1 = Math.min(left, right) | 0;
    const x2 = Math.max(left, right) | 0;
    const y1 = Math.min(top, bottom) | 0;
    const y2 = Math.max(top, bottom) | 0;
    if (filled) {
      for (let y = y1; y <= y2; y += 1) {
        for (let x = x1; x <= x2; x += 1) this.writePixel(x, y, this.fillColor);
      }
    }
    this.drawLine(x1, y1, x2, y1);
    this.drawLine(x2, y1, x2, y2);
    this.drawLine(x2, y2, x1, y2);
    this.drawLine(x1, y2, x1, y1);
  }

  drawEllipse(left: number, top: number, right: number, bottom: number, filled: boolean): void {
    const x1 = Math.min(left, right) | 0;
    const x2 = Math.max(left, right) | 0;
    const y1 = Math.min(top, bottom) | 0;
    const y2 = Math.max(top, bottom) | 0;
    const rx = Math.max(0.5, (x2 - x1) / 2);
    const ry = Math.max(0.5, (y2 - y1) / 2);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const threshold = Math.max(1 / rx, 1 / ry) * 1.5;
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const normalized = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
        if (filled && normalized <= 1) this.writePixel(x, y, this.fillColor);
        if (Math.abs(normalized - 1) <= threshold) this.writePixel(x, y, this.penColor);
      }
    }
  }

  floodFill(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const target = this.readPixel(this.activeTiles(), x, y);
    const replacement = applyDrawingMode(this.drawingMode, target, this.fillColor);
    if (target === replacement) return;
    const queue = new Int32Array(this.width * this.height);
    let head = 0;
    let tail = 0;
    const firstIndex = y * this.width + x;
    this.writeRawPixel(x, y, replacement);
    queue[tail++] = firstIndex;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      const px = index % this.width;
      const py = Math.floor(index / this.width);
      this.extendDirty(px, py);
      const left = px > 0 ? index - 1 : -1;
      const right = px + 1 < this.width ? index + 1 : -1;
      const above = py > 0 ? index - this.width : -1;
      const below = py + 1 < this.height ? index + this.width : -1;
      if (left >= 0 && this.readPixelByIndex(this.activeTiles(), left) === target) {
        this.writeRawPixelByIndex(left, replacement);
        queue[tail++] = left;
      }
      if (right >= 0 && this.readPixelByIndex(this.activeTiles(), right) === target) {
        this.writeRawPixelByIndex(right, replacement);
        queue[tail++] = right;
      }
      if (above >= 0 && this.readPixelByIndex(this.activeTiles(), above) === target) {
        this.writeRawPixelByIndex(above, replacement);
        queue[tail++] = above;
      }
      if (below >= 0 && this.readPixelByIndex(this.activeTiles(), below) === target) {
        this.writeRawPixelByIndex(below, replacement);
        queue[tail++] = below;
      }
    }
    this.version += 1;
  }

  drawText(text: string, x: number, y: number): void {
    let cursorX = x | 0;
    for (const character of text) {
      if (character.charCodeAt(0) < 32) continue;
      const glyph = FONT_5X7[character.toUpperCase()] ?? [0x7f, 0x41, 0x41, 0x41, 0x7f];
      for (let gx = 0; gx < 5; gx += 1) {
        const column = glyph[gx] ?? 0;
        for (let gy = 0; gy < 7; gy += 1) {
          if ((column & (1 << gy)) !== 0) this.writePixel(cursorX + gx, y + gy, this.penColor);
        }
      }
      cursorX += 6;
    }
  }

  repaint(): void {
    if (!this.doubleBuffered) return;
    this.frontTiles = this.backTiles.map((tile) => new Uint32Array(tile));
    this.frontSharedTiles.clear();
    this.markDirty(0, 0, this.width - 1, this.height - 1);
  }

  consumePatch(forceFull = false): Easy68kGraphicsPatch | undefined {
    const bounds = forceFull
      ? { left: 0, top: 0, right: this.width - 1, bottom: this.height - 1 }
      : this.dirty;
    if (!bounds) return undefined;
    const patchWidth = bounds.right - bounds.left + 1;
    const patchHeight = bounds.bottom - bounds.top + 1;
    const pixels = new Uint32Array(patchWidth * patchHeight);
    for (let row = 0; row < patchHeight; row += 1) {
      for (let column = 0; column < patchWidth; column += 1) {
        pixels[row * patchWidth + column] = this.readPixel(
          this.frontTiles,
          bounds.left + column,
          bounds.top + row
        );
      }
    }
    this.dirty = null;
    return {
      width: this.width,
      height: this.height,
      x: bounds.left,
      y: bounds.top,
      patchWidth,
      patchHeight,
      pixels,
      version: this.version,
      geometryVersion: this.geometryVersion,
      full: forceFull || (patchWidth === this.width && patchHeight === this.height),
    };
  }

  snapshot(): Easy68kGraphicsSnapshot {
    this.frontTiles.forEach((_tile, index) => this.frontSharedTiles.add(index));
    this.backTiles.forEach((_tile, index) => this.backSharedTiles.add(index));
    return {
      snapshotVersion: 1,
      ...this.getState(),
      tileSize: TILE_SIZE,
      frontTiles: [...this.frontTiles],
      backTiles: [...this.backTiles],
    };
  }

  restore(snapshot: Easy68kGraphicsSnapshot): void {
    this.width = snapshot.width;
    this.height = snapshot.height;
    this.frontTiles = [...snapshot.frontTiles];
    this.backTiles = [...snapshot.backTiles];
    this.frontSharedTiles = new Set(this.frontTiles.map((_tile, index) => index));
    this.backSharedTiles = new Set(this.backTiles.map((_tile, index) => index));
    this.penColor = easy68kColorToRgb(snapshot.penColor);
    this.fillColor = easy68kColorToRgb(snapshot.fillColor);
    this.penWidth = snapshot.penWidth;
    this.pointX = snapshot.pointX;
    this.pointY = snapshot.pointY;
    this.drawingMode = snapshot.drawingMode;
    this.doubleBuffered = snapshot.doubleBuffered;
    this.version = snapshot.version + 1;
    this.geometryVersion = snapshot.geometryVersion + 1;
    this.dirty = { left: 0, top: 0, right: this.width - 1, bottom: this.height - 1 };
  }

  reset(): void {
    this.width = EASY68K_GRAPHICS_DEFAULT_WIDTH;
    this.height = EASY68K_GRAPHICS_DEFAULT_HEIGHT;
    this.frontTiles = this.createTiles(this.width, this.height);
    this.backTiles = this.createTiles(this.width, this.height);
    this.frontSharedTiles.clear();
    this.backSharedTiles.clear();
    this.penColor = 0;
    this.fillColor = 0;
    this.penWidth = 1;
    this.pointX = 0;
    this.pointY = 0;
    this.drawingMode = 4;
    this.doubleBuffered = false;
    this.version += 1;
    this.geometryVersion += 1;
    this.dirty = { left: 0, top: 0, right: this.width - 1, bottom: this.height - 1 };
  }

  private activeTiles(): Uint32Array<ArrayBuffer>[] {
    return this.doubleBuffered ? this.backTiles : this.frontTiles;
  }

  private activeSharedTiles(): Set<number> {
    return this.doubleBuffered ? this.backSharedTiles : this.frontSharedTiles;
  }

  private createTiles(width: number, height: number): Uint32Array<ArrayBuffer>[] {
    const columns = Math.ceil(width / TILE_SIZE);
    const rows = Math.ceil(height / TILE_SIZE);
    return Array.from({ length: columns * rows }, () => new Uint32Array(TILE_SIZE * TILE_SIZE));
  }

  private tileLocation(x: number, y: number): { tileIndex: number; pixelIndex: number } {
    const tileColumns = Math.ceil(this.width / TILE_SIZE);
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);
    return {
      tileIndex: tileY * tileColumns + tileX,
      pixelIndex: (y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE),
    };
  }

  private readPixel(tiles: readonly Uint32Array[], x: number, y: number): number {
    const { tileIndex, pixelIndex } = this.tileLocation(x, y);
    return tiles[tileIndex]?.[pixelIndex] ?? 0;
  }

  private readPixelByIndex(tiles: readonly Uint32Array[], index: number): number {
    return this.readPixel(tiles, index % this.width, Math.floor(index / this.width));
  }

  private writeRawPixel(x: number, y: number, value: number): void {
    const tiles = this.activeTiles();
    const shared = this.activeSharedTiles();
    const { tileIndex, pixelIndex } = this.tileLocation(x, y);
    if (shared.has(tileIndex)) {
      tiles[tileIndex] = new Uint32Array(tiles[tileIndex]);
      shared.delete(tileIndex);
    }
    const tile = tiles[tileIndex];
    if (tile) tile[pixelIndex] = value;
  }

  private writeRawPixelByIndex(index: number, value: number): void {
    this.writeRawPixel(index % this.width, Math.floor(index / this.width), value);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private writePixel(x: number, y: number, color: number, useDrawingMode = true): void {
    if (!this.inBounds(x, y) || (useDrawingMode && this.drawingMode === 2)) return;
    const previous = this.readPixel(this.activeTiles(), x, y);
    const next = useDrawingMode ? applyDrawingMode(this.drawingMode, previous, color) : color;
    if (previous === next) return;
    this.writeRawPixel(x, y, next);
    if (!this.doubleBuffered) this.extendDirty(x, y);
    this.version += 1;
  }

  private extendDirty(x: number, y: number): void {
    if (this.doubleBuffered) return;
    if (!this.dirty) {
      this.dirty = { left: x, top: y, right: x, bottom: y };
      return;
    }
    this.dirty.left = Math.min(this.dirty.left, x);
    this.dirty.top = Math.min(this.dirty.top, y);
    this.dirty.right = Math.max(this.dirty.right, x);
    this.dirty.bottom = Math.max(this.dirty.bottom, y);
  }

  private markDirty(left: number, top: number, right: number, bottom: number): void {
    this.version += 1;
    this.dirty = { left, top, right, bottom };
  }
}
