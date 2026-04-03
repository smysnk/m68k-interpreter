import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileDownload } from '@fortawesome/free-solid-svg-icons';
import { useIdeRenderTelemetry } from '@/runtime/idePerformanceTelemetry';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';
import { useMemorySurface } from '@/runtime/useMemorySurface';

const MEMORY_VIEWPORT_COLUMNS = 16;
const MEMORY_VIEWPORT_ROWS = 16;
const MEMORY_VIEWPORT_LENGTH = MEMORY_VIEWPORT_COLUMNS * MEMORY_VIEWPORT_ROWS;

const Memory: React.FC = () => {
  useIdeRenderTelemetry('Memory');
  const { meta } = useMemorySurface();
  const [startAddress, setStartAddress] = useState<number>(0x1000);

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = parseInt(e.target.value, 16);
    if (!isNaN(value)) {
      setStartAddress(value);
    }
  };

  const handleDownload = (): void => {
    const memoryData = Object.entries(memorySurfaceStore.exportMemory())
      .map(([addr, val]) => `${addr}=${val.toString(16).padStart(2, '0')}`)
      .join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(memoryData)}`);
    element.setAttribute('download', 'memory.txt');
    element.style.display = 'none';

    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const visibleBytes = memorySurfaceStore.readRange(startAddress, MEMORY_VIEWPORT_LENGTH);

  const getValue = (offset: number): string => (visibleBytes[offset] ?? 0).toString(16).padStart(2, '0');
  const formatAddress = (address: number | null): string =>
    address === null ? 'n/a' : `0x${address.toString(16).padStart(8, '0')}`;

  return (
    <div className="memory-container pane-surface">
      <div className="pane-header">
        <div className="pane-title-group">
          <p className="pane-eyebrow">Machine State</p>
          <h3 className="pane-title">Memory</h3>
          <p className="pane-caption">Hex view from the selected start address.</p>
        </div>
        <button
          aria-label="Download memory"
          onClick={handleDownload}
          className="btn-toolbar btn-toolbar-icon btn-pane-action"
          type="button"
          title="Download memory"
        >
          <FontAwesomeIcon icon={faFileDownload} size="sm" />
        </button>
      </div>

      <div className="memory-controls">
        <label htmlFor="mem-start">Start Address</label>
        <input
          id="mem-start"
          type="text"
          value={`0x${startAddress.toString(16).padStart(8, '0')}`}
          onChange={handleAddressChange}
          placeholder="0x00000000"
        />
      </div>

      <div className="memory-table-wrapper">
        <table className="memory-table">
          <thead>
            <tr>
              <th>Address</th>
              {Array.from({ length: 16 }).map((_, i) => (
                <th key={i}>+{i.toString(16).toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: MEMORY_VIEWPORT_ROWS }).map((_, row) => {
              const rowStart = startAddress + row * MEMORY_VIEWPORT_COLUMNS;
              return (
                <tr key={row}>
                  <td className="addr-cell">
                    {`0x${rowStart.toString(16).padStart(8, '0')}`}
                  </td>
                  {Array.from({ length: MEMORY_VIEWPORT_COLUMNS }).map((_, col) => {
                    const offset = row * MEMORY_VIEWPORT_COLUMNS + col;
                    return (
                      <td key={col} className="mem-cell">
                        {getValue(offset)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="memory-stats">
        <p>Used bytes: {meta.usedBytes}</p>
        <p>Address range: {formatAddress(meta.minAddress)} - {formatAddress(meta.maxAddress)}</p>
      </div>
    </div>
  );
};

export default Memory;
