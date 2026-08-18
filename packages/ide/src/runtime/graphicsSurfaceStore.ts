import type { Easy68kGraphicsPatch, Easy68kGraphicsState } from '@m68k/interpreter';

type Listener = () => void;

export interface GraphicsSurfaceSnapshot {
  available: boolean;
  state: Easy68kGraphicsState | null;
  pixels: Uint32Array<ArrayBuffer>;
  patch: Easy68kGraphicsPatch | null;
}

const EMPTY = new Uint32Array(0);

export function createGraphicsSurfaceStore() {
  let snapshot: GraphicsSurfaceSnapshot = {
    available: false,
    state: null,
    pixels: EMPTY,
    patch: null,
  };
  const listeners = new Set<Listener>();

  return {
    getSnapshot: () => snapshot,
    publish(state: Easy68kGraphicsState, patch?: Easy68kGraphicsPatch): boolean {
      let pixels = snapshot.pixels;
      const geometryChanged =
        !snapshot.state ||
        snapshot.state.width !== state.width ||
        snapshot.state.height !== state.height ||
        snapshot.state.geometryVersion !== state.geometryVersion;
      if (geometryChanged || pixels.length !== state.width * state.height) {
        pixels = new Uint32Array(state.width * state.height);
      }
      if (patch) {
        for (let row = 0; row < patch.patchHeight; row += 1) {
          const sourceOffset = row * patch.patchWidth;
          const destinationOffset = (patch.y + row) * state.width + patch.x;
          pixels.set(
            patch.pixels.subarray(sourceOffset, sourceOffset + patch.patchWidth),
            destinationOffset
          );
        }
      }
      if (!geometryChanged && !patch && snapshot.state?.version === state.version) return false;
      snapshot = {
        available: true,
        state: { ...state },
        pixels,
        patch: patch ? { ...patch, pixels: new Uint32Array(patch.pixels) } : null,
      };
      listeners.forEach((listener) => listener());
      return true;
    },
    reset() {
      snapshot = { available: false, state: null, pixels: EMPTY, patch: null };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const graphicsSurfaceStore = createGraphicsSurfaceStore();
