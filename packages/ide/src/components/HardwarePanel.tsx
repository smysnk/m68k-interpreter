import React from 'react';
import { useDispatch } from 'react-redux';
import type { Easy68kHardwareConfig } from '@m68k/interpreter';
import { useHardwareSurface } from '@/runtime/useHardwareSurface';
import { RenderProfileBoundary, useIdeRenderTelemetry } from '@/runtime/idePerformanceTelemetry';
import { useHardwareController } from '@/hooks/useHardwareController';
import {
  setHardwareConfigurationOpen,
  type AppDispatch,
} from '@/store';
import { SevenSegmentBank } from './hardware/SevenSegmentBank';
import { DigitalIoMatrix } from './hardware/DigitalIoMatrix';
import { HardwareAddressField } from './hardware/HardwareAddressField';
import { InterruptControls } from './hardware/InterruptControls';

function SectionHeading({ eyebrow, title, value }: { eyebrow: string; title: string; value?: string }) {
  return (
    <div className="hardware-section-heading">
      <div><p>{eyebrow}</p><h3>{title}</h3></div>
      {value ? <span className="hardware-value-pill">{value}</span> : null}
    </div>
  );
}

interface HardwarePanelProps {
  embedded?: boolean;
}

const HardwarePanel: React.FC<HardwarePanelProps> = ({ embedded = false }) => {
  useIdeRenderTelemetry('HardwarePanel');
  const dispatch = useDispatch<AppDispatch>();
  const snapshot = useHardwareSurface();
  const {
    preferences,
    status,
    configure,
    restoreDefaults,
    setToggle,
    setButton,
    reset,
    requestInterrupt,
  } = useHardwareController();
  const [lastInterrupt, setLastInterrupt] = React.useState<number | null>(null);

  const commitAddress = (field: keyof Easy68kHardwareConfig, value: number) => {
    void configure({ ...preferences.config, [field]: value });
  };

  const handleInterruptRequest = (level: number) => {
    setLastInterrupt(level);
    void requestInterrupt(level);
  };

  return (
    <RenderProfileBoundary id="HardwarePanel">
      <section
        aria-label="EASy68K hardware panel"
        className={`hardware-preview ${embedded ? 'hardware-preview-embedded' : 'pane-surface'}`}
        data-testid="hardware-panel-preview"
      >
        {!embedded ? (
          <header className="pane-header hardware-preview-header">
            <div className="pane-title-group">
              <p className="pane-eyebrow">Hardware</p>
              <h2 className="pane-title">I/O Board</h2>
              <p className="pane-caption">Live memory-mapped controls for the running simulator.</p>
            </div>
          </header>
        ) : null}

        <div className="hardware-preview-content">
          <section className="hardware-board-section hardware-display-section">
            <SectionHeading eyebrow="Write output" title="Seven-segment display" value="8 × byte" />
            <p className="hardware-committed-address">Base · ${snapshot.config.displayBase.toString(16).toUpperCase().padStart(8, '0')}</p>
            <SevenSegmentBank values={snapshot.display} />
          </section>

          <section className="hardware-board-section hardware-io-matrix-section">
            <SectionHeading eyebrow="Digital I/O" title="8-bit control matrix" value="8 columns" />
            <DigitalIoMatrix snapshot={snapshot} onToggle={(bit, enabled) => void setToggle(bit, enabled)} onButton={(bit, pressed) => void setButton(bit, pressed)} />
            <p className="hardware-io-matrix-note">Each vertical column is one bit: switch → LED → button.</p>
            <button
              aria-expanded={preferences.configurationOpen}
              className="hardware-configure-disclosure"
              onClick={() => dispatch(setHardwareConfigurationOpen(!preferences.configurationOpen))}
              type="button"
            >
              Configure addresses
            </button>
            {preferences.configurationOpen ? (
              <div className="hardware-address-configuration" data-testid="hardware-address-configuration">
                <HardwareAddressField label="Display base" value={preferences.config.displayBase} onCommit={(value) => commitAddress('displayBase', value)} />
                <HardwareAddressField label="LED" value={preferences.config.ledAddress} onCommit={(value) => commitAddress('ledAddress', value)} />
                <HardwareAddressField label="Switch" value={preferences.config.switchAddress} onCommit={(value) => commitAddress('switchAddress', value)} />
                <HardwareAddressField label="Button" value={preferences.config.buttonAddress} onCommit={(value) => commitAddress('buttonAddress', value)} />
                <button className="hardware-reset-button" onClick={() => void restoreDefaults()} type="button">Restore defaults</button>
              </div>
            ) : null}
          </section>

          <section className="hardware-board-section hardware-interrupt-section">
            <SectionHeading eyebrow="CPU control" title="Interrupt requests" value="Levels 7–1" />
            <InterruptControls automaticLevels={preferences.automaticInterruptLevels} intervalMs={preferences.automaticInterruptIntervalMs} lastInterrupt={lastInterrupt} onRequest={handleInterruptRequest} />
            <div className="hardware-interrupt-footer">
              <button className="hardware-reset-button" onClick={() => void reset()} type="button">Reset hardware</button>
            </div>
            <p aria-live="polite" className="hardware-interrupt-status">{status}</p>
          </section>

          <p className="hardware-preview-note">Inputs are active immediately. LED and display output reflect CPU writes through the device bus.</p>
        </div>
      </section>
    </RenderProfileBoundary>
  );
};

export default HardwarePanel;
