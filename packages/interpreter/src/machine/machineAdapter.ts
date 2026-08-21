import type { Memory } from '../core/memory';
import type { StepResult } from '../core/execution';
import type { BusAccess, MemoryBus, MemoryMappedDevice } from '../cpu/memoryBus';
import {
  Easy68kHardware,
  getEasy68kInterruptVectorAddress,
  type Easy68kHardwareConfig,
  type Easy68kHardwareDeviceConfig,
  type Easy68kHardwareOutputSnapshot,
} from '../devices/easy68kHardware';
import { Easy68kGraphicsDevice, type Easy68kGraphicsSnapshot } from '../devices/easy68kGraphics';
import {
  Easy68kSoundDevice,
  type Easy68kSoundAsset,
  type Easy68kSoundSnapshot,
} from '../devices/easy68kSound';
import { TerminalDevice } from '../devices/terminal';
import type { MachineProfile } from '../isa/types';
import { Easy68kTrapDispatcher, type Easy68kTrapContext } from './easy68kTrapServices';
import { MappedMemoryBus } from './mappedMemoryBus';

export interface MachineSnapshotV2 {
  version: 2;
  hardware: Easy68kHardwareOutputSnapshot;
  graphics?: Easy68kGraphicsSnapshot;
  sound?: Easy68kSoundSnapshot;
}

export type MachineSnapshot = MachineSnapshotV2;

export type MachineTrapContext = Easy68kTrapContext;

export interface MachineAdapter {
  readonly id: MachineProfile;
  readonly bus: MemoryBus;
  readonly terminal: TerminalDevice;
  readonly hardware: Easy68kHardware;
  readonly graphics?: Easy68kGraphicsDevice;
  readonly sound?: Easy68kSoundDevice;
  readonly mappedHardwareConnected: boolean;
  setBusAccessObserver(observer: ((access: BusAccess) => void) | undefined): void;
  handleTrap(context: MachineTrapContext): StepResult | undefined;
  validateInterruptVector(level: number, vectorBase?: number): string | undefined;
  snapshot(): MachineSnapshot;
  restore(snapshot: MachineSnapshot): void;
  reset(): void;
}

export interface MachineAdapterOptions {
  columns?: number;
  rows?: number;
  hardwareConfig?: Easy68kHardwareConfig;
  hardwareDevices?: readonly Easy68kHardwareDeviceConfig[];
  mapHardware?: boolean;
  soundAssets?: readonly Easy68kSoundAsset[];
  beforeRamWrite?: (address: number) => void;
}

class Easy68kHardwareMappedDevice implements MemoryMappedDevice<Easy68kHardwareOutputSnapshot> {
  readonly id = 'easy68k-hardware';

  constructor(private readonly hardware: Easy68kHardware) {}

  addressRanges() {
    return this.hardware.getMappedAddressRanges();
  }

  read8(address: number): number | undefined {
    return this.hardware.readByte(address);
  }

  write8(address: number, value: number): boolean {
    return this.hardware.writeByte(address, value);
  }

  snapshot(): Easy68kHardwareOutputSnapshot {
    return this.hardware.getOutputSnapshot();
  }

  reset(): void {
    this.hardware.reset();
  }
}

abstract class BaseMachineAdapter implements MachineAdapter {
  abstract readonly id: MachineProfile;
  abstract readonly mappedHardwareConnected: boolean;
  readonly terminal: TerminalDevice;
  readonly hardware: Easy68kHardware;
  readonly bus: MemoryBus;
  private readonly mappedBus: MappedMemoryBus;

  protected constructor(memory: Memory, options: MachineAdapterOptions & { mapHardware: boolean }) {
    this.terminal = new TerminalDevice({ columns: options.columns, rows: options.rows });
    this.hardware = new Easy68kHardware(options.hardwareDevices ?? options.hardwareConfig);
    const devices = options.mapHardware ? [new Easy68kHardwareMappedDevice(this.hardware)] : [];
    this.mappedBus = new MappedMemoryBus(memory, devices, options.beforeRamWrite);
    this.bus = this.mappedBus;
  }

  setBusAccessObserver(observer: ((access: BusAccess) => void) | undefined): void {
    this.mappedBus.setAccessObserver(observer);
  }

  handleTrap(_context: MachineTrapContext): StepResult | undefined {
    return undefined;
  }

  validateInterruptVector(_level: number, _vectorBase = 0): string | undefined {
    return undefined;
  }

  snapshot(): MachineSnapshot {
    return { version: 2, hardware: this.hardware.getOutputSnapshot() };
  }

  restore(snapshot: MachineSnapshot): void {
    this.hardware.restoreOutputSnapshot(snapshot.hardware);
  }

  reset(): void {
    this.hardware.reset();
    this.terminal.reset();
  }
}

export class BareMachineAdapter extends BaseMachineAdapter {
  readonly id = 'bare' as const;
  readonly mappedHardwareConnected = false;

  constructor(memory: Memory, options: MachineAdapterOptions = {}) {
    super(memory, { ...options, mapHardware: false });
  }
}

export class Easy68kMachineAdapter extends BaseMachineAdapter {
  readonly id = 'easy68k' as const;
  readonly mappedHardwareConnected = true;
  readonly graphics: Easy68kGraphicsDevice;
  readonly sound: Easy68kSoundDevice;
  private readonly trapDispatcher: Easy68kTrapDispatcher;

  constructor(memory: Memory, options: MachineAdapterOptions = {}) {
    super(memory, { ...options, mapHardware: true });
    this.graphics = new Easy68kGraphicsDevice();
    this.sound = new Easy68kSoundDevice(options.soundAssets);
    this.trapDispatcher = new Easy68kTrapDispatcher({
      bus: this.bus,
      terminal: this.terminal,
      graphics: this.graphics,
      sound: this.sound,
    });
  }

  override handleTrap(context: MachineTrapContext): StepResult | undefined {
    return this.trapDispatcher.handle(context);
  }

  override snapshot(): MachineSnapshot {
    return {
      version: 2,
      hardware: this.hardware.getOutputSnapshot(),
      graphics: this.graphics.snapshot(),
      sound: this.sound.getSnapshot(),
    };
  }

  override restore(snapshot: MachineSnapshot): void {
    super.restore(snapshot);
    if (snapshot.graphics) this.graphics.restore(snapshot.graphics);
    if (snapshot.sound) this.sound.restore(snapshot.sound);
  }

  override reset(): void {
    super.reset();
    this.graphics.reset();
    this.sound.reset();
  }

  override validateInterruptVector(level: number, vectorBase = 0): string | undefined {
    const vectorAddress = (vectorBase + getEasy68kInterruptVectorAddress(level)) & 0x00ff_ffff;
    return this.bus.read32(vectorAddress) === 0
      ? `Invalid or missing IRQ ${level} autovector at $${vectorAddress.toString(16).toUpperCase()}`
      : undefined;
  }
}

export function createMachineAdapter(
  profile: MachineProfile,
  memory: Memory,
  options: MachineAdapterOptions = {}
): MachineAdapter {
  return profile === 'easy68k'
    ? new Easy68kMachineAdapter(memory, options)
    : new BareMachineAdapter(memory, options);
}
