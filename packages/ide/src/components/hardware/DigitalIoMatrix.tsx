import React from 'react';
import { faGear, faPen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  EASY68K_BIT_ORDER,
  type Easy68kHardwareDeviceSnapshot,
  type Easy68kHardwareSnapshot,
} from '@m68k/interpreter';
import { DIGITAL_IO_BIT_LABEL_MAX_LENGTH } from '@/store';
import { RenderProfileBoundary } from '@/runtime/idePerformanceTelemetry';
import { HardwareAddressField, type HardwareAddressCommitResult } from './HardwareAddressField';
import { ToggleSwitch } from './ToggleSwitch';
import { LedIndicator } from './LedIndicator';
import { MomentaryButton } from './MomentaryButton';
import { formatHardwareByte } from './SevenSegmentBank';

type DigitalIoAddressField = 'ledAddress' | 'switchAddress' | 'buttonAddress';

function BitLabelRail({
  labels,
  onCommit,
}: {
  labels: readonly string[];
  onCommit: (bit: number, label: string) => void;
}) {
  const [editingBit, setEditingBit] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingBit === null) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingBit]);

  const beginEditing = (bit: number) => {
    setDraft(labels[bit] ?? '');
    setEditingBit(bit);
  };

  return (
    <div
      aria-label="Digital I/O bit labels"
      className="hardware-io-matrix-row hardware-io-label-row"
      role="group"
    >
      <span className="hardware-io-matrix-corner">Labels</span>
      {EASY68K_BIT_ORDER.map((bit) => {
        const label = labels[bit] ?? '';
        const editing = editingBit === bit;
        return (
          <div className="hardware-io-bit-label-cell" data-bit={bit} key={bit}>
            <div className="hardware-io-rotated-label-wrap">
              {editing ? (
                <input
                  aria-label={`Label for bit ${bit}`}
                  className="hardware-io-rotated-label-input"
                  maxLength={DIGITAL_IO_BIT_LABEL_MAX_LENGTH}
                  onBlur={() => setEditingBit(null)}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onCommit(bit, draft.trim());
                      setEditingBit(null);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditingBit(null);
                    }
                  }}
                  ref={inputRef}
                  value={draft}
                />
              ) : (
                <span
                  className="hardware-io-rotated-label"
                  data-empty={label ? undefined : 'true'}
                  title={label || `No label for bit ${bit}`}
                >
                  {label || 'Add label'}
                </span>
              )}
            </div>
            <button
              aria-label={`Edit label for bit ${bit}`}
              className="hardware-io-label-edit"
              onClick={() => beginEditing(bit)}
              title={`Edit label for bit ${bit}`}
              type="button"
            >
              <FontAwesomeIcon aria-hidden="true" icon={faPen} size="xs" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
  bitLabels,
  onAddressCommit,
  onToggle,
  onButton,
  onLabelCommit,
}: {
  snapshot: Easy68kHardwareSnapshot | Easy68kHardwareDeviceSnapshot;
  bitLabels: readonly string[];
  onAddressCommit: (
    field: DigitalIoAddressField,
    value: number
  ) => Promise<HardwareAddressCommitResult>;
  onToggle: (bit: number, enabled: boolean) => void;
  onButton: (bit: number, pressed: boolean) => void;
  onLabelCommit: (bit: number, label: string) => void;
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
        <BitLabelRail labels={bitLabels} onCommit={onLabelCommit} />
      </div>
    </RenderProfileBoundary>
  );
}
