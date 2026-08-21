import React from 'react';
import { InterruptControls } from '@/components/hardware/InterruptControls';
import { useHardwareController } from '@/hooks/useHardwareController';

export default function InterruptPanel() {
  const { preferences, requestInterrupt } = useHardwareController();
  const [lastInterrupt, setLastInterrupt] = React.useState<number | null>(null);

  return (
    <section
      aria-label="CPU interrupt lines"
      className="hardware-panel-surface hardware-interrupt-panel"
      data-testid="hardware-interrupt-requests"
    >
      <div className="hardware-interrupt-panel-heading">
        <span>CPU interrupt lines</span>
        <span>Levels 7–1</span>
      </div>
      <InterruptControls
        aligned
        automaticLevels={preferences.automaticInterruptLevels}
        intervalMs={preferences.automaticInterruptIntervalMs}
        lastInterrupt={lastInterrupt}
        onRequest={(level) => {
          setLastInterrupt(level);
          void requestInterrupt(level);
        }}
      />
    </section>
  );
}
