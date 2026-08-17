import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CPU_MODEL_REGISTRY,
  MACHINE_PROFILE_REGISTRY,
  type CpuModel,
  type MachineProfile,
} from '@m68k/interpreter';
import { selectStatusBarModel } from '@/store/statusBarSelectors';
import { setCpuModel, setMachineProfile, type AppDispatch, type RootState } from '@/store';
import { useCompactShell } from '@/hooks/useCompactShell';
import ContextMenu from '@/components/menus/ContextMenu';
import MenuItem from '@/components/menus/MenuItem';

const PERSONAL_WEBSITE_URL = 'https://smysnk.com';
const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/josh1g';

const CPU_MODEL_OPTIONS = Object.values(CPU_MODEL_REGISTRY);
const MACHINE_PROFILE_OPTIONS = Object.values(MACHINE_PROFILE_REGISTRY);

const StatusBar: React.FC = () => {
  const model = useSelector((state: RootState) => selectStatusBarModel(state));
  const cpuModel = useSelector((state: RootState) => state.settings.cpuModel);
  const machineProfile = useSelector((state: RootState) => state.settings.machineProfile);
  const dispatch = useDispatch<AppDispatch>();
  const isCompactShell = useCompactShell();
  const showAboutLink = import.meta.env.BASE_URL !== '/';
  const [modeMenuOpen, setModeMenuOpen] = React.useState(false);
  const modeButtonRef = React.useRef<HTMLButtonElement>(null);
  const modeMenuRef = React.useRef<HTMLDivElement>(null);

  const closeModeMenu = React.useCallback(() => setModeMenuOpen(false), []);

  const confirmAndSelect = React.useCallback(
    (axis: 'cpu' | 'machine', value: CpuModel | MachineProfile): void => {
      if ((axis === 'cpu' ? cpuModel : machineProfile) === value) {
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

      if (axis === 'cpu') dispatch(setCpuModel(value as CpuModel));
      else dispatch(setMachineProfile(value as MachineProfile));
      closeModeMenu();
      modeButtonRef.current?.focus();
    },
    [closeModeMenu, cpuModel, dispatch, machineProfile, model.runtime.label]
  );

  const modeLabel = `${CPU_MODEL_REGISTRY[cpuModel].label} · ${MACHINE_PROFILE_REGISTRY[machineProfile].label}`;

  const modeControl = (
    <>
      <button
        aria-controls="status-bar-mode-menu"
        aria-expanded={modeMenuOpen}
        aria-haspopup="menu"
        aria-label={`Emulation mode: ${modeLabel}`}
        className="status-mode-control"
        onClick={() => setModeMenuOpen((open) => !open)}
        ref={modeButtonRef}
        type="button"
      >
        <span className="status-mode-label">Mode</span>
        <span>{modeLabel}</span>
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
        <div className="status-mode-menu-group-label" role="presentation">CPU</div>
        {CPU_MODEL_OPTIONS.map((option) => (
          <MenuItem
            aria-checked={cpuModel === option.id}
            aria-label={option.label}
            key={option.id}
            label={option.label}
            meta={cpuModel === option.id ? '\u2713' : undefined}
            onClick={() => confirmAndSelect('cpu', option.id)}
            role="menuitemradio"
            subtitle={option.description}
          />
        ))}
        <div className="status-mode-menu-group-label" role="presentation">Machine</div>
        {MACHINE_PROFILE_OPTIONS.map((option) => (
          <MenuItem
            aria-checked={machineProfile === option.id}
            aria-label={option.label}
            key={option.id}
            label={option.label}
            meta={machineProfile === option.id ? '\u2713' : undefined}
            onClick={() => confirmAndSelect('machine', option.id)}
            role="menuitemradio"
            subtitle={option.description}
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

  const aboutLink = (
    <a className="status-bar-link status-bar-link-about" href="#about-this-build">
      About this IDE
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
          {showAboutLink ? aboutLink : null}
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
            {showAboutLink ? aboutLink : null}
            {websiteLink}
            {coffeeLink}
          </div>
        </>
      )}
    </footer>
  );
};

export default StatusBar;
