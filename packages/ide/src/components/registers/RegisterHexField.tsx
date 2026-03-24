import React from 'react';

type RegisterHexFieldProps = {
  ariaLabel: string;
  value: string;
  editable?: boolean;
  className?: string;
  widthCh?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  onMouseDown?: React.MouseEventHandler<HTMLInputElement>;
  onClick?: React.MouseEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onMouseUp?: React.MouseEventHandler<HTMLInputElement>;
  onSelect?: React.ReactEventHandler<HTMLInputElement>;
};

const RegisterHexField: React.FC<RegisterHexFieldProps> = ({
  ariaLabel,
  value,
  editable = false,
  className = '',
  widthCh,
  inputRef,
  onMouseDown,
  onClick,
  onFocus,
  onKeyDown,
  onMouseUp,
  onSelect,
}) => {
  const composedClassName = `${editable ? 'register-segment-input' : 'register-segment-value'} ${className}`.trim();

  if (editable) {
    return (
      <input
        aria-label={ariaLabel}
        className={composedClassName}
        inputMode="text"
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onSelect={onSelect}
        readOnly
        ref={inputRef}
        size={widthCh}
        spellCheck={false}
        type="text"
        value={value}
      />
    );
  }

  return (
    <code
      aria-label={ariaLabel}
      className={composedClassName}
      style={widthCh ? { width: `${widthCh}ch` } : undefined}
    >
      {value}
    </code>
  );
};

export default RegisterHexField;
