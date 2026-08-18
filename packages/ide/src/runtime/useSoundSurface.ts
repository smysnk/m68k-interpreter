import { useSyncExternalStore } from 'react';
import { soundSurfaceStore } from './soundSurfaceStore';

export function useSoundSurface() {
  return useSyncExternalStore(
    soundSurfaceStore.subscribe,
    soundSurfaceStore.getSnapshot,
    soundSurfaceStore.getSnapshot
  );
}
