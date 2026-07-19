import { RenderProfileBoundary } from '@/runtime/idePerformanceTelemetry';

const SEGMENTS = [
  { bit: 0, key: 'a', x: 9, y: 4, width: 26, height: 5 },
  { bit: 1, key: 'b', x: 34, y: 9, width: 5, height: 23 },
  { bit: 2, key: 'c', x: 34, y: 41, width: 5, height: 23 },
  { bit: 3, key: 'd', x: 9, y: 64, width: 26, height: 5 },
  { bit: 4, key: 'e', x: 4, y: 41, width: 5, height: 23 },
  { bit: 5, key: 'f', x: 4, y: 9, width: 5, height: 23 },
  { bit: 6, key: 'g', x: 9, y: 34, width: 26, height: 5 },
] as const;

export function formatHardwareByte(value: number): string {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function SevenSegmentDigit({ value, index }: { value: number; index: number }) {
  return (
    <svg
      aria-label={`Display digit ${index + 1}, pattern ${formatHardwareByte(value)}`}
      className="hardware-seven-segment-digit"
      role="img"
      viewBox="0 0 46 74"
    >
      {SEGMENTS.map((segment) => (
        <rect
          key={segment.key}
          className={`hardware-segment ${(value & (1 << segment.bit)) !== 0 ? 'active' : ''}`}
          height={segment.height}
          rx="2.5"
          width={segment.width}
          x={segment.x}
          y={segment.y}
        />
      ))}
      <circle
        className={`hardware-segment hardware-segment-decimal ${(value & 0x80) !== 0 ? 'active' : ''}`}
        cx="42"
        cy="66.5"
        r="2.8"
      />
    </svg>
  );
}

export function SevenSegmentBank({ values }: { values: readonly number[] }) {
  return (
    <RenderProfileBoundary id="HardwareSevenSegmentBank">
      <div className="hardware-display-bezel" data-testid="hardware-seven-segment-bank">
        <span className="hardware-seven-segment-bank">
          {values.map((value, index) => (
            <SevenSegmentDigit key={index} index={index} value={value} />
          ))}
        </span>
        <span className="hardware-display-addresses" aria-hidden="true">
          {['00', '02', '04', '06', '08', '0A', '0C', '0E'].map((offset) => (
            <span key={offset}>${offset}</span>
          ))}
        </span>
      </div>
    </RenderProfileBoundary>
  );
}
