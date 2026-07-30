import {
  EASY68K_BIT_ORDER,
  type Easy68kHardwareDeviceSnapshot,
  type Easy68kHardwareSnapshot,
} from '@m68k/interpreter';
import { RenderProfileBoundary } from '@/runtime/idePerformanceTelemetry';
import { ToggleSwitch } from './ToggleSwitch';
import { LedIndicator } from './LedIndicator';
import { MomentaryButton } from './MomentaryButton';
import { formatHardwareByte } from './SevenSegmentBank';

function RowLabel({ title, direction, address, value }: {
  title: string;
  direction: string;
  address: number;
  value: number;
}) {
  return (
    <div className="hardware-io-row-label">
      <strong>{title}</strong>
      <span>{direction} · ${address.toString(16).toUpperCase().padStart(8, '0')}</span>
      <output>{formatHardwareByte(value)}</output>
    </div>
  );
}

export function DigitalIoMatrix({
  snapshot,
  onToggle,
  onButton,
}: {
  snapshot: Easy68kHardwareSnapshot | Easy68kHardwareDeviceSnapshot;
  onToggle: (bit: number, enabled: boolean) => void;
  onButton: (bit: number, pressed: boolean) => void;
}) {
  return (
    <RenderProfileBoundary id="HardwareDigitalIoMatrix">
      <div aria-label="Digital I/O bit matrix" className="hardware-io-matrix" data-testid="hardware-io-matrix">
        <div aria-hidden="true" className="hardware-io-matrix-row hardware-io-matrix-header">
          <span className="hardware-io-matrix-corner">Bit</span>
          {EASY68K_BIT_ORDER.map((bit) => <span className="hardware-io-bit-heading" key={bit}>{bit}</span>)}
        </div>
        <div className="hardware-io-matrix-row hardware-io-switch-row">
          <RowLabel title="Switch" direction="Read" address={snapshot.config.switchAddress} value={snapshot.switches} />
          {EASY68K_BIT_ORDER.map((bit) => (
            <div className="hardware-io-cell" key={bit}>
              <ToggleSwitch bit={bit} enabled={(snapshot.switches & (1 << bit)) !== 0} onChange={(enabled) => onToggle(bit, enabled)} />
            </div>
          ))}
        </div>
        <div aria-label={`LED output ${formatHardwareByte(snapshot.leds)}`} className="hardware-io-matrix-row hardware-io-led-row" role="img">
          <RowLabel title="LED" direction="Write" address={snapshot.config.ledAddress} value={snapshot.leds} />
          {EASY68K_BIT_ORDER.map((bit) => (
            <div className="hardware-io-cell" key={bit}><LedIndicator bit={bit} active={(snapshot.leds & (1 << bit)) !== 0} /></div>
          ))}
        </div>
        <div className="hardware-io-matrix-row hardware-io-button-row" data-testid="hardware-matrix-button-row">
          <RowLabel title="Button" direction="Read low" address={snapshot.config.buttonAddress} value={snapshot.buttons} />
          {EASY68K_BIT_ORDER.map((bit) => (
            <div className="hardware-io-cell" key={bit}>
              <MomentaryButton bit={bit} pressed={(snapshot.buttons & (1 << bit)) === 0} onPressedChange={(pressed) => onButton(bit, pressed)} />
            </div>
          ))}
        </div>
      </div>
    </RenderProfileBoundary>
  );
}
