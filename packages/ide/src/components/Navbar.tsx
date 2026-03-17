import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faUndo,
  faRedo,
  faStop,
  faQuestionCircle,
  faFlag,
  faMemory,
  faMoon,
  faSun,
} from '@fortawesome/free-solid-svg-icons';
import GitHubButton from 'react-github-btn';

type AppTheme = 'light' | 'dark';

interface NavbarProps {
  onLoadNibbles: () => void;
  onToggleTheme: () => void;
  onToggleHelp: () => void;
  onToggleMemory: () => void;
  theme: AppTheme;
  showHelp: boolean;
  showMemory: boolean;
}

const Navbar: React.FC<NavbarProps> = ({
  onLoadNibbles,
  onToggleTheme,
  onToggleHelp,
  onToggleMemory,
  theme,
  showHelp,
  showMemory,
}) => {
  const handleRun = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:run'));
    window.dispatchEvent(new CustomEvent('emulator:focus-terminal'));
  };

  const handleStep = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:step'));
    window.dispatchEvent(new CustomEvent('emulator:focus-terminal'));
  };

  const handleUndo = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:undo'));
  };

  const handleReset = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:reset'));
  };

  const handleShowFlags = (): void => {
    window.dispatchEvent(new CustomEvent('emulator:showflags'));
  };

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <nav className="navbar">
      <div className="navbar-commands">
        <button className="btn-command btn-command-text" onClick={onLoadNibbles} title="Load Nibbles">
          Load Nibbles
        </button>
        <button className="btn-command" onClick={handleRun} title="Run program">
          <FontAwesomeIcon icon={faPlay} size="lg" />
        </button>
        <button className="btn-command" onClick={handleReset} title="Reset">
          <FontAwesomeIcon icon={faStop} size="lg" />
        </button>
        <button className="btn-command" onClick={handleStep} title="Step">
          <FontAwesomeIcon icon={faRedo} size="lg" />
        </button>
        <button className="btn-command" onClick={handleUndo} title="Undo">
          <FontAwesomeIcon icon={faUndo} size="lg" />
        </button>
      </div>

      <h1 className="navbar-title">
        M68K Interpreter
        <div className="navbar-github-btn">
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
      </h1>

      <div className="navbar-tools">
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
        <button className="btn-tool" id="showFlag" title="Show flags" onClick={handleShowFlags}>
          <FontAwesomeIcon icon={faFlag} size="lg" />
        </button>
        <button
          className="btn-tool"
          id="toggleMemory"
          title={showMemory ? 'Hide Memory View' : 'Show Memory View'}
          onClick={onToggleMemory}
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
    </nav>
  );
};

export default Navbar;
