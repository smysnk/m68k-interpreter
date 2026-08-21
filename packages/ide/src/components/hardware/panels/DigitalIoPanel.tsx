import { MACHINE_PROFILE_REGISTRY, type Easy68kHardwareDeviceSnapshot } from '@m68k/interpreter';
import { useDispatch, useSelector } from 'react-redux';
import { DigitalIoMatrix } from '@/components/hardware/DigitalIoMatrix';
import { useHardwareDeviceController } from '@/hooks/useHardwareDeviceController';
import { useHardwareDeviceSurface } from '@/runtime/useHardwareSurface';
import {
  commitDigitalIoBitLabel,
  type AppDispatch,
  type PanelInstance,
  type RootState,
} from '@/store';

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
  const dispatch = useDispatch<AppDispatch>();
  const machineProfile = useSelector((state: RootState) => state.settings.machineProfile);
  const config = instance.config as Extract<
    PanelInstance['config'],
    { kind: 'hardware-digital-io' }
  >;
  const runtimeSnapshot = useHardwareDeviceSurface(config.deviceId);
  const snapshot = runtimeSnapshot ?? emptyDigitalSnapshot(config.deviceId, config);
  const controller = useHardwareDeviceController(instance.id, config.deviceId);

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
      aria-label="LED, switch, and button hardware"
      className="hardware-panel-surface hardware-digital-io-panel"
      data-hardware-device-id={config.deviceId}
      data-testid={`hardware-digital-io-${config.deviceId}`}
    >
      {machineProfile === 'bare' ? (
        <div className="hardware-disconnected-state" role="status">
          {MACHINE_PROFILE_REGISTRY.bare.disconnectedMessage}
        </div>
      ) : (
        <DigitalIoMatrix
          snapshot={snapshot}
          bitLabels={config.bitLabels}
          onAddressCommit={commitAddress}
          onToggle={(bit, enabled) => void controller.setToggle(bit, enabled)}
          onButton={(bit, pressed) => void controller.setButton(bit, pressed)}
          onLabelCommit={(bit, label) =>
            dispatch(commitDigitalIoBitLabel({ panelId: instance.id, bit, label }))
          }
        />
      )}
    </section>
  );
}
