import { useSyncExternalStore } from 'react';
import { hardwareSurfaceStore } from '@/runtime/hardwareSurfaceStore';

export function useHardwareSurface() {
  return useSyncExternalStore(
    hardwareSurfaceStore.subscribe,
    hardwareSurfaceStore.getSnapshot,
    hardwareSurfaceStore.getSnapshot
  );
}
