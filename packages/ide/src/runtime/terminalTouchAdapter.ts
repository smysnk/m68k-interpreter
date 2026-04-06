import type { TerminalTouchCellEvent, TerminalTouchPhase } from '@/runtime/terminalTouchProtocol';

export function getTerminalGridRect(root: HTMLElement | null): DOMRect | null {
  if (!root) {
    return null;
  }

  const gridElement =
    root.querySelector<HTMLElement>('.retro-lcd__grid') ??
    root.querySelector<HTMLElement>('.retro-lcd__viewport');

  return gridElement?.getBoundingClientRect() ?? null;
}

export function clampTerminalCell(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(max, value));
}

export function mapPointerToTerminalCell(
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
  columns: number,
  rows: number
): { col: number; row: number } | null {
  if (columns <= 0 || rows <= 0) {
    return null;
  }

  const rect = getTerminalGridRect(root);
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const relativeX = Math.min(Math.max(clientX - rect.left, 0), Math.max(rect.width - 0.001, 0));
  const relativeY = Math.min(Math.max(clientY - rect.top, 0), Math.max(rect.height - 0.001, 0));

  return {
    col: clampTerminalCell(Math.floor((relativeX / rect.width) * columns) + 1, columns),
    row: clampTerminalCell(Math.floor((relativeY / rect.height) * rows) + 1, rows),
  };
}

export function shouldHandleTerminalPointer(options: {
  isTouchOnlyMode: boolean;
  phase: TerminalTouchPhase;
  pointerType: string;
  buttons: number;
}): boolean {
  const { isTouchOnlyMode, phase } = options;

  if (!isTouchOnlyMode) {
    return false;
  }

  if (phase !== 'down') {
    return false;
  }

  return true;
}

export function buildTerminalTouchCellEvent(options: {
  root: HTMLElement | null;
  clientX: number;
  clientY: number;
  columns: number;
  rows: number;
  phase: TerminalTouchPhase;
  pointerType: string;
  buttons: number;
}): TerminalTouchCellEvent | null {
  const { root, clientX, clientY, columns, rows, phase, pointerType, buttons } = options;
  const cell = mapPointerToTerminalCell(root, clientX, clientY, columns, rows);

  if (!cell) {
    return null;
  }

  return {
    row: cell.row,
    col: cell.col,
    phase,
    pointerType,
    buttons,
  };
}
