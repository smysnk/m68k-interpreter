import { describe, expect, it, vi } from 'vitest';
import {
  createTerminalFrameBuffer,
  encodeTerminalByte,
  writeTerminalFrameBufferCell,
} from '@m68k/interpreter';
import {
  getIdePerformanceSnapshot,
  resetIdePerformanceTelemetry,
} from '@/runtime/idePerformanceTelemetry';
import { InterpreterWorkerClient, type InterpreterWorkerLike } from '@/runtime/worker/InterpreterWorkerClient';
import { buildRuntimeFrameSyncPayload } from '@/runtime/runtimeFramePayload';
import type { InterpreterWorkerCommand, InterpreterWorkerEvent } from '@/runtime/worker/interpreterWorkerProtocol';

class MockWorker implements InterpreterWorkerLike {
  readonly postMessage = vi.fn<(message: InterpreterWorkerCommand) => void>();
  readonly terminate = vi.fn<() => void>();
  private listener: ((event: { data: InterpreterWorkerEvent }) => void) | null = null;

  addEventListener(
    type: 'message',
    listener: (event: { data: InterpreterWorkerEvent }) => void
  ): void {
    if (type === 'message') {
      this.listener = listener;
    }
  }

  removeEventListener(
    type: 'message',
    listener: (event: { data: InterpreterWorkerEvent }) => void
  ): void {
    if (type === 'message' && this.listener === listener) {
      this.listener = null;
    }
  }

  emit(data: InterpreterWorkerEvent): void {
    this.listener?.({ data });
  }
}

function buildTerminalFrameBufferSnapshot(text: string) {
  const frameBuffer = createTerminalFrameBuffer(text.length, 1);

  for (let index = 0; index < text.length; index += 1) {
    writeTerminalFrameBufferCell(frameBuffer, 0, index, {
      charByte: encodeTerminalByte(text[index]),
    });
  }

  return {
    columns: frameBuffer.columns,
    rows: frameBuffer.rows,
    version: frameBuffer.version,
    geometryVersion: frameBuffer.geometryVersion,
    data: new Uint8Array(frameBuffer.data),
    dirtyRows: [0],
  };
}

describe('InterpreterWorkerClient', () => {
  it('performs the init handshake through the worker protocol', async () => {
    (
      window as typeof window & {
        __M68K_IDE_PERF_ENABLED__?: boolean;
      }
    ).__M68K_IDE_PERF_ENABLED__ = true;
    resetIdePerformanceTelemetry();
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    const initialization = client.initialize();

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'init',
    });

    worker.emit({ type: 'ready' });
    worker.emit({ type: 'reply', id: 1, ok: true });

    await expect(initialization).resolves.toBeUndefined();
    expect(client.getRuntimeTransport()).toBe('worker');

    const snapshot = getIdePerformanceSnapshot();
    expect(snapshot.workerTransport.commandsSent).toBe(1);
    expect(snapshot.workerTransport.readyEventsReceived).toBe(1);
    expect(snapshot.workerTransport.repliesReceived).toBe(1);
  });

  it('updates the cached sync getters from frame and snapshot events', async () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    worker.emit({
      type: 'frame',
      kind: 'full',
      frame: buildRuntimeFrameSyncPayload({
        rawRegisters: Array.from({ length: 16 }, (_, index) => (index === 8 ? 42 : index)),
        pc: 0x1234,
        ccr: 0x15,
        sr: 0x2015,
        usp: 7,
        ssp: 7,
        memory: {
          usedBytes: 1,
          minAddress: 0x2000,
          maxAddress: 0x2000,
          version: 3,
        },
        terminal: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: 'OK',
          version: 2,
          geometryVersion: 1,
        },
        lastInstruction: 'MOVE.B #1,D0',
        errors: [],
        exception: null,
        halted: false,
        waitingForInput: true,
      }),
      snapshot: {
        rawRegisters: Array.from({ length: 16 }, (_, index) => (index === 8 ? 42 : index)),
        pc: 0x1234,
        ccr: 0x15,
        sr: 0x2015,
        usp: 7,
        ssp: 7,
        memoryMeta: {
          usedBytes: 1,
          minAddress: 0x2000,
          maxAddress: 0x2000,
          version: 3,
        },
        memoryImage: {
          0x2000: 0xaa,
        },
        terminalMeta: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: 'OK',
          version: 2,
          geometryVersion: 1,
        },
        terminalFrameBuffer: buildTerminalFrameBufferSnapshot('OK'),
        lastInstruction: 'MOVE.B #1,D0',
        errors: [],
        exception: null,
        queuedInputLength: 2,
        halted: false,
        waitingForInput: true,
        symbols: {
          VALUE: 0x2000,
        },
      },
    });

    expect(Array.from(client.getRegisters()).slice(8, 9)).toEqual([42]);
    expect(client.getPC()).toBe(0x1234);
    expect(client.getZFlag()).toBe(1);
    expect(client.getXFlag()).toBe(1);
    expect(client.getMemoryMeta().usedBytes).toBe(1);
    expect(Array.from(client.readMemoryRange(0x2000, 2))).toEqual([0xaa, 0x00]);
    expect(client.getTerminalText()).toBe('OK');
    expect(client.getTerminalLines()).toEqual(['OK']);
    expect(client.getTerminalFrameBuffer().dirtyRowFlags[0]).toBe(1);
    expect(client.getSymbolAddress('VALUE')).toBe(0x2000);
    expect(client.isWaitingForInput()).toBe(true);

    const snapshotRequest = client.requestSnapshot();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      type: 'requestSnapshot',
    });
    worker.emit({
      type: 'reply',
      id: 1,
      ok: true,
      payload: {
        rawRegisters: Array.from({ length: 16 }, (_, index) => index),
        pc: 0x2000,
        ccr: 0,
        sr: 0,
        usp: 7,
        ssp: 7,
        memoryMeta: {
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 4,
        },
        terminalMeta: {
          columns: 1,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 0,
          output: '',
          version: 3,
          geometryVersion: 1,
        },
        lastInstruction: 'Ready',
        errors: [],
        exception: null,
        queuedInputLength: 0,
        halted: true,
        waitingForInput: false,
      },
    });

    await expect(snapshotRequest).resolves.toBeUndefined();
    expect(client.getPC()).toBe(0x2000);
    expect(client.isHalted()).toBe(true);
  });

  it('preserves CP437 glyphs when snapshot cells are replayed into the cached frame buffer', () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    worker.emit({
      type: 'frame',
      kind: 'full',
      frame: buildRuntimeFrameSyncPayload({
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        memory: {
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 1,
        },
        terminal: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: '█┌',
          version: 2,
          geometryVersion: 1,
        },
        lastInstruction: 'Ready',
        errors: [],
        exception: null,
        halted: false,
        waitingForInput: false,
      }),
      snapshot: {
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        memoryMeta: {
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 1,
        },
        terminalMeta: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: '█┌',
          version: 2,
          geometryVersion: 1,
        },
        terminalFrameBuffer: buildTerminalFrameBufferSnapshot('█┌'),
        lastInstruction: 'Ready',
        errors: [],
        exception: null,
        queuedInputLength: 0,
        halted: false,
        waitingForInput: false,
      },
    });

    expect(client.getTerminalText()).toBe('█┌');
    expect(client.getTerminalLines()).toEqual(['█┌']);
  });

  it('keeps cached terminal and memory sections when a worker frame omits unchanged payloads', () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    worker.emit({
      type: 'frame',
      kind: 'full',
      frame: buildRuntimeFrameSyncPayload({
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0x1000,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        memory: {
          usedBytes: 1,
          minAddress: 0x2000,
          maxAddress: 0x2000,
          version: 1,
        },
        terminal: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: 'OK',
          version: 1,
          geometryVersion: 1,
        },
        lastInstruction: 'MOVE.B #1,D0',
        errors: [],
        exception: null,
        halted: false,
        waitingForInput: false,
      }),
      snapshot: {
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0x1000,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        memoryMeta: {
          usedBytes: 1,
          minAddress: 0x2000,
          maxAddress: 0x2000,
          version: 1,
        },
        memoryImage: {
          0x2000: 0xaa,
        },
        terminalMeta: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: 'OK',
          version: 1,
          geometryVersion: 1,
        },
        terminalFrameBuffer: buildTerminalFrameBufferSnapshot('OK'),
        lastInstruction: 'MOVE.B #1,D0',
        errors: [],
        exception: null,
        queuedInputLength: 0,
        halted: false,
        waitingForInput: false,
      },
    });

    worker.emit({
      type: 'frame',
      kind: 'terminal',
      frame: buildRuntimeFrameSyncPayload({
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0x1000,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        terminal: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: '',
          version: 2,
          geometryVersion: 1,
        },
        lastInstruction: 'MOVE.B #1,D0',
        errors: [],
        exception: null,
        halted: false,
        waitingForInput: false,
        includeRegisters: false,
        includeFlags: false,
        includeExecutionState: false,
      }),
      snapshot: {
        terminalMeta: {
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 2,
          output: '',
          version: 2,
          geometryVersion: 1,
        },
        terminalFrameBuffer: buildTerminalFrameBufferSnapshot('GO'),
      },
    });

    expect(client.getPC()).toBe(0x1000);
    expect(client.getMemoryMeta().usedBytes).toBe(1);
    expect(Array.from(client.readMemoryRange(0x2000, 1))).toEqual([0xaa]);
    expect(client.getTerminalText()).toBe('GO');
    expect(client.getTerminalMeta().output).toBe('');
  });

  it('sends a single dispatchTouchPacket worker command for touch mailbox delivery', async () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    const pendingDispatch = client.requestDispatchTouchPacket(
      {
        touchPending: 0x2010,
        touchPhase: 0x2011,
        touchRow: 0x2012,
        touchCol: 0x2013,
        touchFlags: 0x2014,
        touchIsr: 0x3000,
      },
      {
        pending: 1,
        phase: 1,
        row: 11,
        col: 7,
        flags: 0x12,
      }
    );

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'dispatchTouchPacket',
      protocol: {
        touchPending: 0x2010,
        touchPhase: 0x2011,
        touchRow: 0x2012,
        touchCol: 0x2013,
        touchFlags: 0x2014,
        touchIsr: 0x3000,
      },
      packet: {
        pending: 1,
        phase: 1,
        row: 11,
        col: 7,
        flags: 0x12,
      },
    });

    worker.emit({
      type: 'reply',
      id: 1,
      ok: true,
      payload: true,
    });

    await expect(pendingDispatch).resolves.toBe(true);
  });

  it('sends a one-shot pulseExecution worker command for immediate gameplay frames', async () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    const pendingPulse = client.requestPulseExecution(2);

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'pulseExecution',
      frameBudgetMs: 2,
    });

    worker.emit({
      type: 'reply',
      id: 1,
      ok: true,
      payload: true,
    });

    await expect(pendingPulse).resolves.toBe(true);
  });

  it('terminates the worker and rejects in-flight requests on dispose', async () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);

    const pendingRun = client.requestRun();

    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'run',
      config: {
        delayMs: 0,
        speedMultiplier: 1,
      },
    });

    await client.dispose();

    await expect(pendingRun).rejects.toThrow('disposed');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('lets the main thread subscribe to worker-owned frame and stopped events', () => {
    const worker = new MockWorker();
    const client = new InterpreterWorkerClient(worker);
    const listener = vi.fn();

    const unsubscribe = client.subscribeEvents(listener);

    worker.emit({
      type: 'frame',
      kind: 'full',
      frame: buildRuntimeFrameSyncPayload({
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        memory: {
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 1,
        },
        terminal: {
          columns: 1,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 0,
          output: '',
          version: 1,
          geometryVersion: 1,
        },
        lastInstruction: 'Ready',
        errors: [],
        exception: null,
        halted: false,
        waitingForInput: false,
      }),
      snapshot: {
        rawRegisters: Array.from({ length: 16 }, () => 0),
        pc: 0,
        ccr: 0,
        sr: 0,
        usp: 0,
        ssp: 0,
        memoryMeta: {
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 1,
        },
        terminalMeta: {
          columns: 1,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 0,
          output: '',
          version: 1,
          geometryVersion: 1,
        },
        lastInstruction: 'Ready',
        errors: [],
        exception: null,
        queuedInputLength: 0,
        halted: false,
        waitingForInput: false,
      },
    });
    worker.emit({ type: 'stopped', reason: 'waiting_for_input' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'frame' })
    );
    expect(listener).toHaveBeenNthCalledWith(2, {
      type: 'stopped',
      reason: 'waiting_for_input',
    });

    unsubscribe();
    worker.emit({ type: 'stopped', reason: 'halted' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
