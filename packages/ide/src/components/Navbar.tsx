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
  setSpeedMultiplier,
  setActiveSubmenu,
  setWorkspaceTab,
  toggleAppMenu,
  type AppDispatch,
  type RootState,
} from '@/store';
import {
  selectNavbarMenuState,
  selectNavbarPresentationModel,
  selectNavbarThemeLabel,
} from '@/store/navbarSelectors';
import { EditorThemeEnum, type EditorThemeId } from '@/theme/editorThemeRegistry';

const Navbar: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { menuOpen, activeSubmenu } = useSelector((state: RootState) => selectNavbarMenuState(state));
  const themeLabel = useSelector((state: RootState) => selectNavbarThemeLabel(state));
  const {
    activeWorkspaceTab,
    darkThemeActive,
    followSystemActive,
    lightThemeActive,
    lineNumbers,
    speedMultiplier,
  } = useSelector((state: RootState) => selectNavbarPresentationModel(state));
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
        submenuDirection:
          rect.left + 280 + 280 + 24 <= window.innerWidth ? 'right' : 'left',
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

  const closeMenu = (): void => {
    dispatch(closeAppMenu());
  };

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
    <nav className="navbar">
      <div className="navbar-left">
        <div
          aria-hidden="true"
          className="navbar-accent-mark"
          data-testid="navbar-accent-mark"
        >
          68
        </div>
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
        <div className="navbar-menubar">
          <div className="navbar-view-toggle" role="tablist" aria-label="Workspace views">
            <button
              aria-controls="workspace-tabpanel-terminal"
              aria-selected={activeWorkspaceTab === 'terminal'}
              className={`navbar-view-tab ${activeWorkspaceTab === 'terminal' ? 'active' : ''}`}
              id="workspace-tab-terminal"
              onClick={() => dispatch(setWorkspaceTab('terminal'))}
              role="tab"
              type="button"
            >
              Terminal
            </button>
            <button
              aria-controls="workspace-tabpanel-code"
              aria-selected={activeWorkspaceTab === 'code'}
              className={`navbar-view-tab ${activeWorkspaceTab === 'code' ? 'active' : ''}`}
              id="workspace-tab-code"
              onClick={() => dispatch(setWorkspaceTab('code'))}
              role="tab"
              type="button"
            >
              Code
            </button>
          </div>
        </div>
      </div>

      <div className="navbar-right">
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
                  dispatch(setSpeedMultiplier(Math.max(0.25, Number.parseFloat(event.target.value) || 1)))
                }
                step="0.25"
                title="Multiplier for per-frame execution budget"
                type="number"
                value={speedMultiplier}
              />
            </div>
          </label>
        </div>

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
                      {followSystemActive ? <FontAwesomeIcon icon={faCheck} size="sm" /> : <FontAwesomeIcon icon={faDesktop} size="sm" />}
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
                      <span className="navbar-menu-subtitle">Bright shell with high-contrast terminals</span>
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
                      <span className="navbar-menu-subtitle">Low-glare shell for terminal-heavy sessions</span>
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
            </div>,
            document.body
          )
        : null}
    </nav>
  );
};

export default Navbar;
