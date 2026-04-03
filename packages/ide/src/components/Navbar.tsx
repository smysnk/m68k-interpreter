import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars,
  faCheck,
  faChevronRight,
  faDesktop,
  faGaugeHigh,
  faMoon,
  faPlay,
  faRedo,
  faStop,
  faSun,
  faUndo,
} from '@fortawesome/free-solid-svg-icons';
import {
  closeAppMenu,
  requestFocusTerminal,
  requestReset,
  requestRun,
  requestStep,
  requestUndo,
  setEditorTheme,
  setFollowSystemTheme,
  setLineNumbers,
  setTerminalInputMode,
  setSpeedMultiplier,
  setActiveSubmenu,
  setWorkspaceTab,
  toggleAppMenu,
  type AppDispatch,
  type RootState,
} from '@/store';
import type { WorkspaceTab } from '@/store/uiShellSlice';
import {
  selectNavbarMenuState,
  selectNavbarPresentationModel,
  selectNavbarThemeLabel,
} from '@/store/navbarSelectors';
import { useCompactShell } from '@/hooks/useCompactShell';
import { EditorThemeEnum, type EditorThemeId } from '@/theme/editorThemeRegistry';

const Navbar: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { menuOpen, activeSubmenu } = useSelector((state: RootState) =>
    selectNavbarMenuState(state)
  );
  const themeLabel = useSelector((state: RootState) => selectNavbarThemeLabel(state));
  const {
    activeWorkspaceTab,
    darkThemeActive,
    followSystemActive,
    lightThemeActive,
    lineNumbers,
    speedMultiplier,
    terminalInputMode,
  } = useSelector((state: RootState) => selectNavbarPresentationModel(state));
  const isCompactShell = useCompactShell();
  const isFocusedMobileTerminal = isCompactShell && activeWorkspaceTab === 'terminal';
  const showRuntimeControls = !isCompactShell || activeWorkspaceTab !== 'terminal';
  const workspaceTabs: Array<{
    id: WorkspaceTab;
    controls: string;
    label: string;
    ariaLabel: string;
  }> = [
    {
      id: 'terminal' as WorkspaceTab,
      controls: 'workspace-tabpanel-terminal',
      label: isCompactShell ? 'Term' : 'Terminal',
      ariaLabel: 'Terminal',
    },
    {
      id: 'code' as WorkspaceTab,
      controls: 'workspace-tabpanel-code',
      label: 'Code',
      ariaLabel: 'Code',
    },
    ...(isCompactShell
      ? [
          {
            id: 'registers' as WorkspaceTab,
            controls: 'workspace-tabpanel-registers',
            label: 'Regs',
            ariaLabel: 'Registers',
          },
          {
            id: 'memory' as WorkspaceTab,
            controls: 'workspace-tabpanel-memory',
            label: 'Mem',
            ariaLabel: 'Memory',
          },
        ]
      : []),
  ];
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

  const terminalInputModeLabel =
    terminalInputMode === 'auto'
      ? 'Auto'
      : terminalInputMode === 'touch-only'
        ? 'Touch Only'
        : 'Text Input';

  const handleThemeSelection = (nextTheme: 'system' | EditorThemeId): void => {
    if (nextTheme === 'system') {
      dispatch(setFollowSystemTheme(true));
    } else {
      dispatch(setEditorTheme(nextTheme));
    }

    closeMenu();
  };

  const handleToggleLineNumbers = (): void => {
    dispatch(setLineNumbers(!lineNumbers));
    closeMenu();
  };

  const handleTerminalInputModeSelection = (
    nextMode: 'auto' | 'text-input' | 'touch-only'
  ): void => {
    dispatch(setTerminalInputMode(nextMode));
    closeMenu();
  };

  const handleToggleMenu = (): void => {
    dispatch(toggleAppMenu());
  };

  const handleRun = (): void => {
    dispatch(requestRun());
    dispatch(requestFocusTerminal());
  };

  const handleStep = (): void => {
    dispatch(requestStep());
    dispatch(requestFocusTerminal());
  };

  const handleUndo = (): void => {
    dispatch(requestUndo());
  };

  const handleReset = (): void => {
    dispatch(requestReset());
  };

  return (
    <nav
      className="navbar"
      data-mobile-navbar-mode={isFocusedMobileTerminal ? 'terminal-only' : 'standard'}
    >
      <div className="navbar-left">
        {!isCompactShell ? (
          <div aria-hidden="true" className="navbar-accent-mark" data-testid="navbar-accent-mark">
            68
          </div>
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
                onClick={() => dispatch(setWorkspaceTab(tab.id))}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="navbar-right" data-runtime-visible={showRuntimeControls ? 'true' : 'false'}>
        {showRuntimeControls ? (
          <div className="navbar-runtime-controls" aria-label="Execution controls">
            <div className="navbar-execution-buttons">
              <button
                aria-label="Run program"
                className="btn-toolbar btn-toolbar-icon btn-toolbar-accent"
                onClick={handleRun}
                title="Run program"
                type="button"
              >
                <FontAwesomeIcon icon={faPlay} size="sm" />
              </button>
              <button
                aria-label="Reset"
                className="btn-toolbar btn-toolbar-icon"
                onClick={handleReset}
                title="Reset"
                type="button"
              >
                <FontAwesomeIcon icon={faStop} size="sm" />
              </button>
              <button
                aria-label="Step"
                className="btn-toolbar btn-toolbar-icon"
                onClick={handleStep}
                title="Step"
                type="button"
              >
                <FontAwesomeIcon icon={faRedo} size="sm" />
              </button>
              <button
                aria-label="Undo"
                className="btn-toolbar btn-toolbar-icon"
                onClick={handleUndo}
                title="Undo"
                type="button"
              >
                <FontAwesomeIcon icon={faUndo} size="sm" />
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
              <button
                aria-expanded={activeSubmenu === 'style'}
                aria-haspopup="menu"
                className={`navbar-menu-item ${activeSubmenu === 'style' ? 'active' : ''}`}
                onClick={() => dispatch(setActiveSubmenu('style'))}
                onFocus={() => dispatch(setActiveSubmenu('style'))}
                onMouseEnter={() => dispatch(setActiveSubmenu('style'))}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Style</span>
                  <span className="navbar-menu-subtitle">{themeLabel} theme and surface mode</span>
                </span>
                <span className="navbar-menu-meta">
                  <FontAwesomeIcon icon={faChevronRight} size="sm" />
                </span>
              </button>

              <button
                aria-expanded={activeSubmenu === 'terminal-input'}
                aria-haspopup="menu"
                className={`navbar-menu-item ${activeSubmenu === 'terminal-input' ? 'active' : ''}`}
                onClick={() => dispatch(setActiveSubmenu('terminal-input'))}
                onFocus={() => dispatch(setActiveSubmenu('terminal-input'))}
                onMouseEnter={() => dispatch(setActiveSubmenu('terminal-input'))}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Terminal Input</span>
                  <span className="navbar-menu-subtitle">
                    {terminalInputModeLabel} keyboard and touch behavior
                  </span>
                </span>
                <span className="navbar-menu-meta">
                  <FontAwesomeIcon icon={faChevronRight} size="sm" />
                </span>
              </button>

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

              {activeSubmenu === 'style' ? (
                <div
                  className={`navbar-submenu navbar-submenu-${menuPosition.submenuDirection}`}
                  data-testid="navbar-style-submenu"
                  role="menu"
                  aria-label="Style options"
                >
                  <button
                    className={`navbar-menu-item ${followSystemActive ? 'active' : ''}`}
                    onClick={() => handleThemeSelection('system')}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">Follow System</span>
                      <span className="navbar-menu-subtitle">Match the OS light and dark mode</span>
                    </span>
                    <span className="navbar-menu-meta">
                      {followSystemActive ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : (
                        <FontAwesomeIcon icon={faDesktop} size="sm" />
                      )}
                    </span>
                  </button>
                  <button
                    className={`navbar-menu-item ${lightThemeActive ? 'active' : ''}`}
                    onClick={() => handleThemeSelection(EditorThemeEnum.M68K_LIGHT)}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">M68K Light</span>
                      <span className="navbar-menu-subtitle">
                        Bright shell with high-contrast terminals
                      </span>
                    </span>
                    <span className="navbar-menu-meta">
                      {lightThemeActive ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : (
                        <FontAwesomeIcon icon={faSun} size="sm" />
                      )}
                    </span>
                  </button>
                  <button
                    className={`navbar-menu-item ${darkThemeActive ? 'active' : ''}`}
                    onClick={() => handleThemeSelection(EditorThemeEnum.M68K_DARK)}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">M68K Dark</span>
                      <span className="navbar-menu-subtitle">
                        Low-glare shell for terminal-heavy sessions
                      </span>
                    </span>
                    <span className="navbar-menu-meta">
                      {darkThemeActive ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : (
                        <FontAwesomeIcon icon={faMoon} size="sm" />
                      )}
                    </span>
                  </button>
                </div>
              ) : null}
              {activeSubmenu === 'terminal-input' ? (
                <div
                  className={`navbar-submenu navbar-submenu-${menuPosition.submenuDirection}`}
                  data-testid="navbar-terminal-input-submenu"
                  role="menu"
                  aria-label="Terminal input options"
                >
                  <button
                    className={`navbar-menu-item ${terminalInputMode === 'auto' ? 'active' : ''}`}
                    onClick={() => handleTerminalInputModeSelection('auto')}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">Auto</span>
                      <span className="navbar-menu-subtitle">
                        Use touch-only for mobile Nibbles and text input elsewhere
                      </span>
                    </span>
                    <span className="navbar-menu-meta">
                      {terminalInputMode === 'auto' ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : null}
                    </span>
                  </button>
                  <button
                    className={`navbar-menu-item ${terminalInputMode === 'text-input' ? 'active' : ''}`}
                    onClick={() => handleTerminalInputModeSelection('text-input')}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">Text Input</span>
                      <span className="navbar-menu-subtitle">
                        Keep the terminal focused on keyboard-style program input
                      </span>
                    </span>
                    <span className="navbar-menu-meta">
                      {terminalInputMode === 'text-input' ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : null}
                    </span>
                  </button>
                  <button
                    className={`navbar-menu-item ${terminalInputMode === 'touch-only' ? 'active' : ''}`}
                    onClick={() => handleTerminalInputModeSelection('touch-only')}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">Touch Only</span>
                      <span className="navbar-menu-subtitle">
                        Disable text capture and map the terminal surface to cell touches
                      </span>
                    </span>
                    <span className="navbar-menu-meta">
                      {terminalInputMode === 'touch-only' ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : null}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </nav>
  );
};

export default Navbar;
