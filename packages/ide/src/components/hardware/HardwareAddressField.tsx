import React from 'react';
import { parseDeviceAddress } from '@m68k/interpreter';

export function HardwareAddressField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const formattedValue = value.toString(16).toUpperCase().padStart(8, '0');
  const [text, setText] = React.useState(formattedValue);
  const [invalid, setInvalid] = React.useState(false);

  React.useEffect(() => setText(formattedValue), [formattedValue]);

  const commit = () => {
    const parsed = parseDeviceAddress(text);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(parsed.toString(16).toUpperCase().padStart(8, '0'));
    onCommit(parsed);
  };

  return (
    <label className="hardware-address-field">
      <span>{label}</span>
      <div className="hardware-address-input-wrap">
        <span aria-hidden="true">$</span>
        <input
          aria-invalid={invalid}
          aria-label={`${label} address`}
          inputMode="text"
          maxLength={8}
          onBlur={commit}
          onChange={(event) => setText(event.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit();
              event.currentTarget.blur();
            }
          }}
          spellCheck={false}
          value={text}
        />
      </div>
    </label>
  );
}
