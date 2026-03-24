import React from 'react';
import { useSelector } from 'react-redux';
import { selectFlagsPanelModel } from '@/store';

const Flags: React.FC = () => {
  const { ccrHex, rows } = useSelector(selectFlagsPanelModel);

  return (
    <div className="flags-container pane-surface">
      <div className="pane-header">
        <div className="pane-title-group">
          <p className="pane-eyebrow">Machine State</p>
          <h3 className="pane-title">Flags</h3>
          <p className="pane-caption">Condition code bits and the current CCR value.</p>
        </div>
      </div>

      <div className="registers-content">
        <table className="registers-table">
          <thead>
            <tr>
              <th colSpan={2}>Condition Code Register (CCR)</th>
            </tr>
            <tr>
              <th>Flag</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={row.active ? 'flag-set' : 'flag-clear'} key={row.key}>
                <td className="flag-name">{row.name}</td>
                <td className="flag-value">{row.active ? '1 - SET' : '0 - CLEAR'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ccr-hex">
          <strong>CCR Value:</strong> {ccrHex}
        </div>
      </div>
    </div>
  );
};

export default Flags;
