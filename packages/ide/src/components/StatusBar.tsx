import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { CpuProfile } from '@m68k/interpreter';
import { selectStatusBarModel } from '@/store/statusBarSelectors';
import { setCpuProfile, type AppDispatch, type RootState } from '@/store';
import { useCompactShell } from '@/hooks/useCompactShell';
import ContextMenu from '@/components/menus/ContextMenu';
import MenuItem from '@/components/menus/MenuItem';

const PERSONAL_WEBSITE_URL = 'https://smysnk.com';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/josh1g';

const CPU_PROFILE_OPTIONS: ReadonlyArray<{
  id: CpuProfile;
  label: string;
  subtitle: string;
}> = [
  {
    id: 'm68000',
    label: 'MC68000',
    subtitle: 'Strict Motorola 68000 behavior',
  },
  {
    id: 'm68010',
    label: 'MC68010 Extensions',
    subtitle: 'MC68000 with supported 68010 additions',
  },
  {
    id: 'easy68k',
    label: 'Easy68K',
    subtitle: 'Terminal, trainer-board, and trap compatibility',
  },
];

function getCpuProfileLabel(profile: CpuProfile): string {
  return CPU_PROFILE_OPTIONS.find((option) => option.id === profile)?.label ?? 'Easy68K';
}

const StatusBar: React.FC = () => {
  const model = useSelector((state: RootState) => selectStatusBarModel(state));
  const cpuProfile = useSelector((state: RootState) => state.settings.cpuProfile);
  const dispatch = useDispatch<AppDispatch>();
  const isCompactShell = useCompactShell();
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const modeButtonRef = React.useRef<HTMLButtonElement>(null);
  const modeMenuRef = React.useRef<HTMLDivElement>(null);

  const closeModeMenu = React.useCallback(() => setModeMenuOpen(false), []);

  const selectCpuProfile = React.useCallback(
    (nextProfile: CpuProfile): void => {
      if (nextProfile === cpuProfile) {
        closeModeMenu();
        modeButtonRef.current?.focus();
        return;
      }

      if (
        model.runtime.label === 'Running' &&
        !window.confirm(
          'Changing emulation mode will stop and reset the current program. Continue?'
        )
      ) {
        return;
      }

      dispatch(setCpuProfile(nextProfile));
      closeModeMenu();
      modeButtonRef.current?.focus();
    },
    [closeModeMenu, cpuProfile, dispatch, model.runtime.label]
  );

  const modeControl = (
    <>
      <button
        aria-controls="status-bar-mode-menu"
        aria-expanded={modeMenuOpen}
        aria-haspopup="menu"
        aria-label={`Emulation mode: ${getCpuProfileLabel(cpuProfile)}`}
        className="status-mode-control"
        onClick={() => setModeMenuOpen((open) => !open)}
        ref={modeButtonRef}
        type="button"
      >
        <span className="status-mode-label">Mode</span>
        <span>{getCpuProfileLabel(cpuProfile)}</span>
        <span aria-hidden="true" className="status-mode-chevron">
          {modeMenuOpen ? '\u25b4' : '\u25be'}
        </span>
      </button>
      <ContextMenu
        anchor={modeButtonRef.current ? { kind: 'element', element: modeButtonRef.current } : null}
        className="navbar-menu"
        id="status-bar-mode-menu"
        label="Select emulation mode"
        menuRef={modeMenuRef}
        onDismiss={closeModeMenu}
        open={modeMenuOpen}
        placement="block"
        relatedRefs={[modeButtonRef]}
        restoreFocusTo={modeButtonRef.current}
        testId="status-bar-mode-menu"
        width={290}
      >
        {CPU_PROFILE_OPTIONS.map((option) => (
          <MenuItem
            aria-checked={cpuProfile === option.id}
            aria-label={option.label}
            key={option.id}
            label={option.label}
            meta={cpuProfile === option.id ? '\u2713' : undefined}
            onClick={() => selectCpuProfile(option.id)}
            role="menuitemradio"
            subtitle={option.subtitle}
          />
        ))}
      </ContextMenu>
    </>
  );

  const websiteLink = (
    <a
      className="status-bar-link status-bar-link-website"
      href={PERSONAL_WEBSITE_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      smysnk.com
    </a>
  );

  const coffeeLink = (
    <a
      className="status-bar-link status-bar-link-coffee"
      href={BUY_ME_A_COFFEE_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      Buy me a coffee
    </a>
  );

  return (
    <footer
      className="status-bar"
      aria-label="IDE status bar"
      data-compact={isCompactShell ? 'true' : 'false'}
    >
      {isCompactShell ? (
        <div className="status-bar-inline" data-testid="status-bar-inline">
          <span className={`status-pill status-pill-${model.runtime.tone}`}>
            {model.runtime.label}
          </span>
          {modeControl}
          {websiteLink}
          {coffeeLink}
        </div>
      ) : (
        <>
          <div className="status-bar-section status-bar-section-left">
            <span className={`status-pill status-pill-${model.runtime.tone}`}>
              {model.runtime.label}
            </span>
            {modeControl}
          </div>
          <div className="status-bar-section status-bar-section-center" />
          <div className="status-bar-section status-bar-section-right">
            {websiteLink}
            {coffeeLink}
          </div>
        </>
      )}
    </footer>
  );
};

export default StatusBar;
