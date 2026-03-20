import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faQuestionCircle,
  faFlag,
  faMemory,
  faMoon,
  faSun,
} from '@fortawesome/free-solid-svg-icons';
import GitHubButton from 'react-github-btn';
import type { EngineMode } from '@/store';

type AppTheme = 'light' | 'dark';
type WorkspaceTab = 'terminal' | 'code';
type InspectorPane = 'registers' | 'memory' | 'flags';

interface NavbarProps {
  activeInspectorPane: InspectorPane;
  activeWorkspaceTab: WorkspaceTab;
  engineMode: EngineMode;
  onLoadNibbles: () => void;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onToggleTheme: () => void;
  onToggleHelp: () => void;
  onToggleMemory: () => void;
  theme: AppTheme;
  showHelp: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
  activeInspectorPane,
  activeWorkspaceTab,
  engineMode,
  onLoadNibbles,
  onWorkspaceTabChange,
  onToggleTheme,
  onToggleHelp,
  onToggleMemory,
  theme,
  showHelp,
}) => {
  const handleShowFlags = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:showflags'));
  };

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const memoryButtonTitle =
    activeInspectorPane === 'memory' ? 'Show Registers View' : 'Show Memory View';
  const engineSummary =
    engineMode === 'interpreter-redux' ? 'Reducer runtime preview' : 'Terminal-first emulator';

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="navbar-brand" aria-label="M68K IDE">
          <div className="navbar-brand-mark" aria-hidden="true">
            68
          </div>
          <div className="navbar-brand-copy">
            <span className="navbar-brand-title">M68K IDE</span>
            <span className="navbar-brand-subtitle">{engineSummary}</span>
          </div>
        </div>
        <div className="navbar-group navbar-group-primary">
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
          <button className="btn-command btn-command-text" onClick={onLoadNibbles} title="Load Nibbles">
            Load Nibbles
          </button>
        </div>
      </div>

      <div className="navbar-right">
        <div className="navbar-group navbar-group-tools">
          <button
            aria-label={`Switch to ${nextTheme} mode`}
            className="btn-tool"
            id="toggleTheme"
            onClick={onToggleTheme}
            title={`Switch to ${nextTheme} mode`}
            type="button"
          >
            <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} size="lg" />
          </button>
          <button className="btn-tool" id="showFlag" title="Show flags" onClick={handleShowFlags} type="button">
            <FontAwesomeIcon icon={faFlag} size="lg" />
          </button>
          <button
            className="btn-tool"
            id="toggleMemory"
            title={memoryButtonTitle}
            onClick={onToggleMemory}
            type="button"
          >
            <FontAwesomeIcon icon={faMemory} size="lg" />
          </button>
          <button
            className={`btn-tool ${showHelp ? 'active' : ''}`}
            title="Compatibility notes"
            onClick={onToggleHelp}
            type="button"
          >
            <FontAwesomeIcon icon={faQuestionCircle} size="lg" />
          </button>
        </div>
        <div className="navbar-group navbar-group-github">
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
    </nav>
  );
};

export default Navbar;
