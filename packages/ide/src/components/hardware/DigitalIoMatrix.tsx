import React from 'react';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  EASY68K_BIT_ORDER,
  type Easy68kHardwareDeviceSnapshot,
  type Easy68kHardwareSnapshot,
} from '@m68k/interpreter';
import { RenderProfileBoundary } from '@/runtime/idePerformanceTelemetry';
import { HardwareAddressField, type HardwareAddressCommitResult } from './HardwareAddressField';
import { ToggleSwitch } from './ToggleSwitch';
import { LedIndicator } from './LedIndicator';
import { MomentaryButton } from './MomentaryButton';
import { formatHardwareByte } from './SevenSegmentBank';

type DigitalIoAddressField = 'ledAddress' | 'switchAddress' | 'buttonAddress';

function RowLabel({
  title,
  address,
  onCommit,
}: {
  title: string;
  address: number;
  onCommit: (value: number) => Promise<HardwareAddressCommitResult>;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="hardware-io-row-label">
      <strong>{title}</strong>
      <div className="hardware-io-address-menu">
        <button
          aria-expanded={open}
          aria-label={`Configure ${title.toLowerCase()} address`}
          data-address={address.toString(16).toUpperCase().padStart(8, '0')}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <FontAwesomeIcon aria-hidden="true" icon={faGear} size="xs" />
        </button>
        {open ? (
          <div className="hardware-io-address-popover">
            <HardwareAddressField
              compact
              label={title}
              onCommit={async (value) => {
                const result = await onCommit(value);
                if (result.ok) setOpen(false);
                return result;
              }}
              value={address}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DigitalIoMatrix({
  snapshot,
  onAddressCommit,
  onToggle,
  onButton,
}: {
  snapshot: Easy68kHardwareSnapshot | Easy68kHardwareDeviceSnapshot;
  onAddressCommit: (
    field: DigitalIoAddressField,
    value: number
  ) => Promise<HardwareAddressCommitResult>;
  onToggle: (bit: number, enabled: boolean) => void;
  onButton: (bit: number, pressed: boolean) => void;
}) {
  return (
    <RenderProfileBoundary id="HardwareDigitalIoMatrix">
      <div
        aria-label="Digital I/O bit matrix"
        className="hardware-io-matrix"
        data-testid="hardware-io-matrix"
      >
        <div aria-hidden="true" className="hardware-io-matrix-row hardware-io-matrix-header">
          <span className="hardware-io-matrix-corner">Bit</span>
          {EASY68K_BIT_ORDER.map((bit) => (
            <span className="hardware-io-bit-heading" key={bit}>
              {bit}
            </span>
          ))}
        </div>
        <div
          aria-label={`Switch input ${formatHardwareByte(snapshot.switches)}`}
          className="hardware-io-matrix-row hardware-io-switch-row"
          role="group"
        >
          <RowLabel
            title="Switch"
            address={snapshot.config.switchAddress}
            onCommit={(value) => onAddressCommit('switchAddress', value)}
          />
          {EASY68K_BIT_ORDER.map((bit) => (
            <div className="hardware-io-cell" key={bit}>
              <ToggleSwitch
                bit={bit}
                enabled={(snapshot.switches & (1 << bit)) !== 0}
                onChange={(enabled) => onToggle(bit, enabled)}
              />
            </div>
          ))}
        </div>
        <div
          aria-label={`LED output ${formatHardwareByte(snapshot.leds)}`}
          className="hardware-io-matrix-row hardware-io-led-row"
          role="img"
        >
          <RowLabel
            title="LED"
            address={snapshot.config.ledAddress}
            onCommit={(value) => onAddressCommit('ledAddress', value)}
          />
          {EASY68K_BIT_ORDER.map((bit) => (
            <div className="hardware-io-cell" key={bit}>
              <LedIndicator bit={bit} active={(snapshot.leds & (1 << bit)) !== 0} />
            </div>
          ))}
        </div>
        <div
          aria-label={`Button input ${formatHardwareByte(snapshot.buttons)}`}
          className="hardware-io-matrix-row hardware-io-button-row"
          data-testid="hardware-matrix-button-row"
          role="group"
        >
          <RowLabel
            title="Button"
            address={snapshot.config.buttonAddress}
            onCommit={(value) => onAddressCommit('buttonAddress', value)}
          />
          {EASY68K_BIT_ORDER.map((bit) => (
            <div className="hardware-io-cell" key={bit}>
              <MomentaryButton
                bit={bit}
                pressed={(snapshot.buttons & (1 << bit)) === 0}
                onPressedChange={(pressed) => onButton(bit, pressed)}
              />
            </div>
          ))}
        </div>
      </div>
    </RenderProfileBoundary>
  );
}
