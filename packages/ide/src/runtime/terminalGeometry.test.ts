import { describe, expect, it } from 'vitest';
import { createTerminalGeometrySignature, normalizeTerminalGeometry } from './terminalGeometry';

describe('terminalGeometry', () => {
  it('creates a stable geometry signature from columns and rows', () => {
    expect(createTerminalGeometrySignature(52, 18)).toBe('52x18');
  });

  it('normalizes measured retro display geometry into integer terminal dimensions', () => {
    expect(
      normalizeTerminalGeometry({
        cols: 67.9,
        rows: 21.2,
        innerWidth: 402,
        innerHeight: 254,
      })
    ).toEqual({
      columns: 67,
      rows: 21,
    });
  });

  it('ignores geometry probes before the terminal surface has meaningful size', () => {
    expect(
      normalizeTerminalGeometry({
        cols: 9,
        rows: 4,
        innerWidth: 96,
        innerHeight: 72,
      })
    ).toBeNull();
  });
});
