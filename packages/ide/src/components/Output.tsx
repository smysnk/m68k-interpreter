import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faGaugeHigh } from '@fortawesome/free-solid-svg-icons';
import { useEmulatorStore } from '@/stores/emulatorStore';

const Output: React.FC = () => {
  const {
    executionState,
    delay,
    setDelay,
    speedMultiplier,
    setSpeedMultiplier,
    runtimeMetrics,
    emulatorInstance,
    terminalSnapshot,
  } = useEmulatorStore();
  const waitingForInput = emulatorInstance?.isWaitingForInput() ?? false;
  const halted = emulatorInstance?.isHalted() ?? false;

  return (
    <div className="output-container">
      <div className="output-section">
        <div className="last-instruction">
          <h4>Last Instruction</h4>
          <p>{executionState.lastInstruction}</p>
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

      <div className="output-meta">
        <span>Cursor: {terminalSnapshot.cursorRow + 1}:{terminalSnapshot.cursorColumn + 1}</span>
        <span>Buffered output: {terminalSnapshot.output.length} chars</span>
        <span>
          Frame: {runtimeMetrics.lastFrameInstructions} instr / {runtimeMetrics.lastFrameDurationMs.toFixed(1)} ms
        </span>
        <span>Stop: {runtimeMetrics.lastStopReason}</span>
        <span>{waitingForInput ? 'Waiting for input' : halted ? 'Program halted' : 'CPU ready'}</span>
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

      <div className="execution-status">
        <span className={`status-indicator ${executionState.started && !waitingForInput ? 'active' : ''}`}>
          {executionState.ended
            ? '✓ Ended'
            : waitingForInput
              ? '⌨ Waiting'
              : executionState.started
                ? '⏳ Running'
                : '⏸ Ready'}
        </span>
      </div>
    </div>
  );
};

export default Output;
