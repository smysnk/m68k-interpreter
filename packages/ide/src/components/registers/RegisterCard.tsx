import React from 'react';
import type { RegisterDescriptor } from './registerDescriptors';
import {
  formatRegisterHex,
  formatRegisterDecimal,
  parseRegisterInput,
  stepRegisterHexDigit,
  toggleRegisterBit,
  updateRegisterHexDigit,
} from './registerFormatting';
import RegisterBitStrip from './RegisterBitStrip';
import RegisterHexField from './RegisterHexField';

type RegisterCardProps = {
  descriptor: RegisterDescriptor;
  value: number;
  onCommit: (descriptor: RegisterDescriptor, value: number) => void;
  defaultCompact?: boolean;
};

const RegisterCard: React.FC<RegisterCardProps> = ({
  descriptor,
  value,
  onCommit,
  defaultCompact = false,
}) => {
  const formattedDecimalValue = React.useMemo(
    () => formatRegisterDecimal(value, descriptor.bitWidth, descriptor.decimalMode),
    [descriptor.bitWidth, descriptor.decimalMode, value]
  );
  const formattedFullHexValue = React.useMemo(
    () => formatRegisterHex(value, 32),
    [value]
  );
  const [decimalDraft, setDecimalDraft] = React.useState(formattedDecimalValue);
  const [isCompact, setIsCompact] = React.useState(defaultCompact);
  const fullHexInputRef = React.useRef<HTMLInputElement | null>(null);
  const fullHexMouseFocusRef = React.useRef(false);
  const [selectedFullHexNibble, setSelectedFullHexNibble] = React.useState<number | null>(null);

  React.useEffect(() => {
    setDecimalDraft(formattedDecimalValue);
  }, [formattedDecimalValue]);

  const applyFullHexSelection = React.useCallback(
    (input: HTMLInputElement, nibbleIndex: number) => {
      const hexDigits = formattedFullHexValue.slice(2);
      const clampedNibbleIndex = Math.max(0, Math.min(nibbleIndex, hexDigits.length - 1));
      const selectionStart = 2 + clampedNibbleIndex;
      input.setSelectionRange(selectionStart, selectionStart + 1);
    },
    [formattedFullHexValue]
  );

  React.useLayoutEffect(() => {
    if (selectedFullHexNibble === null) {
      return;
    }

    const input = fullHexInputRef.current;
    if (!input) {
      return;
    }

    if (document.activeElement !== input) {
      input.focus();
    }

    applyFullHexSelection(input, selectedFullHexNibble);
  }, [applyFullHexSelection, selectedFullHexNibble]);

  const commitDecimal = React.useCallback(() => {
    if (!descriptor.editable) {
      setDecimalDraft(formattedDecimalValue);
      return;
    }

    const parsedValue = parseRegisterInput(decimalDraft, descriptor.bitWidth, 'dec');
    if (parsedValue === null) {
      setDecimalDraft(formattedDecimalValue);
      return;
    }

    onCommit(descriptor, parsedValue);
  }, [decimalDraft, descriptor, formattedDecimalValue, onCommit]);

  const handleToggleBit = React.useCallback(
    (bitIndex: number) => {
      if (!descriptor.editable) {
        return;
      }

      onCommit(descriptor, toggleRegisterBit(value, descriptor.bitWidth, bitIndex));
    },
    [descriptor, onCommit, value]
  );

  const getFullHexNibbleIndex = React.useCallback((input: HTMLInputElement) => {
    const hexDigits = formattedFullHexValue.slice(2);
    const start = input.selectionStart ?? 2;
    return Math.max(0, Math.min(start - 2, hexDigits.length - 1));
  }, [formattedFullHexValue]);

  const commitFullHexDigit = React.useCallback((nibbleIndex: number, digit: string) => {
    if (!descriptor.editable) {
      return;
    }

    const currentHexDigits = formattedFullHexValue.slice(2);
    const nextHexDigits = updateRegisterHexDigit(currentHexDigits, nibbleIndex, digit);
    const nextValue = Number.parseInt(nextHexDigits, 16);
    const nextNibbleIndex = Math.min(nibbleIndex + 1, currentHexDigits.length - 1);

    setSelectedFullHexNibble(nextNibbleIndex);
    onCommit(descriptor, nextValue);
  }, [descriptor, formattedFullHexValue, onCommit]);

  const stepFullHexDigit = React.useCallback((nibbleIndex: number, delta: 1 | -1) => {
    if (!descriptor.editable) {
      return;
    }

    const currentHexDigits = formattedFullHexValue.slice(2);
    const nextHexDigits = stepRegisterHexDigit(currentHexDigits, nibbleIndex, delta);
    const nextValue = Number.parseInt(nextHexDigits, 16);

    setSelectedFullHexNibble(nibbleIndex);
    onCommit(descriptor, nextValue);
  }, [descriptor, formattedFullHexValue, onCommit]);

  return (
    <div
      className={`register-card ${descriptor.editable ? '' : 'readonly'} ${isCompact ? 'compact' : 'expanded'}`.trim()}
      data-register-group={descriptor.groupId}
    >
      <div className="register-card-shell">
        <div className="register-card-identity">
          <button
            aria-expanded={!isCompact}
            aria-label={`Toggle ${descriptor.label} register view`}
            className="register-card-toggle"
            data-register-group={descriptor.groupId}
            onClick={() => setIsCompact((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className="register-card-toggle-indicator" />
            <span className="register-card-toggle-label">{descriptor.label}</span>
          </button>
          <span className="register-card-meta-badge">{descriptor.editable ? 'RW' : 'RO'}</span>
        </div>

        <div className="register-card-controls">
          <div className={`register-card-summary-row ${isCompact ? 'compact' : ''}`.trim()}>
            <RegisterHexField
              ariaLabel={`${descriptor.label} full hex value`}
              className="register-segment-value register-card-field-value-hex"
              editable={descriptor.editable}
              inputRef={fullHexInputRef}
              value={formattedFullHexValue}
              widthCh={formattedFullHexValue.length}
              onMouseDown={() => {
                fullHexMouseFocusRef.current = true;
              }}
              onClick={(event) => {
                const nextNibbleIndex = getFullHexNibbleIndex(event.currentTarget);
                setSelectedFullHexNibble(nextNibbleIndex);
                applyFullHexSelection(event.currentTarget, nextNibbleIndex);
              }}
              onFocus={(event) => {
                if (fullHexMouseFocusRef.current) {
                  return;
                }

                const nextNibbleIndex = selectedFullHexNibble ?? 0;
                setSelectedFullHexNibble(nextNibbleIndex);
                applyFullHexSelection(event.currentTarget, nextNibbleIndex);
              }}
              onKeyDown={(event) => {
                const currentNibbleIndex = getFullHexNibbleIndex(event.currentTarget);

                if (/^[0-9a-fA-F]$/.test(event.key)) {
                  event.preventDefault();
                  commitFullHexDigit(currentNibbleIndex, event.key);
                  return;
                }

                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  setSelectedFullHexNibble(Math.max(0, currentNibbleIndex - 1));
                  return;
                }

                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  setSelectedFullHexNibble(Math.min(formattedFullHexValue.length - 3, currentNibbleIndex + 1));
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  stepFullHexDigit(currentNibbleIndex, 1);
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  stepFullHexDigit(currentNibbleIndex, -1);
                  return;
                }

                if (event.key === 'Home') {
                  event.preventDefault();
                  setSelectedFullHexNibble(0);
                  return;
                }

                if (event.key === 'End') {
                  event.preventDefault();
                  setSelectedFullHexNibble(formattedFullHexValue.length - 3);
                  return;
                }

                if (event.key === 'Backspace' || event.key === 'Delete') {
                  event.preventDefault();
                  commitFullHexDigit(currentNibbleIndex, '0');
                }
              }}
              onMouseUp={(event) => {
                const nextNibbleIndex = getFullHexNibbleIndex(event.currentTarget);
                setSelectedFullHexNibble(nextNibbleIndex);
                applyFullHexSelection(event.currentTarget, nextNibbleIndex);
                fullHexMouseFocusRef.current = false;
              }}
              onSelect={(event) => {
                const nextNibbleIndex = getFullHexNibbleIndex(event.currentTarget);
                setSelectedFullHexNibble(nextNibbleIndex);
                applyFullHexSelection(event.currentTarget, nextNibbleIndex);
              }}
            />
            <label className="register-card-decimal-field">
              {!isCompact ? <span className="register-card-field-label">Dec</span> : null}
              {descriptor.editable ? (
                <input
                  aria-label={`${descriptor.label} dec input`}
                  className="register-card-field-input"
                  onBlur={commitDecimal}
                  onChange={(event) => setDecimalDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitDecimal();
                      return;
                    }

                    if (event.key === 'Escape') {
                      setDecimalDraft(formattedDecimalValue);
                    }
                  }}
                  spellCheck={false}
                  type="text"
                  value={decimalDraft}
                />
              ) : (
                <code
                  aria-label={`${descriptor.label} dec value`}
                  className="register-card-field-value"
                >
                  {formattedDecimalValue}
                </code>
              )}
            </label>
          </div>

          {!isCompact ? (
            <RegisterBitStrip
              bitWidth={descriptor.bitWidth}
              editable={descriptor.editable}
              label={descriptor.label}
              onCommitValue={(nextValue) => onCommit(descriptor, nextValue)}
              onToggleBit={handleToggleBit}
              value={value}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default React.memo(RegisterCard);
