import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars,
  faBug,
  faCheck,
  faGaugeHigh,
  faMoon,
  faPlay,
  faRedo,
  faStop,
  faSun,
} from '@fortawesome/free-solid-svg-icons';
import {
  closeAppMenu,
  setLineNumbers,
  setSpeedMultiplier,
  toggleEditorTheme,
  revealPanelKind,
  toggleAppMenu,
  getWorkspacePaneDescriptors,
  selectExecutionToolbarModel,
  type AppDispatch,
  type RootState,
} from '@/store';
import { selectNavbarMenuState, selectNavbarPresentationModel } from '@/store/navbarSelectors';
import { useCompactShell } from '@/hooks/useCompactShell';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import NavbarViewMenu from './NavbarViewMenu';
import { executionCoordinator } from '@/runtime/executionCoordinator';
import { installExecutionKeyboardShortcuts } from '@/runtime/executionKeyboardCommands';

interface NavbarProps {
  fileExplorerOpen: boolean;
  onToggleFileExplorer: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ fileExplorerOpen, onToggleFileExplorer }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { menuOpen } = useSelector((state: RootState) => selectNavbarMenuState(state));
  const { activeWorkspaceTab, editorTheme, lineNumbers, speedMultiplier } = useSelector(
    (state: RootState) => selectNavbarPresentationModel(state)
  );
  const executionToolbar = useSelector(selectExecutionToolbarModel);
  const isCompactShell = useCompactShell();
  const isFocusedMobileTerminal = isCompactShell && activeWorkspaceTab === 'terminal';
  const showRuntimeControls = !isCompactShell || activeWorkspaceTab !== 'terminal';
  const workspaceTabs = getWorkspacePaneDescriptors(isCompactShell).map((pane) => ({
    id: pane.id,
    controls: `workspace-tabpanel-${pane.id}`,
    label: isCompactShell ? pane.compactLabel : pane.label,
    ariaLabel: pane.label,
  }));
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    maxWidth: 280,
    submenuDirection: 'left' as 'left' | 'right',
  });
  useEffect(() => {
    return installExecutionKeyboardShortcuts();
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const updateMenuPosition = (): void => {
      const rect = menuButtonRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, rect.left),
        maxWidth: Math.max(220, window.innerWidth - Math.max(12, rect.left) - 12),
        submenuDirection: rect.left + 280 + 280 + 24 <= window.innerWidth ? 'right' : 'left',
      });
    };

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !menuLayerRef.current?.contains(target)) {
        dispatch(closeAppMenu());
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        dispatch(closeAppMenu());
      }
    };

    updateMenuPosition();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [dispatch, menuOpen]);

  useEffect(() => {
    if (isFocusedMobileTerminal && menuOpen) {
      dispatch(closeAppMenu());
    }
  }, [dispatch, isFocusedMobileTerminal, menuOpen]);

  const closeMenu = (): void => {
    dispatch(closeAppMenu());
  };

  const handleToggleTheme = (): void => {
    dispatch(toggleEditorTheme());
  };

  const darkThemeActive = editorTheme === EditorThemeEnum.M68K_DARK;

  const handleToggleLineNumbers = (): void => {
    dispatch(setLineNumbers(!lineNumbers));
    closeMenu();
  };

  const handleToggleMenu = (): void => {
    dispatch(toggleAppMenu());
  };

  const handleWorkspaceSelection = (tab: (typeof workspaceTabs)[number]['id']): void => {
    dispatch(revealPanelKind(tab === 'hardware' ? 'hardware-display' : tab));
  };

  return (
    <nav
      className="navbar"
      data-mobile-navbar-mode={isFocusedMobileTerminal ? 'terminal-only' : 'standard'}
    >
      <div className="navbar-left">
        {!isFocusedMobileTerminal ? (
          <button
            aria-controls="file-explorer-sidebar"
            aria-expanded={fileExplorerOpen}
            aria-label={fileExplorerOpen ? 'Close file explorer' : 'Open file explorer'}
            className="navbar-accent-mark"
            data-testid="navbar-accent-mark"
            onClick={onToggleFileExplorer}
            title={fileExplorerOpen ? 'Close file explorer' : 'Open file explorer'}
            type="button"
          >
            68
          </button>
        ) : null}
        {!isFocusedMobileTerminal ? (
          <div className="navbar-menu-wrap" ref={menuRef}>
            <button
              aria-controls="navbar-app-menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Open app menu"
              className={`btn-toolbar navbar-menu-button ${menuOpen ? 'active' : ''}`}
              data-testid="navbar-app-menu-button"
              onClick={handleToggleMenu}
              ref={menuButtonRef}
              type="button"
            >
              <FontAwesomeIcon icon={faBars} size="sm" />
              <span>Menu</span>
            </button>
          </div>
        ) : null}
        {isCompactShell ? (
          <div className="navbar-menubar">
            <div className="navbar-view-toggle" role="tablist" aria-label="Workspace views">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  aria-controls={tab.controls}
                  aria-label={tab.ariaLabel}
                  aria-selected={activeWorkspaceTab === tab.id}
                  className={`navbar-view-tab ${activeWorkspaceTab === tab.id ? 'active' : ''}`}
                  id={`workspace-tab-${tab.id}`}
                  onClick={() => handleWorkspaceSelection(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="navbar-right" data-runtime-visible={showRuntimeControls ? 'true' : 'false'}>
        {showRuntimeControls ? (
          <div className="navbar-runtime-controls" data-runtime-state={executionToolbar.phase}>
            <div
              aria-label="Execution controls"
              className="navbar-execution-buttons"
              role="group"
            >
              <button
                aria-busy={executionToolbar.controls.run.busy || undefined}
                aria-label={executionToolbar.controls.run.label}
                className={`btn-toolbar btn-toolbar-icon navbar-execution-button ${
                  executionToolbar.controls.run.current ? 'is-current' : ''
                } ${executionToolbar.controls.run.busy ? 'is-busy' : ''}`}
                data-current-state={executionToolbar.controls.run.current ? 'true' : 'false'}
                disabled={
                  !executionToolbar.controls.run.enabled || executionToolbar.phase === 'paused'
                }
                onClick={() => executionCoordinator.execute(executionToolbar.controls.run.command)}
                title={executionToolbar.controls.run.title}
                type="button"
              >
                <FontAwesomeIcon icon={faPlay} size="sm" />
              </button>
              <button
                aria-busy={executionToolbar.controls.debug.busy || undefined}
                aria-label={executionToolbar.controls.debug.label}
                className={`btn-toolbar btn-toolbar-icon navbar-execution-button ${
                  executionToolbar.controls.debug.current ? 'is-current' : ''
                } ${executionToolbar.controls.debug.busy ? 'is-busy' : ''}`}
                data-current-state={executionToolbar.controls.debug.current ? 'true' : 'false'}
                disabled={!executionToolbar.controls.debug.enabled}
                onClick={() =>
                  executionCoordinator.execute(executionToolbar.controls.debug.command)
                }
                title={executionToolbar.controls.debug.title}
                type="button"
              >
                <FontAwesomeIcon icon={faBug} size="sm" />
              </button>
              <button
                aria-busy={executionToolbar.controls.stop.busy || undefined}
                aria-label={executionToolbar.controls.stop.label}
                className={`btn-toolbar btn-toolbar-icon navbar-execution-button ${
                  executionToolbar.controls.stop.current ? 'is-current' : ''
                } ${executionToolbar.controls.stop.busy ? 'is-busy' : ''}`}
                data-current-state={executionToolbar.controls.stop.current ? 'true' : 'false'}
                disabled={!executionToolbar.controls.stop.enabled}
                onClick={() => executionCoordinator.execute(executionToolbar.controls.stop.command)}
                title={executionToolbar.controls.stop.title}
                type="button"
              >
                <FontAwesomeIcon icon={faStop} size="sm" />
              </button>
              <button
                aria-busy={executionToolbar.controls.restart.busy || undefined}
                aria-label={executionToolbar.controls.restart.label}
                className={`btn-toolbar btn-toolbar-icon navbar-execution-button ${
                  executionToolbar.controls.restart.current ? 'is-current' : ''
                } ${executionToolbar.controls.restart.busy ? 'is-busy' : ''}`}
                data-current-state={executionToolbar.controls.restart.current ? 'true' : 'false'}
                disabled={!executionToolbar.controls.restart.enabled}
                onClick={() =>
                  executionCoordinator.execute(executionToolbar.controls.restart.command)
                }
                title={executionToolbar.controls.restart.title}
                type="button"
              >
                <FontAwesomeIcon icon={faRedo} size="sm" />
              </button>
            </div>

            <label className="navbar-runtime-field" htmlFor="navbar-speed-input">
              <span className="navbar-runtime-field-label">Speed</span>
              <div className="navbar-runtime-input-wrap">
                <FontAwesomeIcon aria-hidden="true" icon={faGaugeHigh} size="sm" />
                <input
                  id="navbar-speed-input"
                  aria-label="Speed (x)"
                  className="navbar-runtime-input"
                  max="8"
                  min="0.25"
                  onChange={(event) =>
                    dispatch(
                      setSpeedMultiplier(Math.max(0.25, Number.parseFloat(event.target.value) || 1))
                    )
                  }
                  step="0.25"
                  title="Multiplier for per-frame execution budget"
                  type="number"
                  value={speedMultiplier}
                />
              </div>
            </label>
          </div>
        ) : null}
        {!isFocusedMobileTerminal ? (
          <button
            aria-label={darkThemeActive ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={darkThemeActive}
            className="btn-toolbar btn-toolbar-icon navbar-theme-toggle"
            data-testid="navbar-theme-toggle"
            onClick={handleToggleTheme}
            title={darkThemeActive ? 'Switch to light mode' : 'Switch to dark mode'}
            type="button"
          >
            <FontAwesomeIcon icon={darkThemeActive ? faMoon : faSun} size="sm" />
          </button>
        ) : null}
      </div>
      {menuOpen
        ? createPortal(
            <div
              className="navbar-menu"
              data-testid="navbar-app-menu"
              id="navbar-app-menu"
              ref={menuLayerRef}
              role="menu"
              aria-label="App menu"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                maxWidth: `${menuPosition.maxWidth}px`,
              }}
            >
              <NavbarViewMenu embedded onSelect={closeMenu} />

              <button
                className={`navbar-menu-item ${lineNumbers ? 'active' : ''}`}
                onClick={handleToggleLineNumbers}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Line Numbers</span>
                  <span className="navbar-menu-subtitle">Toggle the editor gutter markers</span>
                </span>
                <span className="navbar-menu-meta">
                  {lineNumbers ? <FontAwesomeIcon icon={faCheck} size="sm" /> : null}
                </span>
              </button>
            </div>,
            document.body
          )
        : null}
    </nav>
  );
};

export default Navbar;
