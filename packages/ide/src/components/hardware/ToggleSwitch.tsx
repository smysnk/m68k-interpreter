
export function ToggleSwitch({
  bit,
  enabled,
  onChange,
}: {
  bit: number;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      aria-checked={enabled}
      aria-label={`Toggle switch ${bit}`}
      className={`hardware-toggle ${enabled ? 'active' : ''}`}
      onClick={() => onChange(!enabled)}
      role="switch"
      type="button"
    >
      <span className="hardware-toggle-track">
        <span className="hardware-toggle-handle" />
      </span>
    </button>
  );
}
