import React from 'react';

const BIT_ORDER = [7, 6, 5, 4, 3, 2, 1, 0] as const;
const INITIAL_SWITCH_VALUE = 0xa5;
const INITIAL_DISPLAY_VALUES = [0x7d, 0x7f, 0x00, 0x00, 0x5b, 0x3f, 0x5b, 0x7d];

const SEGMENTS = [
  { bit: 0, key: 'a', x: 9, y: 4, width: 26, height: 5 },
  { bit: 1, key: 'b', x: 34, y: 9, width: 5, height: 23 },
  { bit: 2, key: 'c', x: 34, y: 41, width: 5, height: 23 },
  { bit: 3, key: 'd', x: 9, y: 64, width: 26, height: 5 },
  { bit: 4, key: 'e', x: 4, y: 41, width: 5, height: 23 },
  { bit: 5, key: 'f', x: 4, y: 9, width: 5, height: 23 },
  { bit: 6, key: 'g', x: 9, y: 34, width: 26, height: 5 },
] as const;

interface AddressFieldProps {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
}

function formatByte(value: number): string {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function createBitState(value: number): boolean[] {
  return Array.from({ length: 8 }, (_, bit) => (value & (1 << bit)) !== 0);
}

function AddressField({
  label,
  ariaLabel,
  value,
  onChange,
}: AddressFieldProps): React.ReactElement {
  return (
    <label className="hardware-address-field">
      <span>{label}</span>
      <div className="hardware-address-input-wrap">
        <span aria-hidden="true">$</span>
        <input
          aria-label={ariaLabel ?? `${label} address`}
          inputMode="text"
          maxLength={8}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          spellCheck={false}
          value={value}
        />
      </div>
    </label>
  );
}

function SevenSegmentDigit({ value, index }: { value: number; index: number }): React.ReactElement {
  return (
    <svg
      aria-label={`Display digit ${index + 1}, pattern ${formatByte(value)}`}
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

function SectionHeading({
  eyebrow,
  title,
  value,
}: {
  eyebrow: string;
  title: string;
  value?: string;
}): React.ReactElement {
  return (
    <div className="hardware-section-heading">
      <div>
        <p>{eyebrow}</p>
        <h3>{title}</h3>
      </div>
      {value ? <span className="hardware-value-pill">{value}</span> : null}
    </div>
  );
}

const HardwarePanelPreview: React.FC = () => {
  const [addresses, setAddresses] = React.useState({
    display: '00E00000',
    leds: '00E00010',
    switches: '00E00010',
    buttons: '00E00012',
  });
  const [switches, setSwitches] = React.useState(() => createBitState(INITIAL_SWITCH_VALUE));
  const [pressedButtons, setPressedButtons] = React.useState(() => createBitState(0));
  const [displayValues, setDisplayValues] = React.useState(() => [...INITIAL_DISPLAY_VALUES]);
  const [autoLevels, setAutoLevels] = React.useState<Set<number>>(() => new Set([3]));
  const [intervalMs, setIntervalMs] = React.useState(1000);
  const [lastInterrupt, setLastInterrupt] = React.useState<number | null>(null);

  const switchValue = switches.reduce(
    (value, enabled, bit) => (enabled ? value | (1 << bit) : value),
    0
  );
  const buttonValue = pressedButtons.reduce(
    (value, pressed, bit) => (pressed ? value & ~(1 << bit) : value),
    0xff
  );

  const setAddress = (key: keyof typeof addresses, value: string): void => {
    setAddresses((current) => ({ ...current, [key]: value.replace(/[^0-9A-F]/g, '') }));
  };

  const toggleSwitch = (bit: number): void => {
    setSwitches((current) => current.map((enabled, index) => (index === bit ? !enabled : enabled)));
  };

  const setButtonPressed = (bit: number, pressed: boolean): void => {
    setPressedButtons((current) =>
      current.map((currentPressed, index) => (index === bit ? pressed : currentPressed))
    );
  };

  const handleButtonKeyDown = (
    bit: number,
    event: React.KeyboardEvent<HTMLButtonElement>
  ): void => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    setButtonPressed(bit, true);
  };

  const handleButtonKeyUp = (bit: number, event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    setButtonPressed(bit, false);
  };

  const toggleAutoLevel = (level: number): void => {
    setAutoLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const resetPreview = (): void => {
    setAddresses({
      display: '00E00000',
      leds: '00E00010',
      switches: '00E00010',
      buttons: '00E00012',
    });
    setSwitches(createBitState(INITIAL_SWITCH_VALUE));
    setPressedButtons(createBitState(0));
    setDisplayValues([...INITIAL_DISPLAY_VALUES]);
    setAutoLevels(new Set([3]));
    setIntervalMs(1000);
    setLastInterrupt(null);
  };

  const cycleDisplay = (): void => {
    setDisplayValues((current) => [...current.slice(1), current[0]]);
  };

  return (
    <section
      aria-label="Hardware panel proof of concept"
      className="hardware-preview pane-surface"
      data-testid="hardware-panel-preview"
    >
      <header className="pane-header hardware-preview-header">
        <div className="pane-title-group">
          <p className="pane-eyebrow">Hardware Preview</p>
          <h2 className="pane-title">I/O Board</h2>
          <p className="pane-caption">Memory-mapped controls styled for the existing simulator.</p>
        </div>
        <span className="hardware-preview-badge">
          <span aria-hidden="true" />
          UI only
        </span>
      </header>

      <div className="hardware-preview-content">
        <section className="hardware-board-section hardware-display-section">
          <SectionHeading eyebrow="Write output" title="Seven-segment display" value="8 × byte" />
          <AddressField
            label="Base"
            onChange={(value) => setAddress('display', value)}
            value={addresses.display}
          />
          <button
            aria-label="Cycle preview display"
            className="hardware-display-bezel"
            onClick={cycleDisplay}
            title="Cycle the preview values"
            type="button"
          >
            <span className="hardware-seven-segment-bank">
              {displayValues.map((value, index) => (
                <SevenSegmentDigit key={index} index={index} value={value} />
              ))}
            </span>
            <span className="hardware-display-addresses" aria-hidden="true">
              <span>$00</span>
              <span>$02</span>
              <span>$04</span>
              <span>$06</span>
              <span>$08</span>
              <span>$0A</span>
              <span>$0C</span>
              <span>$0E</span>
            </span>
          </button>
        </section>

        <section className="hardware-board-section hardware-io-matrix-section">
          <SectionHeading eyebrow="Digital I/O" title="8-bit control matrix" value="8 columns" />
          <div
            aria-label="Digital I/O bit matrix"
            className="hardware-io-matrix"
            data-testid="hardware-io-matrix"
          >
            <div aria-hidden="true" className="hardware-io-matrix-row hardware-io-matrix-header">
              <span className="hardware-io-matrix-corner">Bit</span>
              {BIT_ORDER.map((bit) => (
                <span className="hardware-io-bit-heading" key={bit}>
                  {bit}
                </span>
              ))}
            </div>

            <div className="hardware-io-matrix-row hardware-io-switch-row">
              <div className="hardware-io-row-label">
                <strong>Switch</strong>
                <span>Read · ${addresses.switches}</span>
                <output>{formatByte(switchValue)}</output>
              </div>
              {BIT_ORDER.map((bit) => (
                <div className="hardware-io-cell" key={bit}>
                  <button
                    aria-checked={switches[bit]}
                    aria-label={`Toggle switch ${bit}`}
                    className={`hardware-toggle ${switches[bit] ? 'active' : ''}`}
                    onClick={() => toggleSwitch(bit)}
                    role="switch"
                    type="button"
                  >
                    <span className="hardware-toggle-track">
                      <span className="hardware-toggle-handle" />
                    </span>
                  </button>
                </div>
              ))}
            </div>

            <div
              aria-label={`LED output ${formatByte(switchValue)}`}
              className="hardware-io-matrix-row hardware-io-led-row"
              role="img"
            >
              <div className="hardware-io-row-label">
                <strong>LED</strong>
                <span>Write · ${addresses.leds}</span>
                <output>{formatByte(switchValue)}</output>
              </div>
              {BIT_ORDER.map((bit) => (
                <div className="hardware-io-cell" key={bit}>
                  <span className={`hardware-led ${switches[bit] ? 'active' : ''}`} />
                </div>
              ))}
            </div>

            <div
              className="hardware-io-matrix-row hardware-io-button-row"
              data-testid="hardware-matrix-button-row"
            >
              <div className="hardware-io-row-label">
                <strong>Button</strong>
                <span>Read low · ${addresses.buttons}</span>
                <output>{formatByte(buttonValue)}</output>
              </div>
              {BIT_ORDER.map((bit) => (
                <div className="hardware-io-cell" key={bit}>
                  <button
                    aria-label={`Push button ${bit}`}
                    aria-pressed={pressedButtons[bit]}
                    className={`hardware-push-button ${pressedButtons[bit] ? 'active' : ''}`}
                    onBlur={() => setButtonPressed(bit, false)}
                    onKeyDown={(event) => handleButtonKeyDown(bit, event)}
                    onKeyUp={(event) => handleButtonKeyUp(bit, event)}
                    onPointerCancel={() => setButtonPressed(bit, false)}
                    onPointerDown={() => setButtonPressed(bit, true)}
                    onPointerLeave={() => setButtonPressed(bit, false)}
                    onPointerUp={() => setButtonPressed(bit, false)}
                    type="button"
                  >
                    <span />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <p className="hardware-io-matrix-note">
            Each vertical column is one bit: switch → LED → button.
          </p>
        </section>

        <section className="hardware-board-section hardware-interrupt-section">
          <SectionHeading eyebrow="CPU control" title="Interrupt requests" value="Levels 7–1" />
          <div className="hardware-interrupt-grid">
            {BIT_ORDER.slice(0, 7).map((level) => (
              <div className="hardware-interrupt-control" key={level}>
                <button
                  aria-label={`Request interrupt level ${level}`}
                  className={`hardware-interrupt-button ${lastInterrupt === level ? 'active' : ''}`}
                  onClick={() => setLastInterrupt(level)}
                  type="button"
                >
                  IRQ {level}
                </button>
                <label>
                  <input
                    aria-label={`Automatic interrupt level ${level}`}
                    checked={autoLevels.has(level)}
                    onChange={() => toggleAutoLevel(level)}
                    type="checkbox"
                  />
                  <span>Auto</span>
                </label>
              </div>
            ))}
          </div>
          <div className="hardware-interrupt-footer">
            <label className="hardware-interval-field">
              <span>Interval</span>
              <span className="hardware-interval-input-wrap">
                <input
                  aria-label="Automatic interrupt interval"
                  min={50}
                  onChange={(event) =>
                    setIntervalMs(Math.max(50, Number(event.target.value) || 50))
                  }
                  step={50}
                  type="number"
                  value={intervalMs}
                />
                <span>ms</span>
              </span>
            </label>
            <button className="hardware-reset-button" onClick={resetPreview} type="button">
              Reset board
            </button>
          </div>
          <p aria-live="polite" className="hardware-interrupt-status">
            {lastInterrupt === null
              ? `${autoLevels.size} automatic level${autoLevels.size === 1 ? '' : 's'} armed • preview only`
              : `IRQ ${lastInterrupt} requested • preview only`}
          </p>
        </section>

        <p className="hardware-preview-note">
          Interactive visual prototype. Switches mirror the LED bank to demonstrate the shared
          read/write address; emulator wiring follows the implementation plan.
        </p>
      </div>
    </section>
  );
};

export default HardwarePanelPreview;
