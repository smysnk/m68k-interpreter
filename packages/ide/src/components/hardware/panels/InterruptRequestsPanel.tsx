import React from 'react';
import { InterruptControls } from '@/components/hardware/InterruptControls';
import { useHardwareController } from '@/hooks/useHardwareController';

export default function InterruptRequestsPanel() {
  const {
    preferences,
    requestInterrupt,
    reset,
    status,
  } = useHardwareController();
  const [lastInterrupt, setLastInterrupt] = React.useState<number | null>(null);

  return (
    <section
      aria-label="Interrupt request hardware"
      className="hardware-panel-surface hardware-interrupt-panel"
      data-testid="hardware-interrupt-requests"
    >
      <div className="hardware-panel-summary">
        <span>CPU control</span>
        <output>Levels 7–1</output>
      </div>
      <InterruptControls
        automaticLevels={preferences.automaticInterruptLevels}
        intervalMs={preferences.automaticInterruptIntervalMs}
        lastInterrupt={lastInterrupt}
        onRequest={(level) => {
          setLastInterrupt(level);
          void requestInterrupt(level);
        }}
      />
      <div className="hardware-interrupt-footer">
        <button
          className="hardware-reset-button"
          onClick={() => void reset()}
          type="button"
        >
          Reset simulator
        </button>
      </div>
      <p aria-live="polite" className="hardware-interrupt-status">{status}</p>
    </section>
  );
}
