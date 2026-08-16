import type { UndoCaptureMode } from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  InterpreterWorkerClient,
  type InterpreterWorkerLike,
} from '@/runtime/worker/InterpreterWorkerClient';

function createBrowserWorker(): Worker {
  return new Worker(new URL('./interpreter.worker.ts', import.meta.url), {
    type: 'module',
    name: 'm68k-interpreter-worker',
  });
}

export function supportsInterpreterWorkerRuntime(): boolean {
  return typeof Worker === 'function';
}

export class AsyncRuntimeMutationRequiredError extends Error {
  constructor(operation: string) {
    super(`${operation} must be awaited through the runtime command port`);
    this.name = 'AsyncRuntimeMutationRequiredError';
  }
}

export function createWorkerIdeRuntimeSession(
  workerLike: InterpreterWorkerLike = createBrowserWorker()
): IdeRuntimeSession {
  const client = new InterpreterWorkerClient(workerLike);
  let undoCaptureMode: UndoCaptureMode = 'full';

  const session: IdeRuntimeSession = {
    clearInputQueue: () => {
      throw new AsyncRuntimeMutationRequiredError('clearInputQueue');
    },
    configureHardware: () => {
      throw new AsyncRuntimeMutationRequiredError('configureHardware');
    },
    configureHardwareDevices: () => {
      throw new AsyncRuntimeMutationRequiredError('configureHardwareDevices');
    },
    setHardwareToggle: (bit, enabled, deviceId) => {
      void bit;
      void enabled;
      void deviceId;
      throw new AsyncRuntimeMutationRequiredError('setHardwareToggle');
    },
    setHardwareButton: (bit, pressed, deviceId) => {
      void bit;
      void pressed;
      void deviceId;
      throw new AsyncRuntimeMutationRequiredError('setHardwareButton');
    },
    requestInterruptLevel: () => {
      throw new AsyncRuntimeMutationRequiredError('requestInterruptLevel');
    },
    emulationStep: () => {
      throw new Error('Worker-backed runtime does not support synchronous emulationStep()');
    },
    queueInput: (input) => {
      void input;
      throw new AsyncRuntimeMutationRequiredError('queueInput');
    },
    raiseExternalInterrupt: (handlerAddress) => {
      void handlerAddress;
      throw new AsyncRuntimeMutationRequiredError('raiseExternalInterrupt');
    },
    reset: () => {
      throw new AsyncRuntimeMutationRequiredError('reset');
    },
    undoFromStack: () => {
      throw new AsyncRuntimeMutationRequiredError('undoFromStack');
    },
    writeMemoryByte: (address, value) => {
      void address;
      void value;
      throw new AsyncRuntimeMutationRequiredError('writeMemoryByte');
    },
    writeMemoryLong: (address, value) => {
      void address;
      void value;
      throw new AsyncRuntimeMutationRequiredError('writeMemoryLong');
    },
    writeMemoryWord: (address, value) => {
      void address;
      void value;
      throw new AsyncRuntimeMutationRequiredError('writeMemoryWord');
    },
    setRegisterValue: (register, value) => {
      void register;
      void value;
      throw new AsyncRuntimeMutationRequiredError('setRegisterValue');
    },
    resizeTerminal: (columns, rows) => {
      void columns;
      void rows;
      throw new AsyncRuntimeMutationRequiredError('resizeTerminal');
    },
    setUndoCaptureMode: (mode, checkpointInterval) => {
      void mode;
      void checkpointInterval;
      throw new AsyncRuntimeMutationRequiredError('setUndoCaptureMode');
    },
    getUndoCaptureMode: () => undoCaptureMode,
    forceUndoCheckpoint: () => {
      throw new AsyncRuntimeMutationRequiredError('forceUndoCheckpoint');
    },
    controller: client,
    getRuntimeTransport: () => 'worker',
    getCFlag: client.getCFlag.bind(client),
    getCCR: client.getCCR.bind(client),
    getErrors: client.getErrors.bind(client),
    getException: client.getException.bind(client),
    getLastInstruction: client.getLastInstruction.bind(client),
    getMemory: client.getMemory.bind(client),
    getMemoryMeta: client.getMemoryMeta.bind(client),
    getNFlag: client.getNFlag.bind(client),
    getPC: client.getPC.bind(client),
    getQueuedInputLength: client.getQueuedInputLength.bind(client),
    getRegisters: client.getRegisters.bind(client),
    getSR: client.getSR.bind(client),
    getSSP: client.getSSP.bind(client),
    getVBR: client.getVBR.bind(client),
    getSFC: client.getSFC.bind(client),
    getDFC: client.getDFC.bind(client),
    readMemoryRange: client.readMemoryRange.bind(client),
    getSymbolAddress: client.getSymbolAddress.bind(client),
    getSymbols: client.getSymbols.bind(client),
    getTerminalFrameBuffer: client.getTerminalFrameBuffer.bind(client),
    getTerminalLines: client.getTerminalLines.bind(client),
    getTerminalMeta: client.getTerminalMeta.bind(client),
    getTerminalText: client.getTerminalText.bind(client),
    getTerminalSnapshot: client.getTerminalSnapshot.bind(client),
    getUSP: client.getUSP.bind(client),
    getVFlag: client.getVFlag.bind(client),
    getXFlag: client.getXFlag.bind(client),
    getZFlag: client.getZFlag.bind(client),
    isHalted: client.isHalted.bind(client),
    isWaitingForInput: client.isWaitingForInput.bind(client),
    getRuntimeSyncVersions: client.getRuntimeSyncVersions.bind(client),
    getHardwareSnapshot: client.getHardwareSnapshot.bind(client),
  };

  return session;
}
