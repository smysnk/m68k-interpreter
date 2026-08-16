import type { CoprocessorId, CpuModel } from '../isa/types';
import type { BusFunctionCode } from './memoryBus';

export type CoprocessorOperation =
  | 'branch'
  | 'decrement-branch'
  | 'general'
  | 'restore'
  | 'save'
  | 'set-condition'
  | 'trap-condition';

export interface CoprocessorRequest {
  readonly id: CoprocessorId;
  readonly operation: CoprocessorOperation;
  readonly commandWord: number;
  readonly extensionWords: readonly number[];
  readonly instructionAddress: number;
  readonly functionCode: BusFunctionCode;
  readonly supervisor: boolean;
  readonly effectiveAddress?: {
    readonly mode: number;
    readonly register: number;
    readonly address: number;
    read(length: number): Uint8Array;
    write(bytes: Uint8Array): void;
  };
}

export type CoprocessorResult =
  | { readonly kind: 'completed'; readonly stateChanged?: boolean }
  | { readonly kind: 'condition'; readonly true: boolean }
  | { readonly kind: 'operand-transfer'; readonly value: Uint8Array }
  | {
      readonly kind: 'exception';
      readonly vector: number;
      readonly message: string;
      readonly restartable?: boolean;
    }
  | { readonly kind: 'protocol-violation'; readonly message: string }
  | { readonly kind: 'suspended'; readonly token: string };

export interface CoprocessorStateSnapshot {
  readonly device: string;
  readonly version: number;
  readonly payload: unknown;
}

export interface CoprocessorDevice {
  readonly id: CoprocessorId;
  readonly device: string;
  readonly compatibleCpuModels: ReadonlySet<CpuModel>;
  execute(request: CoprocessorRequest): CoprocessorResult;
  snapshot(): CoprocessorStateSnapshot;
  restore(snapshot: CoprocessorStateSnapshot): void;
  reset(): void;
}

export class CoprocessorRegistry {
  private readonly slots = new Map<CoprocessorId, CoprocessorDevice>();

  constructor(devices: readonly CoprocessorDevice[] = []) {
    for (const device of devices) this.attach(device);
  }

  attach(device: CoprocessorDevice): void {
    if (this.slots.has(device.id)) {
      throw new Error(`Coprocessor slot ${device.id} is already occupied`);
    }
    this.slots.set(device.id, device);
  }

  detach(id: CoprocessorId): CoprocessorDevice | undefined {
    const device = this.slots.get(id);
    this.slots.delete(id);
    return device;
  }

  get(id: CoprocessorId): CoprocessorDevice | undefined {
    return this.slots.get(id);
  }

  execute(request: CoprocessorRequest, cpuModel: CpuModel): CoprocessorResult {
    const device = this.slots.get(request.id);
    if (device === undefined) {
      return {
        kind: 'exception',
        vector: 11,
        message: `No coprocessor is attached in slot ${request.id}`,
      };
    }
    if (!device.compatibleCpuModels.has(cpuModel)) {
      return {
        kind: 'protocol-violation',
        message: `${device.device} is incompatible with ${cpuModel}`,
      };
    }
    return device.execute(request);
  }

  snapshot(): Readonly<Record<number, CoprocessorStateSnapshot>> {
    return Object.freeze(
      Object.fromEntries([...this.slots].map(([id, device]) => [id, device.snapshot()]))
    );
  }

  restore(snapshots: Readonly<Record<number, CoprocessorStateSnapshot>>): void {
    for (const [idText, snapshot] of Object.entries(snapshots)) {
      const id = Number(idText) as CoprocessorId;
      const device = this.slots.get(id);
      if (device === undefined) {
        throw new Error(`Cannot restore unattached coprocessor slot ${id}`);
      }
      if (device.device !== snapshot.device) {
        throw new Error(
          `Coprocessor slot ${id} contains ${device.device}, not snapshot device ${snapshot.device}`
        );
      }
      device.restore(snapshot);
    }
  }

  reset(): void {
    for (const device of this.slots.values()) device.reset();
  }

  list(): readonly CoprocessorDevice[] {
    return [...this.slots.values()];
  }
}
