
export function LedIndicator({ bit, active }: { bit: number; active: boolean }) {
  return (
    <span
      aria-label={`LED ${bit} ${active ? 'on' : 'off'}`}
      className={`hardware-led ${active ? 'active' : ''}`}
      role="img"
    />
  );
}
