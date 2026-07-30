export const M68K_ADDRESS_MASK = 0x00ff_ffff;

export type DeviceAccessDirection = 'read' | 'write';

export interface DeviceAddressDescriptor {
  device: string;
  direction: DeviceAccessDirection;
  addresses: readonly number[];
}

export interface DeviceAddressConflict {
  address: number;
  direction: DeviceAccessDirection;
  devices: readonly [string, string];
}

export function normalizeDeviceAddress(address: number): number {
  return address & M68K_ADDRESS_MASK;
}

export function parseDeviceAddress(value: string): number | undefined {
  const trimmed = value.trim();
  const body = trimmed.startsWith('$')
    ? trimmed.slice(1)
    : /^0x/i.test(trimmed)
      ? trimmed.slice(2)
      : trimmed;
  if (!/^[0-9a-f]+$/i.test(body)) {
    return undefined;
  }
  const parsed = Number.parseInt(body, 16);
  return Number.isFinite(parsed) ? normalizeDeviceAddress(parsed) : undefined;
}

export function findDeviceAddressConflicts(
  descriptors: readonly DeviceAddressDescriptor[]
): DeviceAddressConflict[] {
  const conflicts: DeviceAddressConflict[] = [];
  for (let leftIndex = 0; leftIndex < descriptors.length; leftIndex += 1) {
    const left = descriptors[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < descriptors.length; rightIndex += 1) {
      const right = descriptors[rightIndex]!;
      if (left.direction !== right.direction) {
        continue;
      }
      const rightAddresses = new Set(right.addresses.map(normalizeDeviceAddress));
      for (const address of left.addresses) {
        const normalized = normalizeDeviceAddress(address);
        if (rightAddresses.has(normalized)) {
          conflicts.push({
            address: normalized,
            direction: left.direction,
            devices: [left.device, right.device],
          });
        }
      }
    }
  }
  return conflicts;
}
