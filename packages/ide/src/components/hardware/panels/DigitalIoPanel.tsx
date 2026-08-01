import React from 'react';
import type { Easy68kHardwareDeviceSnapshot } from '@m68k/interpreter';
import { DigitalIoMatrix } from '@/components/hardware/DigitalIoMatrix';
import { InterruptControls } from '@/components/hardware/InterruptControls';
import { useHardwareDeviceController } from '@/hooks/useHardwareDeviceController';
import { useHardwareController } from '@/hooks/useHardwareController';
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
  const snapshot = runtimeSnapshot ?? emptyDigitalSnapshot(config.deviceId, config);
  const controller = useHardwareDeviceController(instance.id, config.deviceId);
  const { preferences, requestInterrupt } = useHardwareController();
  const [lastInterrupt, setLastInterrupt] = React.useState<number | null>(null);

  const commitAddress = async (
    field: 'ledAddress' | 'switchAddress' | 'buttonAddress',
    value: number
  ) => {
    const validation = await controller.configure({ [field]: value });
    return validation.valid
      ? { ok: true as const }
      : {
          ok: false as const,
          message: validation.errors[0] ?? 'Hardware address configuration is invalid.',
        };
  };

  return (
    <section
      aria-label="LED, switch, button, and interrupt hardware"
      className="hardware-panel-surface hardware-digital-io-panel"
      data-hardware-device-id={config.deviceId}
      data-testid={`hardware-digital-io-${config.deviceId}`}
    >
      <DigitalIoMatrix
        snapshot={snapshot}
        onAddressCommit={commitAddress}
        onToggle={(bit, enabled) => void controller.setToggle(bit, enabled)}
        onButton={(bit, pressed) => void controller.setButton(bit, pressed)}
      />
      <section
        aria-label="CPU interrupt lines"
        className="hardware-combined-interrupt-section"
        data-testid="hardware-interrupt-requests"
      >
        <div className="hardware-combined-interrupt-heading">
          <span>CPU interrupt lines</span>
          <span>Levels 7–1</span>
        </div>
        <InterruptControls
          aligned
          automaticLevels={preferences.automaticInterruptLevels}
          intervalMs={preferences.automaticInterruptIntervalMs}
          lastInterrupt={lastInterrupt}
          onRequest={(level) => {
            setLastInterrupt(level);
            void requestInterrupt(level);
          }}
        />
      </section>
    </section>
  );
}
