import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalFrameBuffer } from '@m68k/interpreter';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { syncRuntimeFrameToIde } from '@/runtime/syncRuntimeFrame';

describe('syncRuntimeFrameToIde', () => {
  beforeEach(() => {
    memorySurfaceStore.reset();
    terminalSurfaceStore.reset();
  });

  it('publishes the runtime frame buffer, memory runtime, and syncs only metadata to Redux', () => {
    const frameBuffer = createTerminalFrameBuffer(4, 1);
    frameBuffer.charBytes.set([...'TEST'].map((char) => char.charCodeAt(0)));
    frameBuffer.dirtyRowFlags[0] = 1;
    frameBuffer.version += 1;

    const terminalMeta = {
      columns: 4,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 4,
      output: 'TEST',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };

    const getTerminalMeta = vi.fn(() => terminalMeta);
    const getTerminalFrameBuffer = vi.fn(() => frameBuffer);
    const getTerminalSnapshot = vi.fn(() => ({
      columns: 4,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 4,
      output: 'TEST',
      lines: ['TEST'],
      cells: [
        Array.from('TEST').map((char) => ({
          char,
          foreground: null,
          background: null,
          bold: false,
          inverse: false,
        })),
      ],
    }));
    const getMemory = vi.fn(() => ({ 0x1000: 0x4e }));
    const getMemoryMeta = vi.fn(() => ({
      usedBytes: 1,
      minAddress: 0x1000,
      maxAddress: 0x1000,
      version: 4,
    }));
    const readMemoryRange = vi.fn((address: number, length: number) => {
      const bytes = new Uint8Array(length);
      if (address === 0x1000 && length > 0) {
        bytes[0] = 0x4e;
      }
      return bytes;
    });
    const syncEmulatorFrame = vi.fn();

    syncRuntimeFrameToIde(
      {
        getCFlag: () => 0,
        getErrors: () => [],
        getException: () => undefined,
        getLastInstruction: () => 'MOVE.B #1,D0',
        getMemory,
        getMemoryMeta,
        getNFlag: () => 0,
        getPC: () => 0x1000,
        getRegisters: () => Int32Array.from(Array.from({ length: 16 }, (_, index) => index)),
        readMemoryRange,
        getSymbolAddress: () => undefined,
        getSymbols: () => ({}),
        getTerminalFrameBuffer,
        getTerminalLines: () => ['TEST'],
        getTerminalMeta,
        getTerminalText: () => 'TEST',
        getTerminalSnapshot,
        getVFlag: () => 0,
        getXFlag: () => 0,
        getZFlag: () => 1,
        isHalted: () => false,
        isWaitingForInput: () => false,
        clearInputQueue: () => undefined,
        emulationStep: () => false,
        getQueuedInputLength: () => 0,
        queueInput: () => undefined,
        reset: () => undefined,
        undoFromStack: () => undefined,
      },
      syncEmulatorFrame,
      {
        executionState: {
          started: true,
        },
        runtimeMetrics: {
          lastFrameInstructions: 12,
          lastFrameDurationMs: 2.5,
          lastStopReason: 'frame_budget',
        },
      }
    );

    expect(getTerminalMeta).toHaveBeenCalledTimes(1);
    expect(getTerminalFrameBuffer).toHaveBeenCalledTimes(1);
    expect(getTerminalSnapshot).not.toHaveBeenCalled();
    expect(getMemoryMeta).toHaveBeenCalledTimes(1);
    expect(getMemory).not.toHaveBeenCalled();
    expect(syncEmulatorFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        terminal: terminalMeta,
        memory: {
          usedBytes: 1,
          minAddress: 0x1000,
          maxAddress: 0x1000,
          version: 4,
        },
        executionState: expect.objectContaining({
          started: true,
          lastInstruction: 'MOVE.B #1,D0',
          exception: null,
          errors: [],
        }),
        runtimeMetrics: {
          lastFrameInstructions: 12,
          lastFrameDurationMs: 2.5,
          lastStopReason: 'frame_budget',
        },
      })
    );
    expect(terminalSurfaceStore.getSnapshot().frameBuffer).toBe(frameBuffer);
    expect(terminalSurfaceStore.getSnapshot().meta).toEqual(terminalMeta);
    expect(terminalSurfaceStore.getText()).toBe('TEST');
    expect(Array.from(memorySurfaceStore.readRange(0x1000, 4))).toEqual([0x4e, 0x00, 0x00, 0x00]);
    expect(readMemoryRange).toHaveBeenCalledWith(0x1000, 4);
  });
});
