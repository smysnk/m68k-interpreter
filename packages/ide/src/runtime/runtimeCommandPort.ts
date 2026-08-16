import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import type { RuntimeSessionStore } from '@/runtime/runtimeSessionStore';
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';
import type {
  TerminalTouchPacket,
  TerminalTouchProtocolSymbols,
} from '@/runtime/terminalTouchProtocol';
import type {
  Easy68kHardwareConfig,
  Easy68kHardwareDeviceConfig,
  Easy68kHardwareValidationResult,
  InterruptRequestResult,
  UndoCaptureMode,
} from '@m68k/interpreter';
import { validateEasy68kHardwareDevices } from '@m68k/interpreter';
import type { WorkerExecutionConfig } from '@/runtime/worker/interpreterWorkerProtocol';
import type { RuntimeLoadRequest } from '@/runtime/worker/interpreterWorkerProtocol';
import { hardwareSurfaceStore } from '@/runtime/hardwareSurfaceStore';

function publishInProcessHardware(runtime: IdeRuntimeSession): void {
  if (!runtime.controller && runtime.getHardwareSnapshot) {
    hardwareSurfaceStore.publish(runtime.getHardwareSnapshot());
  }
}

export class RuntimeUnavailableError extends Error {
  constructor() {
    super('The emulator runtime is not available');
    this.name = 'RuntimeUnavailableError';
  }
}

export class StaleRuntimeCommandError extends Error {
  constructor(
    readonly submittedEpoch: number,
    readonly currentEpoch: number
  ) {
    super(
      `Runtime command belongs to stale epoch ${submittedEpoch}; current epoch is ${currentEpoch}`
    );
    this.name = 'StaleRuntimeCommandError';
  }
}

export class RuntimeCommandPort {
  private tail: Promise<void> = Promise.resolve();
  private automaticInterruptTimer: ReturnType<typeof setTimeout> | null = null;
  private automaticInterruptLevels: number[] = [];
  private automaticInterruptIntervalMs = 1000;
  private automaticInterruptConfigurationKey = '';
  private hardwareDeviceConfigurationKey = '';

  constructor(private readonly sessions: RuntimeSessionStore) {}

  private enqueue<T>(operation: (runtime: IdeRuntimeSession) => Promise<T> | T): Promise<T> {
    const submitted = this.sessions.getSnapshot();
    const result = this.tail.then(async () => {
      const current = this.sessions.getSnapshot();
      if (current.epoch !== submitted.epoch || current.session !== submitted.session) {
        throw new StaleRuntimeCommandError(submitted.epoch, current.epoch);
      }
      const runtime = current.session;
      if (!runtime) {
        throw new RuntimeUnavailableError();
      }
      return await operation(runtime);
    });
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  queueInput(input: string | number | number[]): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestQueueInput(input);
      } else {
        runtime.queueInput(input);
      }
    });
  }

  initialize(): Promise<void> {
    return this.enqueue(async (runtime) => {
      await runtime.controller?.initialize?.();
    });
  }

  loadProgram(request: RuntimeLoadRequest): Promise<void> {
    this.hardwareDeviceConfigurationKey = '';
    return this.enqueue(async (runtime) => {
      await runtime.controller?.requestLoadProgram(request);
    });
  }

  run(config?: WorkerExecutionConfig): Promise<boolean> {
    return this.enqueue(async (runtime) => {
      if (!runtime.controller) {
        return false;
      }
      await runtime.controller.requestRun(config);
      return true;
    });
  }

  resume(config?: WorkerExecutionConfig): Promise<boolean> {
    return this.enqueue(async (runtime) => {
      if (!runtime.controller) {
        return false;
      }
      await runtime.controller.requestResume(config);
      return true;
    });
  }

  pause(): Promise<boolean> {
    return this.enqueue(async (runtime) => {
      if (!runtime.controller) {
        return false;
      }
      await runtime.controller.requestPause();
      return true;
    });
  }

  pulse(frameBudgetMs?: number): Promise<boolean> {
    return this.enqueue(async (runtime) => {
      if (!runtime.controller?.requestPulseExecution) {
        return false;
      }
      return await runtime.controller.requestPulseExecution(frameBudgetMs);
    });
  }

  configureExecution(config: WorkerExecutionConfig): Promise<void> {
    return this.enqueue(async (runtime) => {
      await runtime.controller?.requestConfigureExecution?.(config);
    });
  }

  clearInputQueue(): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestClearInputQueue();
      } else {
        runtime.clearInputQueue();
      }
    });
  }

  configureHardware(config: Easy68kHardwareConfig): Promise<Easy68kHardwareValidationResult> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        return await runtime.controller.requestConfigureHardware(config);
      }
      if (!runtime.configureHardware) {
        return { valid: false, conflicts: [], errors: ['Hardware runtime is unavailable'] };
      }
      const result = runtime.configureHardware(config);
      publishInProcessHardware(runtime);
      return result;
    });
  }

  configureHardwareDevices(
    devices: readonly Easy68kHardwareDeviceConfig[]
  ): Promise<Easy68kHardwareValidationResult> {
    const normalized = devices.map((device) => ({ ...device }));
    const signature = normalized
      .map((device) =>
        device.deviceType === 'display'
          ? `${device.id}:display:${device.displayBase}`
          : device.deviceType === 'digital-io'
            ? `${device.id}:digital-io:${device.ledAddress}:${device.switchAddress}:${device.buttonAddress}`
            : `${device.id}:board:${device.displayBase}:${device.ledAddress}:${device.switchAddress}:${device.buttonAddress}`
      )
      .join('|');
    const key = `${this.sessions.getSnapshot().epoch}:${signature}`;
    if (key === this.hardwareDeviceConfigurationKey) {
      return Promise.resolve(validateEasy68kHardwareDevices(normalized));
    }
    this.hardwareDeviceConfigurationKey = key;
    const operation = this.enqueue(async (runtime) => {
      if (runtime.controller) {
        return await runtime.controller.requestConfigureHardwareDevices(normalized);
      }
      if (!runtime.configureHardwareDevices) {
        return { valid: false, conflicts: [], errors: ['Hardware device runtime is unavailable'] };
      }
      const result = runtime.configureHardwareDevices(normalized);
      publishInProcessHardware(runtime);
      return result;
    });
    return operation.then(
      (result) => {
        if (!result.valid && this.hardwareDeviceConfigurationKey === key) {
          this.hardwareDeviceConfigurationKey = '';
        }
        return result;
      },
      (error) => {
        if (this.hardwareDeviceConfigurationKey === key) {
          this.hardwareDeviceConfigurationKey = '';
        }
        throw error;
      }
    );
  }

  setHardwareToggle(bit: number, enabled: boolean, deviceId?: string): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        if (deviceId) {
          await runtime.controller.requestSetHardwareToggle(bit, enabled, deviceId);
        } else {
          await runtime.controller.requestSetHardwareToggle(bit, enabled);
        }
      } else {
        if (deviceId) {
          runtime.setHardwareToggle?.(bit, enabled, deviceId);
        } else {
          runtime.setHardwareToggle?.(bit, enabled);
        }
        publishInProcessHardware(runtime);
      }
    });
  }

  setHardwareButton(bit: number, pressed: boolean, deviceId?: string): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        if (deviceId) {
          await runtime.controller.requestSetHardwareButton(bit, pressed, deviceId);
        } else {
          await runtime.controller.requestSetHardwareButton(bit, pressed);
        }
      } else {
        if (deviceId) {
          runtime.setHardwareButton?.(bit, pressed, deviceId);
        } else {
          runtime.setHardwareButton?.(bit, pressed);
        }
        publishInProcessHardware(runtime);
      }
    });
  }

  requestInterruptLevel(level: number): Promise<InterruptRequestResult> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        return await runtime.controller.requestInterruptLevel(level);
      }
      return runtime.requestInterruptLevel?.(level) ?? 'rejected';
    });
  }

  configureAutomaticInterrupts(levels: number[], intervalMs: number): Promise<void> {
    const normalizedLevels = [...new Set(levels)]
      .filter((level) => Number.isInteger(level) && level >= 1 && level <= 7)
      .sort((left, right) => right - left);
    const normalizedInterval = Math.max(50, Math.round(intervalMs) || 50);
    const key = `${this.sessions.getSnapshot().epoch}:${normalizedLevels.join(',')}:${normalizedInterval}`;
    if (key === this.automaticInterruptConfigurationKey) {
      return Promise.resolve();
    }
    this.automaticInterruptConfigurationKey = key;
    const operation = this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestConfigureAutomaticInterrupts(
          normalizedLevels,
          normalizedInterval
        );
        return;
      }
      this.cancelLocalAutomaticInterrupts();
      this.automaticInterruptLevels = normalizedLevels;
      this.automaticInterruptIntervalMs = normalizedInterval;
      this.scheduleLocalAutomaticInterruptTick();
    });
    return operation.catch((error) => {
      if (this.automaticInterruptConfigurationKey === key) {
        this.automaticInterruptConfigurationKey = '';
      }
      throw error;
    });
  }

  cancelAutomaticInterrupts(): Promise<void> {
    this.cancelLocalAutomaticInterrupts();
    this.automaticInterruptConfigurationKey = '';
    return this.enqueue(async (runtime) => {
      await runtime.controller?.requestCancelAutomaticInterrupts();
    });
  }

  private scheduleLocalAutomaticInterruptTick(): void {
    if (this.automaticInterruptLevels.length === 0) return;
    this.automaticInterruptTimer = setTimeout(() => {
      this.automaticInterruptTimer = null;
      const runtime = this.sessions.getSession();
      if (runtime && !runtime.controller) {
        for (const level of this.automaticInterruptLevels) {
          runtime.requestInterruptLevel?.(level);
        }
        this.scheduleLocalAutomaticInterruptTick();
      }
    }, this.automaticInterruptIntervalMs);
  }

  private cancelLocalAutomaticInterrupts(): void {
    if (this.automaticInterruptTimer !== null) {
      clearTimeout(this.automaticInterruptTimer);
      this.automaticInterruptTimer = null;
    }
    this.automaticInterruptLevels = [];
  }

  step(): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestStep();
      } else {
        runtime.emulationStep();
      }
    });
  }

  undo(): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestUndo();
      } else {
        runtime.undoFromStack();
      }
    });
  }

  reset(): Promise<void> {
    this.cancelLocalAutomaticInterrupts();
    this.automaticInterruptConfigurationKey = '';
    this.hardwareDeviceConfigurationKey = '';
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestCancelAutomaticInterrupts();
        await runtime.controller.requestReset();
      } else {
        runtime.reset();
        publishInProcessHardware(runtime);
      }
    });
  }

  writeMemoryByte(address: number, value: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestWriteMemoryByte(address, value);
      } else {
        runtime.writeMemoryByte(address, value);
      }
    });
  }

  writeMemoryWord(address: number, value: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestWriteMemoryWord(address, value);
      } else {
        runtime.writeMemoryWord(address, value);
      }
    });
  }

  writeMemoryLong(address: number, value: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestWriteMemoryLong(address, value);
      } else {
        runtime.writeMemoryLong(address, value);
      }
    });
  }

  setRegisterValue(register: number, value: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestSetRegisterValue(register, value);
      } else if (runtime.setRegisterValue) {
        runtime.setRegisterValue(register, value);
      } else {
        runtime.getRegisters()[register] = value;
      }
    });
  }

  setControlRegisterValue(
    register: 'vbr' | 'sfc' | 'dfc' | 'isp' | 'msp' | 'cacr' | 'caar',
    value: number
  ): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestSetControlRegisterValue(register, value);
      } else if (runtime.setControlRegisterValue) {
        runtime.setControlRegisterValue(register, value);
      }
    });
  }

  resizeTerminal(columns: number, rows: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestResizeTerminal(columns, rows);
      } else {
        runtime.resizeTerminal?.(columns, rows);
      }
    });
  }

  setUndoCaptureMode(mode: UndoCaptureMode, checkpointInterval?: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestSetUndoCaptureMode(mode, checkpointInterval);
      } else {
        runtime.setUndoCaptureMode?.(mode, checkpointInterval);
      }
    });
  }

  raiseExternalInterrupt(handlerAddress: number): Promise<boolean> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        return await runtime.controller.requestRaiseExternalInterrupt(handlerAddress);
      }
      return runtime.raiseExternalInterrupt(handlerAddress);
    });
  }

  dispatchTouchPacket(
    protocol: TerminalTouchProtocolSymbols,
    packet: TerminalTouchPacket
  ): Promise<boolean> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        return await runtime.controller.requestDispatchTouchPacket(protocol, packet);
      }
      return runtime.raiseExternalInterrupt(protocol.touchIsr);
    });
  }
}

export const runtimeCommandPort = new RuntimeCommandPort(runtimeSessionStore);
