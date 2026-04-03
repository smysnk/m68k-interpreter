import type { UndoCaptureMode } from '@m68k/interpreter';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import { InterpreterWorkerClient, type InterpreterWorkerLike } from '@/runtime/worker/InterpreterWorkerClient';

function createBrowserWorker(): Worker {
  return new Worker(new URL('./interpreter.worker.ts', import.meta.url), {
    type: 'module',
    name: 'm68k-interpreter-worker',
  });
}

export function supportsInterpreterWorkerRuntime(): boolean {
  return typeof Worker === 'function';
}

export function createWorkerIdeRuntimeSession(
  workerLike: InterpreterWorkerLike = createBrowserWorker()
): IdeRuntimeSession {
  const client = new InterpreterWorkerClient(workerLike);
  let undoCaptureMode: UndoCaptureMode = 'full';

  const session: IdeRuntimeSession = {
    clearInputQueue: () => {
      void client.requestClearInputQueue();
    },
    emulationStep: () => {
      throw new Error('Worker-backed runtime does not support synchronous emulationStep()');
    },
    queueInput: (input) => {
      void client.requestQueueInput(input);
    },
    raiseExternalInterrupt: (handlerAddress) => {
      void client.requestRaiseExternalInterrupt(handlerAddress);
      return true;
    },
    reset: () => {
      void client.requestReset();
    },
    undoFromStack: () => {
      void client.requestUndo();
    },
    writeMemoryByte: (address, value) => {
      void client.requestWriteMemoryByte(address, value);
    },
    writeMemoryLong: (address, value) => {
      void client.requestWriteMemoryLong(address, value);
    },
    writeMemoryWord: (address, value) => {
      void client.requestWriteMemoryWord(address, value);
    },
    setRegisterValue: (register, value) => {
      void client.requestSetRegisterValue(register, value);
    },
    resizeTerminal: (columns, rows) => {
      void client.requestResizeTerminal(columns, rows);
    },
    setUndoCaptureMode: (mode, checkpointInterval) => {
      undoCaptureMode = mode;
      void client.requestSetUndoCaptureMode(mode, checkpointInterval);
    },
    getUndoCaptureMode: () => undoCaptureMode,
    forceUndoCheckpoint: () => undefined,
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
  };

  return session;
}
