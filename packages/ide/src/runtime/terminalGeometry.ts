import type { RetroLcdGeometry } from 'react-retro-display-tty-ansi';

export interface NormalizedTerminalGeometry {
  columns: number;
  rows: number;
}

const MIN_TERMINAL_INNER_WIDTH = 120;
const MIN_TERMINAL_INNER_HEIGHT = 96;

export function createTerminalGeometrySignature(columns: number, rows: number): string {
  return `${columns}x${rows}`;
}

export function normalizeTerminalGeometry(
  geometry: Pick<RetroLcdGeometry, 'cols' | 'rows' | 'innerWidth' | 'innerHeight'>
): NormalizedTerminalGeometry | null {
  if (
    !Number.isFinite(geometry.innerWidth) ||
    !Number.isFinite(geometry.innerHeight) ||
    geometry.innerWidth < MIN_TERMINAL_INNER_WIDTH ||
    geometry.innerHeight < MIN_TERMINAL_INNER_HEIGHT
  ) {
    return null;
  }

  const columns = Math.max(1, Math.floor(geometry.cols));
  const rows = Math.max(1, Math.floor(geometry.rows));

  if (!Number.isFinite(columns) || !Number.isFinite(rows)) {
    return null;
  }

  return {
    columns,
    rows,
  };
}
