import {
  EASY68K_DISPLAY_DIGITS,
  MACHINE_PROFILE_REGISTRY,
  type Easy68kHardwareDeviceSnapshot,
} from '@m68k/interpreter';
import { useSelector } from 'react-redux';
import { SevenSegmentBank } from '@/components/hardware/SevenSegmentBank';
import { useHardwareDeviceSurface } from '@/runtime/useHardwareSurface';
import type { PanelInstance, RootState } from '@/store';

function emptyDisplaySnapshot(
  deviceId: string,
  displayBase: number
): Easy68kHardwareDeviceSnapshot {
  return {
    id: deviceId,
    deviceType: 'display',
    config: {
      displayBase,
      ledAddress: 0,
      switchAddress: 0,
      buttonAddress: 0,
    },
    display: new Array(EASY68K_DISPLAY_DIGITS).fill(0),
    leds: 0,
    switches: 0,
    buttons: 0xff,
    version: 0,
    outputVersion: 0,
  };
}

export default function SevenSegmentPanel({ instance }: { instance: PanelInstance }) {
  const machineProfile = useSelector((state: RootState) => state.settings.machineProfile);
  const config = instance.config as Extract<
    PanelInstance['config'],
    { kind: 'hardware-display' }
  >;
  const runtimeSnapshot = useHardwareDeviceSurface(config.deviceId);
  const snapshot =
    runtimeSnapshot ??
    emptyDisplaySnapshot(config.deviceId, config.displayBase);

  return (
    <section
      aria-label="Seven-segment display hardware"
      className="hardware-panel-surface hardware-display-panel"
      data-hardware-device-id={config.deviceId}
      data-testid={`hardware-display-${config.deviceId}`}
    >
      {machineProfile === 'bare' ? (
        <div className="hardware-disconnected-state" role="status">
          {MACHINE_PROFILE_REGISTRY.bare.disconnectedMessage}
        </div>
      ) : (
        <SevenSegmentBank values={snapshot.display} />
      )}
    </section>
  );
}
