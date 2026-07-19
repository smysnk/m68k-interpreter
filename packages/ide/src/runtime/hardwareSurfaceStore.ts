import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  type Easy68kHardwareSnapshot,
} from '@m68k/interpreter';
import { recordHardwareSurfaceSnapshot } from '@/runtime/idePerformanceTelemetry';

type HardwareSurfaceListener = () => void;

function createEmptySnapshot(): Easy68kHardwareSnapshot {
  return {
    config: { ...DEFAULT_EASY68K_HARDWARE_CONFIG },
    display: new Array(8).fill(0),
    leds: 0,
    switches: 0,
    buttons: 0xff,
    version: 0,
    outputVersion: 0,
  };
}

export function createHardwareSurfaceStore() {
  let snapshot = createEmptySnapshot();
  const listeners = new Set<HardwareSurfaceListener>();

  return {
    getSnapshot: () => snapshot,
    publish(next: Easy68kHardwareSnapshot): boolean {
      const approximatePayloadBytes = 48 + next.display.length;
      if (next.version === snapshot.version) {
        recordHardwareSurfaceSnapshot({
          received: true,
          published: false,
          reused: true,
          noOp: true,
          outputVersionChanged: false,
          approximatePayloadBytes,
        });
        return false;
      }
      const outputVersionChanged = next.outputVersion !== snapshot.outputVersion;
      snapshot = {
        ...next,
        config: { ...next.config },
        display: [...next.display],
      };
      recordHardwareSurfaceSnapshot({
        received: true,
        published: true,
        reused: false,
        noOp: false,
        outputVersionChanged,
        approximatePayloadBytes,
      });
      listeners.forEach((listener) => listener());
      return true;
    },
    reset() {
      snapshot = createEmptySnapshot();
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: HardwareSurfaceListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const hardwareSurfaceStore = createHardwareSurfaceStore();
