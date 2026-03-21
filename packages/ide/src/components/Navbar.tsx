import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars,
  faCheck,
  faChevronRight,
  faDesktop,
  faMoon,
  faSun,
} from '@fortawesome/free-solid-svg-icons';
import GitHubButton from 'react-github-btn';
import type { EngineMode } from '@/store';
import { EditorThemeEnum, type EditorThemeId } from '@/theme/editorThemeRegistry';

type WorkspaceTab = 'terminal' | 'code';
type InspectorPane = 'registers' | 'memory' | 'flags';

interface NavbarProps {
  activeInspectorPane: InspectorPane;
  activeWorkspaceTab: WorkspaceTab;
  editorTheme: EditorThemeId;
  engineMode: EngineMode;
  followSystemTheme: boolean;
  lineNumbers: boolean;
  onSetEditorTheme: (theme: EditorThemeId) => void;
  onSetFollowSystemTheme: (value: boolean) => void;
  onSetLineNumbers: (value: boolean) => void;
  onShowFlags: () => void;
  onShowMemory: () => void;
  onShowRegisters: () => void;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onToggleHelp: () => void;
  showHelp: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
  activeInspectorPane,
  activeWorkspaceTab,
  editorTheme,
  followSystemTheme,
  lineNumbers,
  onSetEditorTheme,
  onSetFollowSystemTheme,
  onSetLineNumbers,
  onShowFlags,
  onShowMemory,
  onShowRegisters,
  onWorkspaceTabChange,
  onToggleHelp,
  showHelp,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<'style' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuLayerRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    maxWidth: 280,
    submenuDirection: 'left' as 'left' | 'right',
  });
  const themeLabel = useMemo(() => {
    if (followSystemTheme) {
      return 'Follow System';
    }

    return editorTheme === EditorThemeEnum.M68K_DARK ? 'Dark' : 'Light';
  }, [editorTheme, followSystemTheme]);

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
        setMenuOpen(false);
        setSubmenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setSubmenu(null);
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
  }, [menuOpen]);

  const closeMenu = (): void => {
    setMenuOpen(false);
    setSubmenu(null);
  };

  const handleThemeSelection = (nextTheme: 'system' | EditorThemeId): void => {
    if (nextTheme === 'system') {
      onSetFollowSystemTheme(true);
    } else {
      onSetEditorTheme(nextTheme);
    }

    closeMenu();
  };

  const handleShowFlags = (): void => {
    onShowFlags();
    closeMenu();
  };

  const handleShowMemory = (): void => {
    onShowMemory();
    closeMenu();
  };

  const handleShowRegisters = (): void => {
    onShowRegisters();
    closeMenu();
  };

  const handleToggleHelp = (): void => {
    onToggleHelp();
    closeMenu();
  };

  const handleToggleLineNumbers = (): void => {
    onSetLineNumbers(!lineNumbers);
    closeMenu();
  };

  const handleToggleMenu = (): void => {
    setMenuOpen((current) => {
      const next = !current;
      if (!next) {
        setSubmenu(null);
      }
      return next;
    });
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
              onClick={() => onWorkspaceTabChange('terminal')}
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
              onClick={() => onWorkspaceTabChange('code')}
              role="tab"
              type="button"
            >
              Code
            </button>
          </div>
        </div>
      </div>

      <div className="navbar-right">
        <div className="navbar-github">
          <GitHubButton
            href="https://github.com/gianlucarea/m68k-interpreter"
            data-color-scheme="no-preference: light; light: light; dark: dark;"
            data-icon="octicon-star"
            data-size="large"
            data-show-count="true"
            aria-label="Star gianlucarea/m68k-interpreter on GitHub"
          >
            Star
          </GitHubButton>
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
                aria-expanded={submenu === 'style'}
                aria-haspopup="menu"
                className={`navbar-menu-item ${submenu === 'style' ? 'active' : ''}`}
                onClick={() => setSubmenu('style')}
                onFocus={() => setSubmenu('style')}
                onMouseEnter={() => setSubmenu('style')}
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
                className={`navbar-menu-item ${activeInspectorPane === 'registers' ? 'active' : ''}`}
                onClick={handleShowRegisters}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Registers</span>
                  <span className="navbar-menu-subtitle">Show the register inspector</span>
                </span>
                <span className="navbar-menu-meta">
                  {activeInspectorPane === 'registers' ? <FontAwesomeIcon icon={faCheck} size="sm" /> : null}
                </span>
              </button>

              <button
                className={`navbar-menu-item ${activeInspectorPane === 'memory' ? 'active' : ''}`}
                onClick={handleShowMemory}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Memory</span>
                  <span className="navbar-menu-subtitle">Inspect the active memory window</span>
                </span>
                <span className="navbar-menu-meta">
                  {activeInspectorPane === 'memory' ? <FontAwesomeIcon icon={faCheck} size="sm" /> : null}
                </span>
              </button>

              <button
                className={`navbar-menu-item ${activeInspectorPane === 'flags' ? 'active' : ''}`}
                onClick={handleShowFlags}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Flags</span>
                  <span className="navbar-menu-subtitle">Show the processor flags view</span>
                </span>
                <span className="navbar-menu-meta">
                  {activeInspectorPane === 'flags' ? <FontAwesomeIcon icon={faCheck} size="sm" /> : null}
                </span>
              </button>

              <button
                className={`navbar-menu-item ${showHelp ? 'active' : ''}`}
                onClick={handleToggleHelp}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Compatibility Notes</span>
                  <span className="navbar-menu-subtitle">Open Easy68K subset guidance</span>
                </span>
                <span className="navbar-menu-meta">
                  {showHelp ? <FontAwesomeIcon icon={faCheck} size="sm" /> : null}
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

              {submenu === 'style' ? (
                <div
                  className={`navbar-submenu navbar-submenu-${menuPosition.submenuDirection}`}
                  data-testid="navbar-style-submenu"
                  role="menu"
                  aria-label="Style options"
                >
                  <button
                    className={`navbar-menu-item ${followSystemTheme ? 'active' : ''}`}
                    onClick={() => handleThemeSelection('system')}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">Follow System</span>
                      <span className="navbar-menu-subtitle">Match the OS light and dark mode</span>
                    </span>
                    <span className="navbar-menu-meta">
                      {followSystemTheme ? <FontAwesomeIcon icon={faCheck} size="sm" /> : <FontAwesomeIcon icon={faDesktop} size="sm" />}
                    </span>
                  </button>
                  <button
                    className={`navbar-menu-item ${
                      !followSystemTheme && editorTheme === EditorThemeEnum.M68K_LIGHT ? 'active' : ''
                    }`}
                    onClick={() => handleThemeSelection(EditorThemeEnum.M68K_LIGHT)}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">M68K Light</span>
                      <span className="navbar-menu-subtitle">Bright shell with high-contrast terminals</span>
                    </span>
                    <span className="navbar-menu-meta">
                      {!followSystemTheme && editorTheme === EditorThemeEnum.M68K_LIGHT ? (
                        <FontAwesomeIcon icon={faCheck} size="sm" />
                      ) : (
                        <FontAwesomeIcon icon={faSun} size="sm" />
                      )}
                    </span>
                  </button>
                  <button
                    className={`navbar-menu-item ${
                      !followSystemTheme && editorTheme === EditorThemeEnum.M68K_DARK ? 'active' : ''
                    }`}
                    onClick={() => handleThemeSelection(EditorThemeEnum.M68K_DARK)}
                    role="menuitem"
                    type="button"
                  >
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">M68K Dark</span>
                      <span className="navbar-menu-subtitle">Low-glare shell for terminal-heavy sessions</span>
                    </span>
                    <span className="navbar-menu-meta">
                      {!followSystemTheme && editorTheme === EditorThemeEnum.M68K_DARK ? (
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
