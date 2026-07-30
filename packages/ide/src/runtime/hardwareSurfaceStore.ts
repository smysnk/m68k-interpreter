import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  DEFAULT_EASY68K_HARDWARE_DEVICE_ID,
  EASY68K_DISPLAY_DIGITS,
  type Easy68kHardwareDeviceSnapshot,
  type Easy68kHardwareSnapshot,
} from '@m68k/interpreter';
import { recordHardwareSurfaceSnapshot } from '@/runtime/idePerformanceTelemetry';

type HardwareSurfaceListener = () => void;

function createEmptySnapshot(): Easy68kHardwareSnapshot {
  return {
    config: { ...DEFAULT_EASY68K_HARDWARE_CONFIG },
    display: new Array(EASY68K_DISPLAY_DIGITS).fill(0),
    leds: 0,
    switches: 0,
    buttons: 0xff,
    version: 0,
    outputVersion: 0,
    topologyVersion: 0,
    devices: [
      {
          id: DEFAULT_EASY68K_HARDWARE_DEVICE_ID,
          deviceType: 'board',
        config: { ...DEFAULT_EASY68K_HARDWARE_CONFIG },
        display: new Array(EASY68K_DISPLAY_DIGITS).fill(0),
        leds: 0,
        switches: 0,
        buttons: 0xff,
        version: 0,
        outputVersion: 0,
      },
    ],
  };
}

export function createHardwareSurfaceStore() {
  let snapshot = createEmptySnapshot();
  const listeners = new Set<HardwareSurfaceListener>();

  return {
    getSnapshot: () => snapshot,
    publish(next: Easy68kHardwareSnapshot): boolean {
      const approximatePayloadBytes = 48 + next.devices.reduce(
        (total, device) => total + 48 + device.display.length,
        0
      );
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
      const previousDevices = new Map(snapshot.devices.map((device) => [device.id, device]));
      snapshot = {
        ...next,
        config: { ...next.config },
        display: [...next.display],
        devices: next.devices.map((device) => {
          const previous = previousDevices.get(device.id);
          return previous?.version === device.version
            ? previous
            : {
                ...device,
                config: { ...device.config },
                display: [...device.display],
              };
        }),
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
    getDeviceSnapshot(deviceId: string): Easy68kHardwareDeviceSnapshot | undefined {
      return snapshot.devices.find((device) => device.id === deviceId);
    },
  };
}

export const hardwareSurfaceStore = createHardwareSurfaceStore();
