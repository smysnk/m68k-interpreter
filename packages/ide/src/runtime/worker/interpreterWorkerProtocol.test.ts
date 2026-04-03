import { describe, expect, it } from 'vitest';
import {
  deserializeInt32Array,
  deserializeUint8Array,
  isInterpreterWorkerFrameEvent,
  isInterpreterWorkerReplyEvent,
  serializeInt32Array,
  serializeUint8Array,
} from '@/runtime/worker/interpreterWorkerProtocol';

describe('interpreterWorkerProtocol', () => {
  it('round-trips typed arrays through worker-safe serialization helpers', () => {
    expect(
      Array.from(
        deserializeInt32Array(serializeInt32Array(Int32Array.from([1, -2, 3, -4])))
      )
    ).toEqual([1, -2, 3, -4]);
    expect(
      Array.from(
        deserializeUint8Array(serializeUint8Array(Uint8Array.from([0, 15, 255])))
      )
    ).toEqual([0, 15, 255]);
  });

  it('narrows reply and frame events for client-side routing', () => {
    const replyEvent = {
      type: 'reply' as const,
      id: 1,
      ok: true,
      payload: { accepted: true },
    };
    const frameEvent = {
      type: 'frame' as const,
      kind: 'full' as const,
      frame: {
        registers: {
          a0: 0,
          a1: 1,
          a2: 2,
          a3: 3,
          a4: 4,
          a5: 5,
          a6: 6,
          a7: 7,
          d0: 8,
          d1: 9,
          d2: 10,
          d3: 11,
          d4: 12,
          d5: 13,
          d6: 14,
          d7: 15,
          pc: 0x1000,
          ccr: 0,
          sr: 0,
          usp: 0,
          ssp: 0,
        },
        memory: {
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 1,
        },
        flags: {
          z: 0,
          v: 0,
          n: 0,
          c: 0,
          x: 0,
        },
        terminal: {
          columns: 4,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 0,
          output: '',
          version: 1,
          geometryVersion: 1,
        },
        executionState: {
          lastInstruction: 'Ready',
          errors: [],
          exception: null,
        },
      },
      snapshot: {
        rawRegisters: Array.from({ length: 16 }, (_, index) => index),
        pc: 0x1000,
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
          columns: 4,
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
    };

    expect(isInterpreterWorkerReplyEvent(replyEvent)).toBe(true);
    expect(isInterpreterWorkerFrameEvent(replyEvent)).toBe(false);
    expect(isInterpreterWorkerReplyEvent(frameEvent)).toBe(false);
    expect(isInterpreterWorkerFrameEvent(frameEvent)).toBe(true);
  });
});
