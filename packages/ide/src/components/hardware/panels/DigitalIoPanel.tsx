import type { Easy68kHardwareDeviceSnapshot } from '@m68k/interpreter';
import { DigitalIoMatrix } from '@/components/hardware/DigitalIoMatrix';
import { useHardwareDeviceController } from '@/hooks/useHardwareDeviceController';
import { useHardwareDeviceSurface } from '@/runtime/useHardwareSurface';
import type { PanelInstance } from '@/store';

function emptyDigitalSnapshot(
  deviceId: string,
  config: Extract<PanelInstance['config'], { kind: 'hardware-digital-io' }>
): Easy68kHardwareDeviceSnapshot {
  return {
    id: deviceId,
    deviceType: 'digital-io',
    config: {
      displayBase: 0,
      ledAddress: config.ledAddress,
      switchAddress: config.switchAddress,
      buttonAddress: config.buttonAddress,
    },
    display: new Array(8).fill(0),
    leds: 0,
    switches: 0,
    buttons: 0xff,
    version: 0,
    outputVersion: 0,
  };
}

export default function DigitalIoPanel({ instance }: { instance: PanelInstance }) {
  const config = instance.config as Extract<
    PanelInstance['config'],
    { kind: 'hardware-digital-io' }
  >;
  const runtimeSnapshot = useHardwareDeviceSurface(config.deviceId);
  const snapshot =
    runtimeSnapshot ??
    emptyDigitalSnapshot(config.deviceId, config);
  const controller = useHardwareDeviceController(instance.id, config.deviceId);

  return (
    <section
      aria-label="LED, switch, and button hardware"
      className="hardware-panel-surface hardware-digital-io-panel"
      data-hardware-device-id={config.deviceId}
      data-testid={`hardware-digital-io-${config.deviceId}`}
    >
      <div className="hardware-panel-summary">
        <span>Digital I/O</span>
        <output>8 columns</output>
      </div>
      <DigitalIoMatrix
        snapshot={snapshot}
        onToggle={(bit, enabled) => void controller.setToggle(bit, enabled)}
        onButton={(bit, pressed) => void controller.setButton(bit, pressed)}
      />
      <p className="hardware-io-matrix-note">
        Each vertical column is one bit: switch → LED → button.
      </p>
      <p aria-live="polite" className="hardware-interrupt-status">{controller.status}</p>
    </section>
  );
}
