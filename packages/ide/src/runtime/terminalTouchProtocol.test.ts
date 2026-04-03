import { describe, expect, it, vi } from 'vitest';
import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  TERMINAL_TOUCH_PHASE_IDS,
  TERMINAL_TOUCH_POINTER_FLAGS,
  encodeTerminalTouchPacket,
  publishTerminalTouchPacket,
  resolveTerminalTouchProtocol,
} from '@/runtime/terminalTouchProtocol';

function createMockRuntime(symbols: Record<string, number>): IdeRuntimeSession {
  return {
    getSymbolAddress: (symbol: string) => symbols[symbol],
    raiseExternalInterrupt: vi.fn(() => true),
    writeMemoryByte: vi.fn(),
    writeMemoryLong: vi.fn(),
    writeMemoryWord: vi.fn(),
  } as unknown as IdeRuntimeSession;
}

describe('terminalTouchProtocol', () => {
  it('encodes touch packets with stable phase ids and pointer flags', () => {
    expect(
      encodeTerminalTouchPacket({
        row: 11,
        col: 7,
        phase: 'down',
        pointerType: 'touch',
        buttons: 1,
      })
    ).toEqual({
      pending: 1,
      phase: TERMINAL_TOUCH_PHASE_IDS.down,
      row: 11,
      col: 7,
      flags:
        TERMINAL_TOUCH_POINTER_FLAGS.touch | TERMINAL_TOUCH_POINTER_FLAGS.buttonsActive,
    });
  });

  it('resolves the touch protocol symbols once per runtime session', () => {
    const runtime = createMockRuntime({
      TOUCH_PENDING: 0x2010,
      TOUCH_PHASE: 0x2011,
      TOUCH_ROW: 0x2012,
      TOUCH_COL: 0x2013,
      TOUCH_FLAGS: 0x2014,
      TOUCH_ISR: 0x3000,
    });

    const first = resolveTerminalTouchProtocol(runtime);
    const second = resolveTerminalTouchProtocol(runtime);

    expect(first).toEqual({
      touchPending: 0x2010,
      touchPhase: 0x2011,
      touchRow: 0x2012,
      touchCol: 0x2013,
      touchFlags: 0x2014,
      touchIsr: 0x3000,
    });
    expect(second).toBe(first);
  });

  it('publishes a packet to the runtime mailbox without raising the interrupt itself', () => {
    const runtime = createMockRuntime({
      TOUCH_PENDING: 0x2010,
      TOUCH_PHASE: 0x2011,
      TOUCH_ROW: 0x2012,
      TOUCH_COL: 0x2013,
      TOUCH_FLAGS: 0x2014,
      TOUCH_ISR: 0x3000,
    });

    const published = publishTerminalTouchPacket(runtime, {
      row: 11,
      col: 7,
      phase: 'move',
      pointerType: 'pen',
      buttons: 0,
    });

    expect(published).toEqual({
      interruptAddress: 0x3000,
      packet: {
        pending: 1,
        phase: TERMINAL_TOUCH_PHASE_IDS.move,
        row: 11,
        col: 7,
        flags: TERMINAL_TOUCH_POINTER_FLAGS.pen,
      },
    });
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2010, 1);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2011, 2);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2012, 11);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2013, 7);
    expect(runtime.writeMemoryByte).toHaveBeenCalledWith(0x2014, 0x04);
    expect(runtime.raiseExternalInterrupt).not.toHaveBeenCalled();
  });
});
