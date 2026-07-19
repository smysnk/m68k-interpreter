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

export interface Easy68kHardwareConfig {
  displayBase: number;
  ledAddress: number;
  switchAddress: number;
  buttonAddress: number;
}

export interface Easy68kHardwareOutputSnapshot {
  display: readonly number[];
  leds: number;
  outputVersion: number;
}

export interface Easy68kHardwareSnapshot extends Easy68kHardwareOutputSnapshot {
  config: Easy68kHardwareConfig;
  switches: number;
  buttons: number;
  version: number;
}

export interface Easy68kHardwareValidationResult {
  valid: boolean;
  config?: Easy68kHardwareConfig;
  conflicts: readonly DeviceAddressConflict[];
  errors: readonly string[];
}

export const DEFAULT_EASY68K_HARDWARE_CONFIG: Readonly<Easy68kHardwareConfig> = {
  displayBase: 0xe00000,
  ledAddress: 0xe00010,
  switchAddress: 0xe00010,
  buttonAddress: 0xe00012,
};

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

export function getEasy68kHardwareAddressDescriptors(
  config: Easy68kHardwareConfig
): DeviceAddressDescriptor[] {
  const normalized = normalizeEasy68kHardwareConfig(config);
  return [
    {
      device: 'display',
      direction: 'write',
      addresses: Array.from({ length: EASY68K_DISPLAY_DIGITS }, (_, index) =>
        getEasy68kDisplayAddress(normalized.displayBase, index)
      ),
    },
    { device: 'leds', direction: 'write', addresses: [normalized.ledAddress] },
    { device: 'switches', direction: 'read', addresses: [normalized.switchAddress] },
    { device: 'buttons', direction: 'read', addresses: [normalized.buttonAddress] },
  ];
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

function clampByte(value: number): number {
  return value & 0xff;
}

export class Easy68kHardware {
  private config: Easy68kHardwareConfig;
  private display = new Uint8Array(EASY68K_DISPLAY_DIGITS);
  private leds = 0;
  private switches = 0;
  private pressedButtons = 0;
  private version = 1;
  private outputVersion = 1;

  constructor(config: Easy68kHardwareConfig = DEFAULT_EASY68K_HARDWARE_CONFIG) {
    const validation = validateEasy68kHardwareConfig(config);
    if (!validation.valid || !validation.config) {
      throw new Error(validation.errors.join(' '));
    }
    this.config = validation.config;
  }

  readByte(address: number): number | undefined {
    const normalized = normalizeDeviceAddress(address);
    if (normalized === this.config.switchAddress) {
      return this.switches;
    }
    if (normalized === this.config.buttonAddress) {
      return clampByte(~this.pressedButtons);
    }
    return undefined;
  }

  writeByte(address: number, value: number): boolean {
    const normalized = normalizeDeviceAddress(address);
    const byte = clampByte(value);
    if (normalized === this.config.ledAddress) {
      if (this.leds !== byte) {
        this.leds = byte;
        this.bumpOutputVersion();
      }
      return true;
    }
    for (let index = 0; index < EASY68K_DISPLAY_DIGITS; index += 1) {
      if (normalized !== getEasy68kDisplayAddress(this.config.displayBase, index)) {
        continue;
      }
      if (this.display[index] !== byte) {
        this.display[index] = byte;
        this.bumpOutputVersion();
      }
      return true;
    }
    return false;
  }

  configure(config: Easy68kHardwareConfig): Easy68kHardwareValidationResult {
    const validation = validateEasy68kHardwareConfig(config);
    if (!validation.valid || !validation.config) {
      return validation;
    }
    const changed = Object.keys(validation.config).some(
      (key) => validation.config![key as keyof Easy68kHardwareConfig] !== this.config[key as keyof Easy68kHardwareConfig]
    );
    if (changed) {
      this.config = validation.config;
      this.version += 1;
    }
    return validation;
  }

  setToggle(bit: number, enabled: boolean): void {
    if (bit < 0 || bit > 7) {
      throw new RangeError('Toggle bit must be between 0 and 7.');
    }
    const mask = 1 << bit;
    const next = enabled ? this.switches | mask : this.switches & ~mask;
    if (next !== this.switches) {
      this.switches = next;
      this.version += 1;
    }
  }

  setButton(bit: number, pressed: boolean): void {
    if (bit < 0 || bit > 7) {
      throw new RangeError('Button bit must be between 0 and 7.');
    }
    const mask = 1 << bit;
    const next = pressed ? this.pressedButtons | mask : this.pressedButtons & ~mask;
    if (next !== this.pressedButtons) {
      this.pressedButtons = next;
      this.version += 1;
    }
  }

  reset(): void {
    const outputChanged = this.leds !== 0 || this.display.some((value) => value !== 0);
    const buttonsChanged = this.pressedButtons !== 0;
    this.leds = 0;
    this.display.fill(0);
    this.pressedButtons = 0;
    if (outputChanged) {
      this.outputVersion += 1;
    }
    if (outputChanged || buttonsChanged) {
      this.version += 1;
    }
  }

  getSnapshot(): Easy68kHardwareSnapshot {
    return {
      config: { ...this.config },
      display: Array.from(this.display),
      leds: this.leds,
      switches: this.switches,
      buttons: clampByte(~this.pressedButtons),
      version: this.version,
      outputVersion: this.outputVersion,
    };
  }

  getOutputSnapshot(): Easy68kHardwareOutputSnapshot {
    return {
      display: Array.from(this.display),
      leds: this.leds,
      outputVersion: this.outputVersion,
    };
  }

  restoreOutputSnapshot(snapshot: Easy68kHardwareOutputSnapshot): void {
    this.display.set(snapshot.display.slice(0, EASY68K_DISPLAY_DIGITS));
    this.leds = clampByte(snapshot.leds);
    this.outputVersion = snapshot.outputVersion;
    this.version += 1;
  }

  private bumpOutputVersion(): void {
    this.outputVersion += 1;
    this.version += 1;
  }
}
