import type { Memory } from '../core/memory';
import { createAddressSpacePolicy, type AddressSpacePolicy } from '../cpu/addressSpace';
import type { StepResult } from '../core/execution';
import type { StrictM68000Core } from '../cpu/core';
import type { MemoryBus, MemoryMappedDevice } from '../cpu/memoryBus';
import {
  Easy68kHardware,
  getEasy68kInterruptVectorAddress,
  type Easy68kHardwareConfig,
  type Easy68kHardwareDeviceConfig,
  type Easy68kHardwareOutputSnapshot,
} from '../devices/easy68kHardware';
import { TerminalDevice } from '../devices/terminal';
import type { CpuModel, MachineProfile } from '../isa/types';
import { MappedMemoryBus } from './mappedMemoryBus';

export type MachineSnapshot = unknown;

export interface MachineTrapContext {
  core: StrictM68000Core;
  inputQueue: number[];
  setWaiting(task: number): void;
  clearWaiting(): void;
  halt(): void;
}

export interface MachineAdapter {
  readonly id: MachineProfile;
  readonly bus: MemoryBus;
  readonly terminal: TerminalDevice;
  readonly hardware: Easy68kHardware;
  readonly mappedHardwareConnected: boolean;
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
  beforeRamWrite?: (address: number) => void;
  cpuModel?: CpuModel;
  addressSpace?: AddressSpacePolicy;
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

  protected constructor(memory: Memory, options: MachineAdapterOptions & { mapHardware: boolean }) {
    this.terminal = new TerminalDevice({ columns: options.columns, rows: options.rows });
    this.hardware = new Easy68kHardware(options.hardwareDevices ?? options.hardwareConfig);
    const devices = options.mapHardware ? [new Easy68kHardwareMappedDevice(this.hardware)] : [];
    this.bus = new MappedMemoryBus(
      memory,
      devices,
      options.beforeRamWrite,
      options.addressSpace ?? createAddressSpacePolicy(options.cpuModel ?? 'm68000')
    );
  }

  handleTrap(_context: MachineTrapContext): StepResult | undefined {
    return undefined;
  }

  validateInterruptVector(_level: number, _vectorBase = 0): string | undefined {
    return undefined;
  }

  snapshot(): MachineSnapshot {
    return this.hardware.getOutputSnapshot();
  }

  restore(snapshot: MachineSnapshot): void {
    this.hardware.restoreOutputSnapshot(snapshot as Easy68kHardwareOutputSnapshot);
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

  constructor(memory: Memory, options: MachineAdapterOptions = {}) {
    super(memory, { ...options, mapHardware: true });
  }

  override handleTrap(context: MachineTrapContext): StepResult | undefined {
    const pcBefore = context.core.state.pc >>> 0;
    const opcode = this.bus.read16(pcBefore, 'fetch');
    if ((opcode & 0xfff0) !== 0x4e40) return undefined;
    const vector = opcode & 0x0f;
    const task = this.bus.read16(pcBefore + 2, 'fetch');
    const pcAfter = context.core.normalizeAddress(pcBefore + 4);

    if (vector === 11 && task === 0) {
      context.core.state.pc = pcAfter;
      context.halt();
      return { kind: 'halted', pc: pcAfter };
    }
    if (vector !== 15) return undefined;
    if (task === 1) {
      this.terminal.writeByte(context.core.state.d[0] & 0xff);
    } else if (task === 3) {
      context.core.state.pc = pcAfter;
      if (context.inputQueue.length === 0) {
        context.setWaiting(task);
        return { kind: 'waiting', pc: pcAfter };
      }
      const byte = context.inputQueue.shift() ?? 0;
      context.core.state.d[0] = (context.core.state.d[0] & 0xffff_ff00) | (byte & 0xff);
    } else if (task === 4) {
      context.core.state.ccr =
        context.inputQueue.length > 0
          ? context.core.state.ccr & ~0x04
          : context.core.state.ccr | 0x04;
    } else {
      return undefined;
    }
    context.clearWaiting();
    context.core.state.pc = pcAfter;
    return { kind: 'executed', pcBefore, pcAfter };
  }

  override validateInterruptVector(level: number, vectorBase = 0): string | undefined {
    const vectorAddress = (vectorBase + getEasy68kInterruptVectorAddress(level)) >>> 0;
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
