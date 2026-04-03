import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';

export type TerminalTouchPhase = 'down' | 'move' | 'up';

export interface TerminalTouchCellEvent {
  row: number;
  col: number;
  phase: TerminalTouchPhase;
  pointerType: string;
  buttons: number;
}

export interface TerminalTouchPacket {
  pending: number;
  phase: number;
  row: number;
  col: number;
  flags: number;
}

export interface TerminalTouchProtocolSymbols {
  touchPending: number;
  touchPhase: number;
  touchRow: number;
  touchCol: number;
  touchFlags: number;
  touchIsr: number;
}

export const TERMINAL_TOUCH_PHASE_IDS = {
  down: 1,
  move: 2,
  up: 3,
} as const satisfies Record<TerminalTouchPhase, number>;

export const TERMINAL_TOUCH_POINTER_FLAGS = {
  mouse: 1 << 0,
  touch: 1 << 1,
  pen: 1 << 2,
  buttonsActive: 1 << 4,
} as const;

const touchProtocolCache = new WeakMap<object, TerminalTouchProtocolSymbols | null>();

function clampByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0xff, Math.round(value)));
}

function resolveSymbolAddress(runtime: IdeRuntimeSession, symbol: string): number | null {
  const address = runtime.getSymbolAddress(symbol);
  return typeof address === 'number' && Number.isFinite(address) ? address : null;
}

export function resolveTerminalTouchProtocol(
  runtime: IdeRuntimeSession
): TerminalTouchProtocolSymbols | null {
  const cached = touchProtocolCache.get(runtime as object);
  if (cached !== undefined) {
    return cached;
  }

  const touchPending = resolveSymbolAddress(runtime, 'TOUCH_PENDING');
  const touchPhase = resolveSymbolAddress(runtime, 'TOUCH_PHASE');
  const touchRow = resolveSymbolAddress(runtime, 'TOUCH_ROW');
  const touchCol = resolveSymbolAddress(runtime, 'TOUCH_COL');
  const touchFlags = resolveSymbolAddress(runtime, 'TOUCH_FLAGS');
  const touchIsr = resolveSymbolAddress(runtime, 'TOUCH_ISR');

  const resolved =
    touchPending === null ||
    touchPhase === null ||
    touchRow === null ||
    touchCol === null ||
    touchFlags === null ||
    touchIsr === null
      ? null
      : {
          touchPending,
          touchPhase,
          touchRow,
          touchCol,
          touchFlags,
          touchIsr,
        };

  touchProtocolCache.set(runtime as object, resolved);
  return resolved;
}

export function encodeTerminalTouchPacket(event: TerminalTouchCellEvent): TerminalTouchPacket {
  let flags =
    event.buttons > 0 ? TERMINAL_TOUCH_POINTER_FLAGS.buttonsActive : 0;

  switch (event.pointerType) {
    case 'touch':
      flags |= TERMINAL_TOUCH_POINTER_FLAGS.touch;
      break;
    case 'pen':
      flags |= TERMINAL_TOUCH_POINTER_FLAGS.pen;
      break;
    default:
      flags |= TERMINAL_TOUCH_POINTER_FLAGS.mouse;
      break;
  }

  return {
    pending: 1,
    phase: TERMINAL_TOUCH_PHASE_IDS[event.phase] ?? 0,
    row: clampByte(event.row),
    col: clampByte(event.col),
    flags,
  };
}

export function publishTerminalTouchPacket(
  runtime: IdeRuntimeSession | null,
  event: TerminalTouchCellEvent
): { interruptAddress: number; packet: TerminalTouchPacket } | null {
  if (
    runtime === null ||
    typeof runtime.writeMemoryByte !== 'function' ||
    typeof runtime.raiseExternalInterrupt !== 'function'
  ) {
    return null;
  }

  const protocol = resolveTerminalTouchProtocol(runtime);
  if (protocol === null) {
    return null;
  }

  const packet = encodeTerminalTouchPacket(event);

  runtime.writeMemoryByte(protocol.touchPending, packet.pending);
  runtime.writeMemoryByte(protocol.touchPhase, packet.phase);
  runtime.writeMemoryByte(protocol.touchRow, packet.row);
  runtime.writeMemoryByte(protocol.touchCol, packet.col);
  runtime.writeMemoryByte(protocol.touchFlags, packet.flags);

  return {
    interruptAddress: protocol.touchIsr,
    packet,
  };
}
