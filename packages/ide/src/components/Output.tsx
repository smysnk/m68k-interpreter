import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClock,
  faGaugeHigh,
  faPlay,
  faRedo,
  faStop,
  faUndo,
} from '@fortawesome/free-solid-svg-icons';
import { useEmulatorStore } from '@/stores/emulatorStore';

function formatLastInstruction(lastInstruction: string): string {
  const trimmedInstruction = lastInstruction.replace(/\s*;.*$/, '').trim();

  return trimmedInstruction || lastInstruction.trim();
}

const Output: React.FC = () => {
  const {
    executionState,
    delay,
    setDelay,
    speedMultiplier,
    setSpeedMultiplier,
  } = useEmulatorStore();
  const displayInstruction = formatLastInstruction(executionState.lastInstruction);

  const handleRun = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:run'));
    window.dispatchEvent(new CustomEvent('emulator:focus-terminal'));
  };

  const handleStep = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:step'));
    window.dispatchEvent(new CustomEvent('emulator:focus-terminal'));
  };

  const handleUndo = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:undo'));
  };

  const handleReset = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:reset'));
  };

  return (
    <div className="output-container pane-surface">
      <div className="output-section">
        <div className="last-instruction">
          <div className="last-instruction-header">
            <div className="last-instruction-copy">
              <h4>Last Instruction</h4>
              <p>{displayInstruction}</p>
            </div>
            <div className="last-instruction-actions" aria-label="Execution controls">
              <button
                aria-label="Run program"
                className="btn-toolbar btn-toolbar-icon btn-toolbar-accent"
                onClick={handleRun}
                title="Run program"
                type="button"
              >
                <FontAwesomeIcon icon={faPlay} size="sm" />
              </button>
              <button
                aria-label="Reset"
                className="btn-toolbar btn-toolbar-icon"
                onClick={handleReset}
                title="Reset"
                type="button"
              >
                <FontAwesomeIcon icon={faStop} size="sm" />
              </button>
              <button
                aria-label="Step"
                className="btn-toolbar btn-toolbar-icon"
                onClick={handleStep}
                title="Step"
                type="button"
              >
                <FontAwesomeIcon icon={faRedo} size="sm" />
              </button>
              <button
                aria-label="Undo"
                className="btn-toolbar btn-toolbar-icon"
                onClick={handleUndo}
                title="Undo"
                type="button"
              >
                <FontAwesomeIcon icon={faUndo} size="sm" />
              </button>
            </div>
          </div>
        </div>

        <div className="delay-control">
          <label htmlFor="delay-input">Delay (s)</label>
          <div className="input-group">
            <input
              id="delay-input"
              type="number"
              min="0"
              step="0.5"
              value={delay}
              onChange={(e) => setDelay(parseFloat(e.target.value) || 0)}
              placeholder="0"
              title="Delay between instruction execution in seconds"
            />
            <FontAwesomeIcon icon={faClock} title="Execution delay" />
          </div>
        </div>

        <div className="delay-control">
          <label htmlFor="speed-input">Speed (x)</label>
          <div className="input-group">
            <input
              id="speed-input"
              type="number"
              min="0.25"
              max="8"
              step="0.25"
              value={speedMultiplier}
              onChange={(e) => setSpeedMultiplier(Math.max(0.25, parseFloat(e.target.value) || 1))}
              placeholder="1"
              title="Multiplier for per-frame execution budget"
            />
            <FontAwesomeIcon icon={faGaugeHigh} title="Execution speed multiplier" />
          </div>
        </div>
      </div>

      {executionState.errors.length > 0 && (
        <div className="errors-section">
          <h4>Errors</h4>
          <ul className="error-list">
            {executionState.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {executionState.exception && (
        <div className="exception-section">
          <h4>Exception</h4>
          <p className="exception-text">{executionState.exception}</p>
        </div>
      )}
    </div>
  );
};

export default Output;
