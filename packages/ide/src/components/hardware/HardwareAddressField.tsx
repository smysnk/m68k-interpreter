import React from 'react';
import { parseDeviceAddress } from '@m68k/interpreter';

export type HardwareAddressCommitResult =
  | { ok: true }
  | { ok: false; message: string };

export function HardwareAddressField({
  compact = false,
  label,
  value,
  onCommit,
}: {
  compact?: boolean;
  label: string;
  value: number;
  onCommit: (value: number) => Promise<HardwareAddressCommitResult>;
}) {
  const formattedValue = value.toString(16).toUpperCase().padStart(8, '0');
  const [text, setText] = React.useState(formattedValue);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const pendingRef = React.useRef(false);
  const requestSequence = React.useRef(0);
  const committedValueRef = React.useRef(formattedValue);
  const errorId = React.useId();

  React.useEffect(() => {
    committedValueRef.current = formattedValue;
    if (pendingRef.current) {
      requestSequence.current += 1;
      pendingRef.current = false;
      setPending(false);
      setError(null);
    }
    setText(formattedValue);
  }, [formattedValue]);

  const commit = async () => {
    if (pendingRef.current) return;
    const parsed = parseDeviceAddress(text);
    if (parsed === undefined) {
      setError('Enter a hexadecimal address between $00000000 and $00FFFFFF.');
      return;
    }
    if (parsed === value) {
      setError(null);
      setText(formattedValue);
      return;
    }

    const sequence = ++requestSequence.current;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    let result: HardwareAddressCommitResult;
    try {
      result = await onCommit(parsed);
    } catch (commitError) {
      result = {
        ok: false,
        message: commitError instanceof Error ? commitError.message : String(commitError),
      };
    }
    if (sequence !== requestSequence.current) return;
    pendingRef.current = false;
    setPending(false);
    if (result.ok) {
      setText(parsed.toString(16).toUpperCase().padStart(8, '0'));
    } else {
      setText(committedValueRef.current);
      setError(result.message);
    }
  };

  return (
    <label className={`hardware-address-field ${compact ? 'hardware-address-field-compact' : ''}`}>
      <span>{label}</span>
      <div className="hardware-address-input-wrap">
        <span aria-hidden="true">$</span>
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-label={`${label} address`}
          aria-busy={pending}
          disabled={pending}
          inputMode="text"
          maxLength={8}
          onBlur={() => void commit()}
          onChange={(event) => {
            setError(null);
            setText(event.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              setError(null);
              setText(formattedValue);
              event.currentTarget.blur();
            }
          }}
          spellCheck={false}
          value={text}
        />
      </div>
      {error ? <span className="hardware-address-error" id={errorId}>{error}</span> : null}
    </label>
  );
}
