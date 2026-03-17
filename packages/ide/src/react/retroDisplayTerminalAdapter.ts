import type { CSSProperties } from 'react';
import type { TerminalCell, TerminalSnapshot } from '@m68k/interpreter';

export interface RetroDisplaySegment {
  key: string;
  text: string;
  style: CSSProperties;
}

export interface RetroDisplayRow {
  key: string;
  segments: RetroDisplaySegment[];
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: '#151515',
  31: '#d55252',
  32: '#77d95b',
  33: '#e2d36d',
  34: '#5a88e6',
  35: '#d075d7',
  36: '#5fd7d7',
  37: '#f2eee2',
  40: '#101515',
  41: '#482123',
  42: '#214223',
  43: '#48411e',
  44: '#223350',
  45: '#46204a',
  46: '#1d4648',
  47: '#f2eee2',
};

const DEFAULT_FOREGROUND = '#d8e1d0';
const DEFAULT_BACKGROUND = '#0f1713';

function getResolvedColors(cell: TerminalCell): { color: string; backgroundColor: string } {
  let color = cell.foreground !== null ? ANSI_COLOR_MAP[cell.foreground] ?? DEFAULT_FOREGROUND : DEFAULT_FOREGROUND;
  let backgroundColor =
    cell.background !== null ? ANSI_COLOR_MAP[cell.background] ?? DEFAULT_BACKGROUND : DEFAULT_BACKGROUND;

  if (cell.inverse) {
    [color, backgroundColor] = [backgroundColor, color];
  }

  return { color, backgroundColor };
}

function createSegmentStyle(cell: TerminalCell): CSSProperties {
  const { color, backgroundColor } = getResolvedColors(cell);

  return {
    color,
    backgroundColor,
    fontWeight: cell.bold ? 700 : 400,
  };
}

function haveMatchingStyle(left: TerminalCell, right: TerminalCell): boolean {
  return (
    left.foreground === right.foreground &&
    left.background === right.background &&
    left.bold === right.bold &&
    left.inverse === right.inverse
  );
}

export function createRetroDisplayRows(snapshot: TerminalSnapshot): RetroDisplayRow[] {
  return snapshot.cells.map((row, rowIndex) => {
    const segments: RetroDisplaySegment[] = [];

    row.forEach((cell, columnIndex) => {
      const previousSegment = segments[segments.length - 1];
      const previousCell = columnIndex > 0 ? row[columnIndex - 1] : undefined;

      if (previousSegment && previousCell && haveMatchingStyle(previousCell, cell)) {
        previousSegment.text += cell.char;
        return;
      }

      segments.push({
        key: `row-${rowIndex}-segment-${columnIndex}`,
        text: cell.char,
        style: createSegmentStyle(cell),
      });
    });

    return {
      key: `row-${rowIndex}`,
      segments,
    };
  });
}
