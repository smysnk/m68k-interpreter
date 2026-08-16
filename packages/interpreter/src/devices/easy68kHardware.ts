import {
  findDeviceAddressConflicts,
  normalizeDeviceAddress,
  type DeviceAddressConflict,
  type DeviceAddressDescriptor,
} from './deviceAddressMap';

export const EASY68K_DISPLAY_DIGITS = 8;
export const EASY68K_DISPLAY_STRIDE = 2;
export const EASY68K_INTERRUPT_VECTOR_BASE = 0x60;
export const EASY68K_INTERRUPT_LEVELS = [7, 6, 5, 4, 3, 2, 1] as const;
export const EASY68K_BIT_ORDER = [7, 6, 5, 4, 3, 2, 1, 0] as const;
export const DEFAULT_EASY68K_HARDWARE_DEVICE_ID = 'easy68k-default';

export interface Easy68kHardwareConfig {
  displayBase: number;
  ledAddress: number;
  switchAddress: number;
  buttonAddress: number;
}

export type Easy68kHardwareDeviceType = 'board' | 'display' | 'digital-io';

export interface Easy68kBoardDeviceConfig extends Easy68kHardwareConfig {
  id: string;
  deviceType?: 'board';
}

export interface Easy68kDisplayDeviceConfig {
  id: string;
  deviceType: 'display';
  displayBase: number;
}

export interface Easy68kDigitalIoDeviceConfig {
  id: string;
  deviceType: 'digital-io';
  ledAddress: number;
  switchAddress: number;
  buttonAddress: number;
}

export type Easy68kHardwareDeviceConfig =
  | Easy68kBoardDeviceConfig
  | Easy68kDisplayDeviceConfig
  | Easy68kDigitalIoDeviceConfig;

export interface NormalizedEasy68kHardwareDeviceConfig extends Easy68kHardwareConfig {
  id: string;
  deviceType: Easy68kHardwareDeviceType;
}

export interface Easy68kHardwareDeviceOutputSnapshot {
  id: string;
  display: readonly number[];
  leds: number;
  outputVersion: number;
}

export interface Easy68kHardwareOutputSnapshot {
  display: readonly number[];
  leds: number;
  outputVersion: number;
  devices?: readonly Easy68kHardwareDeviceOutputSnapshot[];
}

export interface Easy68kHardwareDeviceSnapshot extends Easy68kHardwareDeviceOutputSnapshot {
  deviceType: Easy68kHardwareDeviceType;
  config: Easy68kHardwareConfig;
  switches: number;
  buttons: number;
  version: number;
}

export interface Easy68kHardwareSnapshot extends Easy68kHardwareOutputSnapshot {
  config: Easy68kHardwareConfig;
  switches: number;
  buttons: number;
  version: number;
  topologyVersion: number;
  devices: readonly Easy68kHardwareDeviceSnapshot[];
}

export interface Easy68kHardwareValidationResult {
  valid: boolean;
  config?: Easy68kHardwareConfig;
  devices?: readonly NormalizedEasy68kHardwareDeviceConfig[];
  conflicts: readonly DeviceAddressConflict[];
  errors: readonly string[];
}

export const DEFAULT_EASY68K_HARDWARE_CONFIG: Readonly<Easy68kHardwareConfig> = {
  displayBase: 0xe00000,
  ledAddress: 0xe00010,
  switchAddress: 0xe00010,
  buttonAddress: 0xe00012,
};

export const DEFAULT_EASY68K_HARDWARE_DEVICE_CONFIG: Readonly<Easy68kBoardDeviceConfig> = {
  id: DEFAULT_EASY68K_HARDWARE_DEVICE_ID,
  deviceType: 'board',
  ...DEFAULT_EASY68K_HARDWARE_CONFIG,
};

const CONFIG_KEYS: readonly (keyof Easy68kHardwareConfig)[] = [
  'displayBase',
  'ledAddress',
  'switchAddress',
  'buttonAddress',
];

interface Easy68kHardwareDeviceState {
  id: string;
  deviceType: Easy68kHardwareDeviceType;
  config: Easy68kHardwareConfig;
  display: Uint8Array;
  leds: number;
  switches: number;
  pressedButtons: number;
  version: number;
  outputVersion: number;
}

export function getEasy68kDisplayAddress(base: number, index: number): number {
  return normalizeDeviceAddress(base + index * EASY68K_DISPLAY_STRIDE);
}

export function getEasy68kInterruptVectorAddress(level: number): number {
  return EASY68K_INTERRUPT_VECTOR_BASE + level * 4;
}

export function normalizeEasy68kHardwareConfig(
  config: Easy68kHardwareConfig
): Easy68kHardwareConfig {
  return {
    displayBase: normalizeDeviceAddress(config.displayBase),
    ledAddress: normalizeDeviceAddress(config.ledAddress),
    switchAddress: normalizeDeviceAddress(config.switchAddress),
    buttonAddress: normalizeDeviceAddress(config.buttonAddress),
  };
}

export function normalizeEasy68kHardwareDeviceConfig(
  config: Easy68kHardwareDeviceConfig
): NormalizedEasy68kHardwareDeviceConfig {
  const defaults = DEFAULT_EASY68K_HARDWARE_CONFIG;
  return {
    id: config.id.trim(),
    deviceType: config.deviceType ?? 'board',
    ...normalizeEasy68kHardwareConfig({
      displayBase: 'displayBase' in config ? config.displayBase : defaults.displayBase,
      ledAddress: 'ledAddress' in config ? config.ledAddress : defaults.ledAddress,
      switchAddress: 'switchAddress' in config ? config.switchAddress : defaults.switchAddress,
      buttonAddress: 'buttonAddress' in config ? config.buttonAddress : defaults.buttonAddress,
    }),
  };
}

export function getEasy68kHardwareAddressDescriptors(
  config: Easy68kHardwareConfig,
  deviceId?: string,
  deviceType: Easy68kHardwareDeviceType = 'board'
): DeviceAddressDescriptor[] {
  const normalized = normalizeEasy68kHardwareConfig(config);
  const prefix = deviceId ? `${deviceId}:` : '';
  const descriptors: DeviceAddressDescriptor[] = [];
  if (deviceType !== 'digital-io') {
    descriptors.push({
      device: `${prefix}display`,
      direction: 'write',
      addresses: Array.from({ length: EASY68K_DISPLAY_DIGITS }, (_, index) =>
        getEasy68kDisplayAddress(normalized.displayBase, index)
      ),
    });
  }
  if (deviceType !== 'display') {
    descriptors.push(
      { device: `${prefix}leds`, direction: 'write', addresses: [normalized.ledAddress] },
      { device: `${prefix}switches`, direction: 'read', addresses: [normalized.switchAddress] },
      { device: `${prefix}buttons`, direction: 'read', addresses: [normalized.buttonAddress] }
    );
  }
  return descriptors;
}

export function validateEasy68kHardwareConfig(
  config: Easy68kHardwareConfig
): Easy68kHardwareValidationResult {
  const normalized = normalizeEasy68kHardwareConfig(config);
  const errors: string[] = [];
  if ((normalized.displayBase & 1) !== 0) {
    errors.push('The seven-segment base address must be even.');
  }
  if (normalized.displayBase > 0x00ff_ffff - (EASY68K_DISPLAY_DIGITS - 1) * EASY68K_DISPLAY_STRIDE) {
    errors.push('The seven-segment address range must not wrap around the 24-bit bus.');
  }
  const conflicts = findDeviceAddressConflicts(getEasy68kHardwareAddressDescriptors(normalized));
  if (conflicts.length > 0) {
    errors.push('Two devices cannot use the same address for the same access direction.');
  }
  return {
    valid: errors.length === 0,
    config: errors.length === 0 ? normalized : undefined,
    conflicts,
    errors,
  };
}

export function validateEasy68kHardwareDevices(
  devices: readonly Easy68kHardwareDeviceConfig[]
): Easy68kHardwareValidationResult {
  const normalized: NormalizedEasy68kHardwareDeviceConfig[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const raw of devices) {
    const device = normalizeEasy68kHardwareDeviceConfig(raw);
    if (!device.id) {
      errors.push('Every hardware device requires a stable ID.');
      continue;
    }
    if (ids.has(device.id)) {
      errors.push(`Hardware device ID "${device.id}" is duplicated.`);
      continue;
    }
    ids.add(device.id);
    const config = normalizeEasy68kHardwareConfig(device);
    const descriptors = getEasy68kHardwareAddressDescriptors(
      config,
      device.id,
      device.deviceType
    );
    const deviceConflicts = findDeviceAddressConflicts(descriptors);
    if (device.deviceType !== 'digital-io' && (config.displayBase & 1) !== 0) {
      errors.push(`${device.id}: The seven-segment base address must be even.`);
    }
    if (
      device.deviceType !== 'digital-io' &&
      config.displayBase >
        0x00ff_ffff - (EASY68K_DISPLAY_DIGITS - 1) * EASY68K_DISPLAY_STRIDE
    ) {
      errors.push(
        `${device.id}: The seven-segment address range must not wrap around the 24-bit bus.`
      );
    }
    if (deviceConflicts.length > 0) {
      errors.push(
        `${device.id}: Two devices cannot use the same address for the same access direction.`
      );
    }
    normalized.push({ id: device.id, deviceType: device.deviceType, ...config });
  }

  const conflicts = findDeviceAddressConflicts(
    normalized.flatMap((device) =>
      getEasy68kHardwareAddressDescriptors(device, device.id, device.deviceType)
    )
  );
  if (conflicts.length > 0) {
    errors.push('Two hardware devices cannot use the same address for the same access direction.');
  }

  return {
    valid: errors.length === 0,
    devices: errors.length === 0 ? normalized : undefined,
    conflicts,
    errors,
  };
}

export function allocateEasy68kHardwareConfig(
  existing: readonly Easy68kHardwareDeviceConfig[],
  preferred: Easy68kHardwareConfig = DEFAULT_EASY68K_HARDWARE_CONFIG,
  deviceType: Easy68kHardwareDeviceType = 'board'
): Easy68kHardwareConfig | undefined {
  const normalizedPreferred = normalizeEasy68kHardwareConfig(preferred);
  for (let offset = 0; offset <= 0x00ff_0000; offset += 0x20) {
    const candidate = normalizeEasy68kHardwareConfig({
      displayBase: normalizedPreferred.displayBase + offset,
      ledAddress: normalizedPreferred.ledAddress + offset,
      switchAddress: normalizedPreferred.switchAddress + offset,
      buttonAddress: normalizedPreferred.buttonAddress + offset,
    });
    const probe: Easy68kHardwareDeviceConfig = {
      id: `allocation-probe-${offset}`,
      deviceType,
      ...candidate,
    };
    if (validateEasy68kHardwareDevices([...existing, probe]).valid) {
      return candidate;
    }
  }
  return undefined;
}

function clampByte(value: number): number {
  return value & 0xff;
}

function createDeviceState(config: NormalizedEasy68kHardwareDeviceConfig): Easy68kHardwareDeviceState {
  return {
    id: config.id,
    deviceType: config.deviceType ?? 'board',
    config: normalizeEasy68kHardwareConfig(config),
    display: new Uint8Array(EASY68K_DISPLAY_DIGITS),
    leds: 0,
    switches: 0,
    pressedButtons: 0,
    version: 1,
    outputVersion: 1,
  };
}

function configChanged(left: Easy68kHardwareConfig, right: Easy68kHardwareConfig): boolean {
  return CONFIG_KEYS.some((key) => left[key] !== right[key]);
}

export class Easy68kHardware {
  private devices = new Map<string, Easy68kHardwareDeviceState>();
  private version = 1;
  private outputVersion = 1;
  private topologyVersion = 1;
  private mappedAddressRanges: ReadonlyArray<{ start: number; end: number }> = [];

  constructor(
    config:
      | Easy68kHardwareConfig
      | readonly Easy68kHardwareDeviceConfig[] = DEFAULT_EASY68K_HARDWARE_CONFIG
  ) {
    const devices = Array.isArray(config)
      ? config
      : [{
          id: DEFAULT_EASY68K_HARDWARE_DEVICE_ID,
          deviceType: 'board' as const,
          ...(config as Easy68kHardwareConfig),
        }];
    const validation = validateEasy68kHardwareDevices(devices);
    if (!validation.valid || !validation.devices) {
      throw new Error(validation.errors.join(' '));
    }
    for (const device of validation.devices) {
      this.devices.set(device.id, createDeviceState(device));
    }
    this.rebuildMappedAddressRanges();
  }

  readByte(address: number): number | undefined {
    const normalized = normalizeDeviceAddress(address);
    for (const device of this.devices.values()) {
      if (normalized === device.config.switchAddress) {
        return device.switches;
      }
      if (normalized === device.config.buttonAddress) {
        return clampByte(~device.pressedButtons);
      }
    }
    return undefined;
  }

  writeByte(address: number, value: number): boolean {
    const normalized = normalizeDeviceAddress(address);
    const byte = clampByte(value);
    for (const device of this.devices.values()) {
      if (normalized === device.config.ledAddress) {
        if (device.leds !== byte) {
          device.leds = byte;
          this.bumpOutputVersion(device);
        }
        return true;
      }
      for (let index = 0; index < EASY68K_DISPLAY_DIGITS; index += 1) {
        if (normalized !== getEasy68kDisplayAddress(device.config.displayBase, index)) {
          continue;
        }
        if (device.display[index] !== byte) {
          device.display[index] = byte;
          this.bumpOutputVersion(device);
        }
        return true;
      }
    }
    return false;
  }

  configure(config: Easy68kHardwareConfig): Easy68kHardwareValidationResult {
    return this.configureDevice(DEFAULT_EASY68K_HARDWARE_DEVICE_ID, config);
  }

  configureDevice(
    deviceId: string,
    config: Easy68kHardwareConfig
  ): Easy68kHardwareValidationResult {
    const nextDevices = this.getDeviceConfigs().filter((device) => device.id !== deviceId);
    nextDevices.push({
      id: deviceId,
      deviceType: this.devices.get(deviceId)?.deviceType ?? 'board',
      ...config,
    });
    const result = this.configureDevices(nextDevices);
    return {
      ...result,
      config: result.devices?.find((device) => device.id === deviceId),
    };
  }

  configureDevices(
    configs: readonly Easy68kHardwareDeviceConfig[]
  ): Easy68kHardwareValidationResult {
    const validation = validateEasy68kHardwareDevices(configs);
    if (!validation.valid || !validation.devices) {
      return validation;
    }

    let topologyChanged = validation.devices.length !== this.devices.size;
    let configurationChanged = false;
    const next = new Map<string, Easy68kHardwareDeviceState>();
    for (const config of validation.devices) {
      const existing = this.devices.get(config.id);
      if (!existing) {
        next.set(config.id, createDeviceState(config));
        topologyChanged = true;
        continue;
      }
      if (configChanged(existing.config, config) || existing.deviceType !== config.deviceType) {
        existing.config = normalizeEasy68kHardwareConfig(config);
        existing.deviceType = config.deviceType ?? 'board';
        existing.version += 1;
        configurationChanged = true;
      }
      next.set(config.id, existing);
    }
    if ([...this.devices.keys()].some((id) => !next.has(id))) {
      topologyChanged = true;
    }
    this.devices = next;
    this.rebuildMappedAddressRanges();
    if (topologyChanged) {
      this.topologyVersion += 1;
    }
    if (topologyChanged || configurationChanged) {
      this.version += 1;
    }
    return validation;
  }

  removeDevice(deviceId: string): Easy68kHardwareValidationResult {
    return this.configureDevices(this.getDeviceConfigs().filter((device) => device.id !== deviceId));
  }

  setToggle(bit: number, enabled: boolean, deviceId = DEFAULT_EASY68K_HARDWARE_DEVICE_ID): void {
    if (bit < 0 || bit > 7) {
      throw new RangeError('Toggle bit must be between 0 and 7.');
    }
    const device = this.requireDevice(deviceId);
    const mask = 1 << bit;
    const next = enabled ? device.switches | mask : device.switches & ~mask;
    if (next !== device.switches) {
      device.switches = next;
      device.version += 1;
      this.version += 1;
    }
  }

  setButton(bit: number, pressed: boolean, deviceId = DEFAULT_EASY68K_HARDWARE_DEVICE_ID): void {
    if (bit < 0 || bit > 7) {
      throw new RangeError('Button bit must be between 0 and 7.');
    }
    const device = this.requireDevice(deviceId);
    const mask = 1 << bit;
    const next = pressed ? device.pressedButtons | mask : device.pressedButtons & ~mask;
    if (next !== device.pressedButtons) {
      device.pressedButtons = next;
      device.version += 1;
      this.version += 1;
    }
  }

  reset(): void {
    for (const device of this.devices.values()) {
      const outputChanged = device.leds !== 0 || device.display.some((value) => value !== 0);
      const buttonsChanged = device.pressedButtons !== 0;
      device.leds = 0;
      device.display.fill(0);
      device.pressedButtons = 0;
      if (outputChanged) {
        device.outputVersion += 1;
        this.outputVersion += 1;
      }
      if (outputChanged || buttonsChanged) {
        device.version += 1;
        this.version += 1;
      }
    }
  }

  getSnapshot(): Easy68kHardwareSnapshot {
    const devices = [...this.devices.values()].map((device) => this.snapshotDevice(device));
    const primary = devices.find((device) => device.id === DEFAULT_EASY68K_HARDWARE_DEVICE_ID) ??
      devices[0] ??
      this.snapshotDevice(
        createDeviceState(normalizeEasy68kHardwareDeviceConfig(DEFAULT_EASY68K_HARDWARE_DEVICE_CONFIG))
      );
    return {
      config: { ...primary.config },
      display: [...primary.display],
      leds: primary.leds,
      switches: primary.switches,
      buttons: primary.buttons,
      version: this.version,
      outputVersion: this.outputVersion,
      topologyVersion: this.topologyVersion,
      devices,
    };
  }

  getDeviceSnapshot(deviceId: string): Easy68kHardwareDeviceSnapshot | undefined {
    const device = this.devices.get(deviceId);
    return device ? this.snapshotDevice(device) : undefined;
  }

  getDeviceConfigs(): NormalizedEasy68kHardwareDeviceConfig[] {
    return [...this.devices.values()].map((device) => ({
      id: device.id,
      deviceType: device.deviceType,
      ...device.config,
    }));
  }

  getAddressRange(): { minAddress: number; maxAddress: number } | undefined {
    const addresses = this.mappedAddressRanges.map((range) => range.start);
    return addresses.length > 0
      ? { minAddress: Math.min(...addresses), maxAddress: Math.max(...addresses) }
      : undefined;
  }

  getMappedAddressRanges(): ReadonlyArray<{ start: number; end: number }> {
    return this.mappedAddressRanges;
  }

  private rebuildMappedAddressRanges(): void {
    const addresses = this.getDeviceConfigs().flatMap((device) =>
      getEasy68kHardwareAddressDescriptors(device, device.id, device.deviceType).flatMap(
        (descriptor) => descriptor.addresses.map(normalizeDeviceAddress)
      )
    );
    this.mappedAddressRanges = [...new Set(addresses)]
      .sort((left, right) => left - right)
      .map((address) => ({ start: address, end: address }));
  }

  getOutputSnapshot(): Easy68kHardwareOutputSnapshot {
    const snapshot = this.getSnapshot();
    return {
      display: snapshot.display,
      leds: snapshot.leds,
      outputVersion: snapshot.outputVersion,
      devices: snapshot.devices.map(({ id, display, leds, outputVersion }) => ({
        id,
        display,
        leds,
        outputVersion,
      })),
    };
  }

  restoreOutputSnapshot(snapshot: Easy68kHardwareOutputSnapshot): void {
    const deviceSnapshots = snapshot.devices ??
      [{
        id: DEFAULT_EASY68K_HARDWARE_DEVICE_ID,
        display: snapshot.display,
        leds: snapshot.leds,
        outputVersion: snapshot.outputVersion,
      }];
    for (const output of deviceSnapshots) {
      const device = this.devices.get(output.id);
      if (!device) {
        continue;
      }
      device.display.set(output.display.slice(0, EASY68K_DISPLAY_DIGITS));
      device.leds = clampByte(output.leds);
      device.outputVersion = output.outputVersion;
      device.version += 1;
    }
    this.outputVersion = snapshot.outputVersion;
    this.version += 1;
  }

  private requireDevice(deviceId: string): Easy68kHardwareDeviceState {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Hardware device "${deviceId}" is unavailable.`);
    }
    return device;
  }

  private snapshotDevice(device: Easy68kHardwareDeviceState): Easy68kHardwareDeviceSnapshot {
    return {
      id: device.id,
      deviceType: device.deviceType,
      config: { ...device.config },
      display: Array.from(device.display),
      leds: device.leds,
      switches: device.switches,
      buttons: clampByte(~device.pressedButtons),
      version: device.version,
      outputVersion: device.outputVersion,
    };
  }

  private bumpOutputVersion(device: Easy68kHardwareDeviceState): void {
    device.outputVersion += 1;
    device.version += 1;
    this.outputVersion += 1;
    this.version += 1;
  }
}
