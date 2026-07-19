import React from 'react';

export function MomentaryButton({
  bit,
  pressed,
  onPressedChange,
}: {
  bit: number;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  const handleKey = (nextPressed: boolean, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onPressedChange(nextPressed);
    }
  };

  return (
    <button
      aria-label={`Push button ${bit}`}
      aria-pressed={pressed}
      className={`hardware-push-button ${pressed ? 'active' : ''}`}
      onBlur={() => onPressedChange(false)}
      onKeyDown={(event) => handleKey(true, event)}
      onKeyUp={(event) => handleKey(false, event)}
      onPointerCancel={() => onPressedChange(false)}
      onPointerDown={() => onPressedChange(true)}
      onPointerLeave={() => onPressedChange(false)}
      onPointerUp={() => onPressedChange(false)}
      type="button"
    >
      <span />
    </button>
  );
}
