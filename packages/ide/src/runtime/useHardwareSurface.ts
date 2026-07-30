import { useCallback, useSyncExternalStore } from 'react';
import { hardwareSurfaceStore } from '@/runtime/hardwareSurfaceStore';

export function useHardwareSurface() {
  return useSyncExternalStore(
    hardwareSurfaceStore.subscribe,
    hardwareSurfaceStore.getSnapshot,
    hardwareSurfaceStore.getSnapshot
  );
}

export function useHardwareTopologyVersion() {
  return useSyncExternalStore(
    hardwareSurfaceStore.subscribe,
    () => hardwareSurfaceStore.getSnapshot().topologyVersion,
    () => hardwareSurfaceStore.getSnapshot().topologyVersion
  );
}

export function useHardwareDeviceSurface(deviceId: string) {
  const getSnapshot = useCallback(
    () => hardwareSurfaceStore.getDeviceSnapshot(deviceId),
    [deviceId]
  );
  return useSyncExternalStore(
    hardwareSurfaceStore.subscribe,
    getSnapshot,
    getSnapshot
  );
}
