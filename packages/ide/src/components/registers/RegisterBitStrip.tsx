import React from 'react';
import {
  createRegisterBitRows,
  mergeRegisterRowHexValue,
  stepRegisterHexDigit,
  updateRegisterHexDigit,
  type RegisterBitWidth,
} from './registerFormatting';
import RegisterHexField from './RegisterHexField';

type RegisterBitStripProps = {
  value: number;
  bitWidth: RegisterBitWidth;
  label: string;
  editable?: boolean;
  onToggleBit?: (bitIndex: number) => void;
  onCommitValue?: (nextValue: number) => void;
};

const RegisterBitStrip: React.FC<RegisterBitStripProps> = ({
  value,
  bitWidth,
  label,
  editable = false,
  onToggleBit,
  onCommitValue,
}) => {
  const rows = React.useMemo(() => createRegisterBitRows(value, bitWidth), [bitWidth, value]);
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const mouseFocusRowRef = React.useRef<number | null>(null);
  const [selectedNibble, setSelectedNibble] = React.useState<{ rowIndex: number; nibbleIndex: number } | null>(
    null
  );

  const applyNibbleSelection = React.useCallback(
    (input: HTMLInputElement, rowIndex: number, nibbleIndex: number) => {
      const row = rows[rowIndex];

      if (!row) {
        return;
      }

      const clampedNibbleIndex = Math.max(0, Math.min(nibbleIndex, row.segmentHex.length - 1));
      const selectionStart = 2 + clampedNibbleIndex;
      input.setSelectionRange(selectionStart, selectionStart + 1);
    },
    [rows]
  );

  const focusNibble = React.useCallback((rowIndex: number, nibbleIndex: number) => {
    const row = rows[rowIndex];

    if (!row) {
      return;
    }

    const clampedNibbleIndex = Math.max(0, Math.min(nibbleIndex, row.segmentHex.length - 1));
    setSelectedNibble({ rowIndex, nibbleIndex: clampedNibbleIndex });
  }, [rows]);

  React.useLayoutEffect(() => {
    if (!selectedNibble) {
      return;
    }

    const input = inputRefs.current[selectedNibble.rowIndex];
    const row = rows[selectedNibble.rowIndex];

    if (!input || !row) {
      return;
    }

    if (document.activeElement !== input) {
      input.focus();
    }

    applyNibbleSelection(input, selectedNibble.rowIndex, selectedNibble.nibbleIndex);
  }, [applyNibbleSelection, rows, selectedNibble]);

  const moveSelection = React.useCallback(
    (rowIndex: number, nibbleIndex: number, direction: 'left' | 'right' | 'up' | 'down') => {
      const row = rows[rowIndex];

      if (!row) {
        return { rowIndex, nibbleIndex };
      }

      if (direction === 'left') {
        if (nibbleIndex > 0) {
          return { rowIndex, nibbleIndex: nibbleIndex - 1 };
        }

        if (rowIndex > 0) {
          const previousRow = rows[rowIndex - 1];
          return { rowIndex: rowIndex - 1, nibbleIndex: previousRow.segmentHex.length - 1 };
        }
      }

      if (direction === 'right') {
        if (nibbleIndex < row.segmentHex.length - 1) {
          return { rowIndex, nibbleIndex: nibbleIndex + 1 };
        }

        if (rowIndex < rows.length - 1) {
          return { rowIndex: rowIndex + 1, nibbleIndex: 0 };
        }
      }

      if (direction === 'up' && rowIndex > 0) {
        const previousRow = rows[rowIndex - 1];
        return { rowIndex: rowIndex - 1, nibbleIndex: Math.min(nibbleIndex, previousRow.segmentHex.length - 1) };
      }

      if (direction === 'down' && rowIndex < rows.length - 1) {
        const nextRow = rows[rowIndex + 1];
        return { rowIndex: rowIndex + 1, nibbleIndex: Math.min(nibbleIndex, nextRow.segmentHex.length - 1) };
      }

      return { rowIndex, nibbleIndex };
    },
    [rows]
  );

  const getSelectionNibbleIndex = React.useCallback(
    (input: HTMLInputElement, rowIndex: number) => {
      const row = rows[rowIndex];

      if (!row) {
        return 0;
      }

      const start = input.selectionStart ?? 2;
      return Math.max(0, Math.min(start - 2, row.segmentHex.length - 1));
    },
    [rows]
  );

  const commitHexDigit = React.useCallback(
    (rowIndex: number, nibbleIndex: number, digit: string) => {
      const row = rows[rowIndex];

      if (!row || !editable || !onCommitValue) {
        return;
      }

      const nextSegmentHex = updateRegisterHexDigit(row.segmentHex, nibbleIndex, digit);
      const nextSegmentValue = Number.parseInt(nextSegmentHex, 16);

      const nextSelection =
        nibbleIndex >= row.segmentHex.length - 1 && rowIndex < rows.length - 1
          ? { rowIndex: rowIndex + 1, nibbleIndex: 0 }
          : { rowIndex, nibbleIndex: Math.min(nibbleIndex + 1, row.segmentHex.length - 1) };
      setSelectedNibble(nextSelection);
      onCommitValue(mergeRegisterRowHexValue(value, bitWidth, rowIndex, nextSegmentValue));
    },
    [bitWidth, editable, onCommitValue, rows, value]
  );

  const stepHexDigit = React.useCallback(
    (rowIndex: number, nibbleIndex: number, delta: 1 | -1) => {
      const row = rows[rowIndex];

      if (!row || !editable || !onCommitValue) {
        return;
      }

      const nextSegmentHex = stepRegisterHexDigit(row.segmentHex, nibbleIndex, delta);
      const nextSegmentValue = Number.parseInt(nextSegmentHex, 16);

      setSelectedNibble({ rowIndex, nibbleIndex });
      onCommitValue(mergeRegisterRowHexValue(value, bitWidth, rowIndex, nextSegmentValue));
    },
    [bitWidth, editable, onCommitValue, rows, value]
  );

  return (
    <div className="register-bit-rows">
      {rows.map((row) => (
        <div
          aria-label={`${label} row ${row.rowIndex + 1} binary ${row.binaryText}`}
          className="register-bit-row"
          key={`${label}-row-${row.rowIndex}`}
          role="group"
        >
          {editable ? (
            <RegisterHexField
              ariaLabel={`${label} row ${row.rowIndex + 1} hex input`}
              className="register-segment-input"
              editable
              inputRef={(element) => {
                inputRefs.current[row.rowIndex] = element;
              }}
              value={`0x${row.segmentHex}`}
              widthCh={row.segmentHex.length + 2}
              onMouseDown={() => {
                mouseFocusRowRef.current = row.rowIndex;
              }}
              onClick={(event) => {
                const nextNibbleIndex = getSelectionNibbleIndex(event.currentTarget, row.rowIndex);
                focusNibble(row.rowIndex, nextNibbleIndex);
                applyNibbleSelection(event.currentTarget, row.rowIndex, nextNibbleIndex);
              }}
              onFocus={(event) => {
                if (mouseFocusRowRef.current === row.rowIndex) {
                  return;
                }

                const nextNibbleIndex =
                  selectedNibble?.rowIndex === row.rowIndex
                    ? selectedNibble.nibbleIndex
                    : 0;
                focusNibble(row.rowIndex, nextNibbleIndex);
                applyNibbleSelection(event.currentTarget, row.rowIndex, nextNibbleIndex);
              }}
              onKeyDown={(event) => {
                const currentNibbleIndex = getSelectionNibbleIndex(event.currentTarget, row.rowIndex);

                if (/^[0-9a-fA-F]$/.test(event.key)) {
                  event.preventDefault();
                  commitHexDigit(row.rowIndex, currentNibbleIndex, event.key);
                  return;
                }

                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  const nextSelection = moveSelection(row.rowIndex, currentNibbleIndex, 'left');
                  inputRefs.current[nextSelection.rowIndex]?.focus();
                  focusNibble(nextSelection.rowIndex, nextSelection.nibbleIndex);
                  return;
                }

                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  const nextSelection = moveSelection(row.rowIndex, currentNibbleIndex, 'right');
                  inputRefs.current[nextSelection.rowIndex]?.focus();
                  focusNibble(nextSelection.rowIndex, nextSelection.nibbleIndex);
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  stepHexDigit(row.rowIndex, currentNibbleIndex, 1);
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  stepHexDigit(row.rowIndex, currentNibbleIndex, -1);
                  return;
                }

                if (event.key === 'Home') {
                  event.preventDefault();
                  focusNibble(row.rowIndex, 0);
                  return;
                }

                if (event.key === 'End') {
                  event.preventDefault();
                  focusNibble(row.rowIndex, row.segmentHex.length - 1);
                  return;
                }

                if (event.key === 'Backspace' || event.key === 'Delete') {
                  event.preventDefault();
                  commitHexDigit(row.rowIndex, currentNibbleIndex, '0');
                }
              }}
              onMouseUp={(event) => {
                const nextNibbleIndex = getSelectionNibbleIndex(event.currentTarget, row.rowIndex);
                focusNibble(row.rowIndex, nextNibbleIndex);
                applyNibbleSelection(event.currentTarget, row.rowIndex, nextNibbleIndex);
                mouseFocusRowRef.current = null;
              }}
              onSelect={(event) => {
                const nextNibbleIndex = getSelectionNibbleIndex(event.currentTarget, row.rowIndex);
                focusNibble(row.rowIndex, nextNibbleIndex);
                applyNibbleSelection(event.currentTarget, row.rowIndex, nextNibbleIndex);
              }}
            />
          ) : (
            <RegisterHexField
              ariaLabel={`${label} row ${row.rowIndex + 1} hex value`}
              className="register-segment-value"
              value={`0x${row.segmentHex}`}
              widthCh={row.segmentHex.length + 4}
            />
          )}

          {row.groups.map((group, groupIndex) => (
            <div className="register-bit-row-group" key={`${label}-row-${row.rowIndex}-group-${groupIndex}`}>
              {group.map((cell, cellIndex) => {
                if (cell.bitIndex !== null && editable && onToggleBit) {
                  return (
                    <button
                      aria-label={`${label} bit ${cell.bitIndex}`}
                      aria-pressed={cell.bit === '1'}
                      className={`register-bit-button ${cell.bit === '1' ? 'active' : ''}`}
                      key={`${label}-row-${row.rowIndex}-group-${groupIndex}-bit-${cellIndex}`}
                      onClick={() => onToggleBit(cell.bitIndex!)}
                      type="button"
                    >
                      {cell.bit}
                    </button>
                  );
                }

                return (
                  <span
                    aria-hidden="true"
                    className={`register-bit-button ${cell.bit === '1' ? 'active' : ''} ${
                      cell.interactive ? 'register-bit-button-readonly' : 'register-bit-button-placeholder'
                    }`}
                    key={`${label}-row-${row.rowIndex}-group-${groupIndex}-bit-${cellIndex}`}
                  >
                    {cell.bit}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default RegisterBitStrip;
