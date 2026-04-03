import { describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  computeNibblesLayoutProfile,
  dispatchRuntimeTouchCell,
  dispatchRuntimeTouchCellAsync,
  resolveTerminalInputMode,
  syncRuntimeGeometryBridge,
} from '@/runtime/terminalProgramBridge';
import { NIBBLES_FILE_ID } from '@/store/filesSlice';

function createMockRuntime(symbols: Record<string, number>): IdeRuntimeSession {
  return {
    getSymbolAddress: (symbol: string) => symbols[symbol],
    raiseExternalInterrupt: vi.fn(() => true),
    writeMemoryByte: vi.fn(),
    writeMemoryLong: vi.fn(),
    writeMemoryWord: vi.fn(),
  } as unknown as IdeRuntimeSession;
}

describe('terminalProgramBridge', () => {
  it('resolves the terminal input mode from the active file, shell mode, and preference', () => {
    expect(
      resolveTerminalInputMode({
        activeFileId: NIBBLES_FILE_ID,
        isCompactShell: true,
        preference: 'auto',
      })
    ).toBe('touch-only');
    expect(
      resolveTerminalInputMode({
        activeFileId: NIBBLES_FILE_ID,
        isCompactShell: false,
        preference: 'auto',
      })
    ).toBe('text-input');
    expect(
      resolveTerminalInputMode({
        activeFileId: 'workspace:scratch.asm',
        isCompactShell: true,
        preference: 'touch-only',
      })
    ).toBe('touch-only');
  });

  it('computes the nibbles layout profile from terminal geometry thresholds', () => {
    expect(computeNibblesLayoutProfile(80, 24)).toBe('desktop-wide');
    expect(computeNibblesLayoutProfile(52, 11)).toBe('mobile-landscape');
    expect(computeNibblesLayoutProfile(52, 10)).toBe('mobile-portrait');
    expect(computeNibblesLayoutProfile(38, 22)).toBe('mobile-portrait');
  });

  it('writes geometry bridge symbols into the runtime mailbox', () => {
    const runtime = createMockRuntime({
      TERM_COLS: 0x2000,
      TERM_ROWS: 0x2001,
      LAYOUT_PROFILE: 0x2002,
    });

    expect(syncRuntimeGeometryBridge(runtime, 52, 18)).toBe(true);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2000, 52);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2001, 18);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2002, 1);
  });

  it('publishes a touch event and raises the configured synthetic interrupt', () => {
    const runtime = createMockRuntime({
      TERM_COLS: 0x2000,
      TERM_ROWS: 0x2001,
      LAYOUT_PROFILE: 0x2002,
      TOUCH_PENDING: 0x2010,
      TOUCH_PHASE: 0x2011,
      TOUCH_ROW: 0x2012,
      TOUCH_COL: 0x2013,
      TOUCH_FLAGS: 0x2014,
      TOUCH_ISR: 0x3000,
    });

    expect(
      dispatchRuntimeTouchCell(runtime, {
        row: 11,
        col: 7,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      })
    ).toBe(true);

    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2010, 1);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2011, 1);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2012, 11);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2013, 7);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2014, 0x12);
    expect(runtime.raiseExternalInterrupt).toHaveBeenCalledWith(0x3000);
  });

  it('batches worker touch delivery through a single controller request', async () => {
    const controller = {
      requestDispatchTouchPacket: vi.fn(async () => true),
    };
    const runtime = {
      ...createMockRuntime({
        TOUCH_PENDING: 0x2010,
        TOUCH_PHASE: 0x2011,
        TOUCH_ROW: 0x2012,
        TOUCH_COL: 0x2013,
        TOUCH_FLAGS: 0x2014,
        TOUCH_ISR: 0x3000,
      }),
      controller,
      getRuntimeTransport: () => 'worker' as const,
    } as unknown as IdeRuntimeSession;

    await expect(
      dispatchRuntimeTouchCellAsync(runtime, {
        row: 11,
        col: 7,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      })
    ).resolves.toBe(true);

    expect(controller.requestDispatchTouchPacket).toHaveBeenCalledWith(
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
    expect(runtime.writeMemoryByte).not.toHaveBeenCalled();
    expect(runtime.raiseExternalInterrupt).not.toHaveBeenCalled();
  });
});
