import type { Easy68kHardwareConfig } from '@m68k/interpreter';
import {
  HardwareAddressField,
  type HardwareAddressCommitResult,
} from '@/components/hardware/HardwareAddressField';
import { useHardwareDeviceController } from '@/hooks/useHardwareDeviceController';
import type { PanelInstance } from '@/store';

function result(
  valid: boolean,
  errors: readonly string[]
): HardwareAddressCommitResult {
  return valid
    ? { ok: true }
    : { ok: false, message: errors[0] ?? 'Hardware address configuration is invalid.' };
}

export function SevenSegmentHeaderAccessory({
  instance,
}: {
  instance: PanelInstance;
}) {
  const config = instance.config as Extract<
    PanelInstance['config'],
    { kind: 'hardware-display' }
  >;
  const controller = useHardwareDeviceController(instance.id, config.deviceId);
  const commit = async (
    patch: Partial<Easy68kHardwareConfig>
  ): Promise<HardwareAddressCommitResult> => {
    const validation = await controller.configure(patch);
    return result(validation.valid, validation.errors);
  };
  return (
    <div className="hardware-header-address-cluster">
      <HardwareAddressField
        compact
        label="Display base"
        value={config.displayBase}
        onCommit={(value) => commit({ displayBase: value })}
      />
    </div>
  );
}

export function DigitalIoHeaderAccessory({
  instance,
}: {
  instance: PanelInstance;
}) {
  const config = instance.config as Extract<
    PanelInstance['config'],
    { kind: 'hardware-digital-io' }
  >;
  const controller = useHardwareDeviceController(instance.id, config.deviceId);
  const commit = async (
    patch: Partial<Easy68kHardwareConfig>
  ): Promise<HardwareAddressCommitResult> => {
    const validation = await controller.configure(patch);
    return result(validation.valid, validation.errors);
  };
  return (
    <div className="hardware-header-address-cluster hardware-header-address-cluster-digital">
      <HardwareAddressField
        compact
        label="LED"
        value={config.ledAddress}
        onCommit={(value) => commit({ ledAddress: value })}
      />
      <HardwareAddressField
        compact
        label="Switch"
        value={config.switchAddress}
        onCommit={(value) => commit({ switchAddress: value })}
      />
      <HardwareAddressField
        compact
        label="Button"
        value={config.buttonAddress}
        onCommit={(value) => commit({ buttonAddress: value })}
      />
    </div>
  );
}
