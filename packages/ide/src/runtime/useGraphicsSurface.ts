import { useSyncExternalStore } from 'react';
import { graphicsSurfaceStore } from './graphicsSurfaceStore';

export function useGraphicsSurface() {
  return useSyncExternalStore(
    graphicsSurfaceStore.subscribe,
    graphicsSurfaceStore.getSnapshot,
    graphicsSurfaceStore.getSnapshot
  );
}
