import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalFrameBuffer } from '@m68k/interpreter';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';
import { terminalSurfaceStore } from '@/runtime/terminalSurfaceStore';
import { createRuntimeFrameSyncCache, syncRuntimeFrameToIde } from '@/runtime/syncRuntimeFrame';

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
        getCCR: () => 0x15,
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
        raiseExternalInterrupt: () => true,
        clearInputQueue: () => undefined,
        emulationStep: () => false,
        getQueuedInputLength: () => 0,
        queueInput: () => undefined,
        reset: () => undefined,
        getSR: () => 0x0015,
        getSSP: () => 7,
        getUSP: () => 7,
        undoFromStack: () => undefined,
        writeMemoryByte: () => undefined,
        writeMemoryLong: () => undefined,
        writeMemoryWord: () => undefined,
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
        registers: expect.objectContaining({
          sr: 0x0015,
          usp: 7,
          ssp: 7,
        }),
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

  it('can reuse an existing register snapshot when register sync is throttled', () => {
    const frameBuffer = createTerminalFrameBuffer(2, 1);
    const terminalMeta = {
      columns: 2,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 0,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const syncEmulatorFrame = vi.fn();
    const registersOverride = {
      a0: 100,
      a1: 101,
      a2: 102,
      a3: 103,
      a4: 104,
      a5: 105,
      a6: 106,
      a7: 107,
      d0: 200,
      d1: 201,
      d2: 202,
      d3: 203,
      d4: 204,
      d5: 205,
      d6: 206,
      d7: 207,
      pc: 0x2000,
      ccr: 0x1f,
      sr: 0x271f,
      usp: 107,
      ssp: 107,
    };

    syncRuntimeFrameToIde(
      {
        getCFlag: () => 1,
        getCCR: () => 0x00,
        getErrors: () => [],
        getException: () => undefined,
        getLastInstruction: () => 'ADDQ #1,D0',
        getMemory: () => ({}),
        getMemoryMeta: () => ({
          usedBytes: 0,
          minAddress: null,
          maxAddress: null,
          version: 1,
        }),
        getNFlag: () => 0,
        getPC: () => 0x1234,
        getRegisters: () => Int32Array.from(Array.from({ length: 16 }, (_, index) => index)),
        readMemoryRange: () => new Uint8Array(0),
        getSymbolAddress: () => undefined,
        getSymbols: () => ({}),
        getTerminalFrameBuffer: () => frameBuffer,
        getTerminalLines: () => [''],
        getTerminalMeta: () => terminalMeta,
        getTerminalText: () => '',
        getTerminalSnapshot: () => ({
          columns: 2,
          rows: 1,
          cursorRow: 0,
          cursorColumn: 0,
          output: '',
          lines: [''],
          cells: [[]],
        }),
        getVFlag: () => 0,
        getXFlag: () => 0,
        getZFlag: () => 0,
        isHalted: () => false,
        isWaitingForInput: () => false,
        raiseExternalInterrupt: () => true,
        clearInputQueue: () => undefined,
        emulationStep: () => false,
        getQueuedInputLength: () => 0,
        queueInput: () => undefined,
        reset: () => undefined,
        getSR: () => 0,
        getSSP: () => 0,
        getUSP: () => 0,
        undoFromStack: () => undefined,
        writeMemoryByte: () => undefined,
        writeMemoryLong: () => undefined,
        writeMemoryWord: () => undefined,
      },
      syncEmulatorFrame,
      {
        registersOverride,
        flagsOverride: {
          z: 1,
          v: 0,
          n: 1,
          c: 0,
          x: 1,
        },
      }
    );

    expect(syncEmulatorFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        registers: registersOverride,
        flags: {
          z: 1,
          v: 0,
          n: 1,
          c: 0,
          x: 1,
        },
      })
    );
  });

  it('reuses cached payload objects and skips surface publication when runtime versions stay flat', () => {
    const frameBuffer = createTerminalFrameBuffer(3, 1);
    frameBuffer.charBytes.set([...'HEY'].map((char) => char.charCodeAt(0)));
    frameBuffer.version += 1;
    const registers = Int32Array.from(Array.from({ length: 16 }, (_, index) => index * 3));
    const terminalMeta = {
      columns: 3,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 3,
      output: 'HEY',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const memoryMeta = {
      usedBytes: 2,
      minAddress: 0x1000,
      maxAddress: 0x1001,
      version: 8,
    };
    const getTerminalFrameBuffer = vi.fn(() => frameBuffer);
    const syncEmulatorFrame = vi.fn();
    const emulator = {
      getCFlag: () => 1,
      getCCR: () => 0x11,
      getErrors: () => [],
      getException: () => undefined,
      getLastInstruction: () => 'BRA NEXT',
      getMemory: () => ({ 0x1000: 0x4e, 0x1001: 0x71 }),
      getMemoryMeta: vi.fn(() => memoryMeta),
      getNFlag: () => 0,
      getPC: () => 0x1000,
      getRegisters: vi.fn(() => registers),
      readMemoryRange: () => new Uint8Array([0x4e, 0x71]),
      getSymbolAddress: () => undefined,
      getSymbols: () => ({}),
      getTerminalFrameBuffer,
      getTerminalLines: () => ['HEY'],
      getTerminalMeta: vi.fn(() => terminalMeta),
      getTerminalText: () => 'HEY',
      getTerminalSnapshot: () => ({
        columns: 3,
        rows: 1,
        cursorRow: 0,
        cursorColumn: 3,
        output: 'HEY',
        lines: ['HEY'],
        cells: [[]],
      }),
      getVFlag: () => 0,
      getXFlag: () => 1,
      getZFlag: () => 0,
      isHalted: () => false,
      isWaitingForInput: () => false,
      raiseExternalInterrupt: () => true,
      clearInputQueue: () => undefined,
      emulationStep: () => false,
      getQueuedInputLength: () => 0,
      queueInput: () => undefined,
      reset: () => undefined,
      getSR: () => 0x11,
      getSSP: () => registers[7] >>> 0,
      getUSP: () => registers[7] >>> 0,
      undoFromStack: () => undefined,
      writeMemoryByte: () => undefined,
      writeMemoryLong: () => undefined,
      writeMemoryWord: () => undefined,
    };
    const cache = createRuntimeFrameSyncCache();

    syncRuntimeFrameToIde(emulator, syncEmulatorFrame, { cache });
    syncRuntimeFrameToIde(emulator, syncEmulatorFrame, { cache });

    const firstFrame = syncEmulatorFrame.mock.calls[0]?.[0];
    const secondFrame = syncEmulatorFrame.mock.calls[1]?.[0];

    expect(firstFrame.registers).toBe(secondFrame.registers);
    expect(firstFrame.flags).toBe(secondFrame.flags);
    expect(firstFrame.memory).toBe(secondFrame.memory);
    expect(firstFrame.terminal).toBe(secondFrame.terminal);
    expect(getTerminalFrameBuffer).toHaveBeenCalledTimes(1);
  });

  it('uses runtime sync versions to skip repeated register and metadata reads', () => {
    const frameBuffer = createTerminalFrameBuffer(2, 1);
    const registers = Int32Array.from(Array.from({ length: 16 }, (_, index) => index));
    const terminalMeta = {
      columns: 2,
      rows: 1,
      cursorRow: 0,
      cursorColumn: 0,
      output: '',
      version: frameBuffer.version,
      geometryVersion: frameBuffer.geometryVersion,
    };
    const memoryMeta = {
      usedBytes: 0,
      minAddress: null,
      maxAddress: null,
      version: 1,
    };
    const getRegisters = vi.fn(() => registers);
    const getMemoryMeta = vi.fn(() => memoryMeta);
    const getTerminalMeta = vi.fn(() => terminalMeta);
    const syncEmulatorFrame = vi.fn();
    const cache = createRuntimeFrameSyncCache();
    const emulator = {
      getCFlag: () => 0,
      getCCR: () => 0,
      getErrors: () => [],
      getException: () => undefined,
      getLastInstruction: () => 'MOVE.L #1,D0',
      getMemory: () => ({}),
      getMemoryMeta,
      getNFlag: () => 0,
      getPC: () => 0x1000,
      getQueuedInputLength: () => 0,
      getRegisters,
      getRuntimeSyncVersions: () => ({
        registers: 5,
        execution: 8,
        diagnostics: 3,
        memory: 1,
        terminal: terminalMeta.version,
        terminalGeometry: terminalMeta.geometryVersion,
      }),
      getSR: () => 0,
      getSSP: () => 7,
      readMemoryRange: () => new Uint8Array(0),
      getSymbolAddress: () => undefined,
      getSymbols: () => ({}),
      getTerminalFrameBuffer: () => frameBuffer,
      getTerminalLines: () => [''],
      getTerminalMeta,
      getTerminalText: () => '',
      getTerminalSnapshot: () => ({
        columns: 2,
        rows: 1,
        cursorRow: 0,
        cursorColumn: 0,
        output: '',
        lines: [''],
        cells: [[]],
      }),
      getUSP: () => 7,
      getVFlag: () => 0,
      getXFlag: () => 0,
      getZFlag: () => 0,
      isHalted: () => false,
      isWaitingForInput: () => false,
      raiseExternalInterrupt: () => true,
      clearInputQueue: () => undefined,
      emulationStep: () => false,
      queueInput: () => undefined,
      reset: () => undefined,
      undoFromStack: () => undefined,
      writeMemoryByte: () => undefined,
      writeMemoryLong: () => undefined,
      writeMemoryWord: () => undefined,
    };

    syncRuntimeFrameToIde(emulator, syncEmulatorFrame, { cache });
    syncRuntimeFrameToIde(emulator, syncEmulatorFrame, { cache });

    expect(getRegisters).toHaveBeenCalledTimes(1);
    expect(getMemoryMeta).toHaveBeenCalledTimes(1);
    expect(getTerminalMeta).toHaveBeenCalledTimes(1);
  });

  it('keeps memory metadata fresh without replacing the memory surface when publishing is disabled', () => {
    const frameBuffer = createTerminalFrameBuffer(2, 1);
    const emulator = {
      getCFlag: () => 0,
      getCCR: () => 0,
      getErrors: () => [],
      getException: () => undefined,
      getLastInstruction: () => 'MOVE.B #1,D0',
      getMemory: () => ({ 0x1000: 0xaa }),
      getMemoryMeta: () => ({
        usedBytes: 1,
        minAddress: 0x1000,
        maxAddress: 0x1000,
        version: 2,
      }),
      getNFlag: () => 0,
      getPC: () => 0x1000,
      getQueuedInputLength: () => 0,
      getRegisters: () => Int32Array.from(Array.from({ length: 16 }, (_, index) => index)),
      readMemoryRange: (address: number, length: number) => {
        const bytes = new Uint8Array(length);
        if (address === 0x1000 && length > 0) {
          bytes[0] = 0xaa;
        }
        return bytes;
      },
      getSR: () => 0,
      getSSP: () => 7,
      getSymbolAddress: () => undefined,
      getSymbols: () => ({}),
      getTerminalFrameBuffer: () => frameBuffer,
      getTerminalLines: () => [''],
      getTerminalMeta: () => ({
        columns: 2,
        rows: 1,
        cursorRow: 0,
        cursorColumn: 0,
        output: '',
        version: frameBuffer.version,
        geometryVersion: frameBuffer.geometryVersion,
      }),
      getTerminalText: () => '',
      getTerminalSnapshot: () => ({
        columns: 2,
        rows: 1,
        cursorRow: 0,
        cursorColumn: 0,
        output: '',
        lines: [''],
        cells: [[]],
      }),
      getUSP: () => 7,
      getVFlag: () => 0,
      getXFlag: () => 0,
      getZFlag: () => 0,
      isHalted: () => false,
      isWaitingForInput: () => false,
      raiseExternalInterrupt: () => true,
      clearInputQueue: () => undefined,
      emulationStep: () => false,
      queueInput: () => undefined,
      reset: () => undefined,
      undoFromStack: () => undefined,
      writeMemoryByte: () => undefined,
      writeMemoryLong: () => undefined,
      writeMemoryWord: () => undefined,
    };
    const syncEmulatorFrame = vi.fn();
    const replaceFromRuntimeSpy = vi.spyOn(memorySurfaceStore, 'replaceFromRuntime');
    const syncRuntimeSpy = vi.spyOn(memorySurfaceStore, 'syncRuntime');

    syncRuntimeFrameToIde(emulator, syncEmulatorFrame, {
      publishMemorySurface: false,
    });

    expect(replaceFromRuntimeSpy).not.toHaveBeenCalled();
    expect(syncRuntimeSpy).toHaveBeenCalledWith(emulator);
    expect(memorySurfaceStore.getSnapshot().meta).toEqual({
      usedBytes: 1,
      minAddress: 0x1000,
      maxAddress: 0x1000,
      version: 2,
    });
    expect(Array.from(memorySurfaceStore.readRange(0x1000, 1))).toEqual([0xaa]);
  });
});
