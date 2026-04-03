import type { IdeRuntimeSession } from '@/runtime/ideRuntimeSession';
import {
  encodeTerminalTouchPacket,
  publishTerminalTouchPacket,
  resolveTerminalTouchProtocol,
  type TerminalTouchCellEvent,
} from '@/runtime/terminalTouchProtocol';
import { NIBBLES_FILE_ID } from '@/store/filesSlice';
import type { TerminalInputModePreference } from '@/store/settingsSlice';

export type EffectiveTerminalInputMode = 'text-input' | 'touch-only';
export type NibblesLayoutProfile = 'desktop-wide' | 'mobile-landscape' | 'mobile-portrait';

interface GeometryBridgeSymbols {
  termCols: number;
  termRows: number;
  layoutProfile: number;
}

const DESKTOP_PROFILE_ID = 0;
const LANDSCAPE_PROFILE_ID = 1;
const PORTRAIT_PROFILE_ID = 2;

const geometryBridgeCache = new WeakMap<object, GeometryBridgeSymbols | null>();

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

function resolveGeometryBridgeSymbols(runtime: IdeRuntimeSession): GeometryBridgeSymbols | null {
  const cached = geometryBridgeCache.get(runtime as object);
  if (cached !== undefined) {
    return cached;
  }

  const termCols = resolveSymbolAddress(runtime, 'TERM_COLS');
  const termRows = resolveSymbolAddress(runtime, 'TERM_ROWS');
  const layoutProfile = resolveSymbolAddress(runtime, 'LAYOUT_PROFILE');

  const resolved =
    termCols === null || termRows === null || layoutProfile === null
      ? null
      : {
          termCols,
          termRows,
          layoutProfile,
        };

  geometryBridgeCache.set(runtime as object, resolved);
  return resolved;
}

export function computeNibblesLayoutProfile(columns: number, rows: number): NibblesLayoutProfile {
  if (columns >= 78 && rows >= 24) {
    return 'desktop-wide';
  }

  if (columns >= 52 && rows >= 11) {
    return 'mobile-landscape';
  }

  return 'mobile-portrait';
}

export function computeNibblesLayoutProfileId(columns: number, rows: number): number {
  switch (computeNibblesLayoutProfile(columns, rows)) {
    case 'desktop-wide':
      return DESKTOP_PROFILE_ID;
    case 'mobile-landscape':
      return LANDSCAPE_PROFILE_ID;
    case 'mobile-portrait':
    default:
      return PORTRAIT_PROFILE_ID;
  }
}

export function resolveTerminalInputMode(options: {
  activeFileId: string;
  isCompactShell: boolean;
  preference: TerminalInputModePreference;
}): EffectiveTerminalInputMode {
  const { activeFileId, isCompactShell, preference } = options;

  if (preference === 'text-input') {
    return 'text-input';
  }

  if (preference === 'touch-only') {
    return 'touch-only';
  }

  return activeFileId === NIBBLES_FILE_ID && isCompactShell ? 'touch-only' : 'text-input';
}

export function syncRuntimeGeometryBridge(
  runtime: IdeRuntimeSession | null,
  columns: number,
  rows: number
): boolean {
  if (
    runtime === null ||
    typeof runtime.writeMemoryByte !== 'function'
  ) {
    return false;
  }

  const symbols = resolveGeometryBridgeSymbols(runtime);
  if (symbols === null) {
    return false;
  }

  runtime.writeMemoryByte(symbols.termCols, clampByte(columns));
  runtime.writeMemoryByte(symbols.termRows, clampByte(rows));
  runtime.writeMemoryByte(symbols.layoutProfile, computeNibblesLayoutProfileId(columns, rows));

  return true;
}

export function dispatchRuntimeTouchCell(
  runtime: IdeRuntimeSession | null,
  event: TerminalTouchCellEvent
): boolean {
  if (runtime === null || resolveTerminalTouchProtocol(runtime) === null) {
    return false;
  }

  const packet = publishTerminalTouchPacket(runtime, {
    ...event,
    row: clampByte(event.row),
    col: clampByte(event.col),
  });

  if (packet === null) {
    return false;
  }

  return runtime.raiseExternalInterrupt(packet.interruptAddress);
}

export async function dispatchRuntimeTouchCellAsync(
  runtime: IdeRuntimeSession | null,
  event: TerminalTouchCellEvent
): Promise<boolean> {
  if (runtime === null) {
    return false;
  }

  if (runtime.getRuntimeTransport?.() !== 'worker' || runtime.controller === undefined) {
    return dispatchRuntimeTouchCell(runtime, event);
  }

  const protocol = resolveTerminalTouchProtocol(runtime);
  if (protocol === null) {
    return false;
  }

  const packet = encodeTerminalTouchPacket({
    ...event,
    row: clampByte(event.row),
    col: clampByte(event.col),
  });

  return runtime.controller.requestDispatchTouchPacket(protocol, packet);
}
