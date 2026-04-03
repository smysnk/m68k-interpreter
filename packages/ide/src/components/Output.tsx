import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

function formatLastInstruction(lastInstruction: string): string {
  const trimmedInstruction = lastInstruction.replace(/\s*;.*$/, '').trim();

  return trimmedInstruction || lastInstruction.trim();
}

const Output: React.FC = () => {
  const executionState = useSelector((state: RootState) => state.emulator.executionState);
  const displayInstruction = formatLastInstruction(executionState.lastInstruction);
  const hasDiagnostics = executionState.errors.length > 0 || Boolean(executionState.exception);

  return (
    <div className="output-container pane-surface">
      <div className="diagnostics-summary">
        <h4>Diagnostics</h4>
        <p>{hasDiagnostics ? 'Review the current runtime issues below.' : `Last instruction: ${displayInstruction}`}</p>
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
