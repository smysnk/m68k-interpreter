import { EASY68K_INTERRUPT_LEVELS } from '@m68k/interpreter';
import { useDispatch } from 'react-redux';
import { RenderProfileBoundary } from '@/runtime/idePerformanceTelemetry';
import {
  setAutomaticInterruptInterval,
  toggleAutomaticInterruptLevel,
  type AppDispatch,
} from '@/store';

export function InterruptControls({
  automaticLevels,
  intervalMs,
  lastInterrupt,
  onRequest,
}: {
  automaticLevels: readonly number[];
  intervalMs: number;
  lastInterrupt: number | null;
  onRequest: (level: number) => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  return (
    <RenderProfileBoundary id="HardwareInterruptControls">
      <div className="hardware-interrupt-grid">
        {EASY68K_INTERRUPT_LEVELS.map((level) => (
          <div className="hardware-interrupt-control" key={level}>
            <button
              aria-label={`Request interrupt level ${level}`}
              className={`hardware-interrupt-button ${lastInterrupt === level ? 'active' : ''}`}
              onClick={() => onRequest(level)}
              type="button"
            >
              IRQ {level}
            </button>
            <label>
              <input
                aria-label={`Automatic interrupt level ${level}`}
                checked={automaticLevels.includes(level)}
                onChange={() => dispatch(toggleAutomaticInterruptLevel(level))}
                type="checkbox"
              />
              <span>Auto</span>
            </label>
          </div>
        ))}
      </div>
      <label className="hardware-interval-field">
        <span>Interval</span>
        <span className="hardware-interval-input-wrap">
          <input
            aria-label="Automatic interrupt interval"
            min={50}
            onChange={(event) => dispatch(setAutomaticInterruptInterval(Number(event.target.value)))}
            step={50}
            type="number"
            value={intervalMs}
          />
          <span>ms</span>
        </span>
      </label>
    </RenderProfileBoundary>
  );
}
