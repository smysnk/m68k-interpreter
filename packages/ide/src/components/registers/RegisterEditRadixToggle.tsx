import React from 'react';
import type { RegisterRadix } from './registerFormatting';

type RegisterEditRadixToggleProps = {
  value: RegisterRadix;
  onChange: (nextValue: RegisterRadix) => void;
};

const radixOptions: Array<{ value: RegisterRadix; label: string }> = [
  { value: 'hex', label: 'Hex' },
  { value: 'dec', label: 'Dec' },
  { value: 'bin', label: 'Bin' },
];

const RegisterEditRadixToggle: React.FC<RegisterEditRadixToggleProps> = ({ value, onChange }) => (
  <div aria-label="Register edit radix" className="registers-radix-toggle" role="group">
    {radixOptions.map((option) => (
      <button
        aria-pressed={value === option.value}
        className={`btn-toolbar registers-radix-button ${value === option.value ? 'active' : ''}`}
        key={option.value}
        onClick={() => onChange(option.value)}
        type="button"
      >
        {option.label}
      </button>
    ))}
  </div>
);

export default RegisterEditRadixToggle;
