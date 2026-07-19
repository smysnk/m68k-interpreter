import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import type { RuntimeSessionStore } from '@/runtime/runtimeSessionStore';
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';
import type { TerminalTouchPacket, TerminalTouchProtocolSymbols } from '@/runtime/terminalTouchProtocol';
import type {
  Easy68kHardwareConfig,
  Easy68kHardwareValidationResult,
  InterruptRequestResult,
  UndoCaptureMode,
} from '@m68k/interpreter';
import type { WorkerExecutionConfig } from '@/runtime/worker/interpreterWorkerProtocol';
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

export class RuntimeCommandPort {
  private tail: Promise<void> = Promise.resolve();
  private automaticInterruptTimer: ReturnType<typeof setTimeout> | null = null;
  private automaticInterruptLevels: number[] = [];
  private automaticInterruptIntervalMs = 1000;

  constructor(private readonly sessions: RuntimeSessionStore) {}

  private enqueue<T>(operation: (runtime: IdeRuntimeSession) => Promise<T> | T): Promise<T> {
    const result = this.tail.then(async () => {
      const runtime = this.sessions.getSession();
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

  loadProgram(source: string, columns: number, rows: number): Promise<void> {
    return this.enqueue(async (runtime) => {
      await runtime.controller?.requestLoadProgram(source, columns, rows);
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

  setHardwareToggle(bit: number, enabled: boolean): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestSetHardwareToggle(bit, enabled);
      } else {
        runtime.setHardwareToggle?.(bit, enabled);
        publishInProcessHardware(runtime);
      }
    });
  }

  setHardwareButton(bit: number, pressed: boolean): Promise<void> {
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestSetHardwareButton(bit, pressed);
      } else {
        runtime.setHardwareButton?.(bit, pressed);
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
    return this.enqueue(async (runtime) => {
      if (runtime.controller) {
        await runtime.controller.requestConfigureAutomaticInterrupts(levels, intervalMs);
        return;
      }
      this.cancelLocalAutomaticInterrupts();
      this.automaticInterruptLevels = [...new Set(levels)]
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 7)
        .sort((left, right) => right - left);
      this.automaticInterruptIntervalMs = Math.max(50, Math.round(intervalMs) || 50);
      this.scheduleLocalAutomaticInterruptTick();
    });
  }

  cancelAutomaticInterrupts(): Promise<void> {
    this.cancelLocalAutomaticInterrupts();
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
