import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from 'styled-components';
import { Analytics } from '@vercel/analytics/react';
import 'react-retro-display-tty-ansi/styles.css';
import Navbar from './Navbar';
import Editor from './Editor';
import Registers from './Registers';
import Output from './Output';
import Terminal from './Terminal';
import HelpPanel from './HelpPanel';
import Memory from './Memory';
import Flags from './Flags';
import { useEmulatorEvents } from '@/hooks/useEmulatorEvents';
import { IdeProviders } from '@/theme/IdeProviders';
import { editorThemes } from '@/theme/editorThemeRegistry';
import { nibblesSource } from '@/programs/nibbles';
import {
  ideStore,
  setEditorCode,
  syncSystemTheme,
  toggleEditorTheme,
  toggleHelp,
  toggleRegisters,
  type RootState,
  type AppDispatch,
} from '@/store';
import '../styles/main.css';

function AppShell(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const showFlags = useSelector((state: RootState) => state.emulator.showFlags);
  const showHelp = useSelector((state: RootState) => state.settings.showHelp);
  const showRegisters = useSelector((state: RootState) => state.settings.showRegisters);
  const followSystemTheme = useSelector((state: RootState) => state.settings.followSystemTheme);

  useEmulatorEvents();

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery || !followSystemTheme) {
      return;
    }

    const handleChange = (event: MediaQueryListEvent): void => {
      const nextMode = event.matches ? 'dark' : 'light';
      const activeMode = editorThemes[ideStore.getState().settings.editorTheme].surfaceMode;
      if (ideStore.getState().settings.followSystemTheme && activeMode !== nextMode) {
        dispatch(syncSystemTheme(nextMode));
      }
    };

    const nextMode = mediaQuery.matches ? 'dark' : 'light';
    if (theme.surfaceMode !== nextMode) {
      dispatch(syncSystemTheme(nextMode));
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, [dispatch, followSystemTheme, theme.surfaceMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme.surfaceMode;
    document.documentElement.style.colorScheme = theme.surfaceMode;
  }, [theme.surfaceMode]);

  const handleLoadNibbles = (): void => {
    dispatch(setEditorCode(nibblesSource));
    window.editorCode = nibblesSource;
    window.dispatchEvent(new CustomEvent('emulator:reset'));
  };

  return (
    <div className="app-container" data-testid="app-container" data-theme={theme.surfaceMode}>
      <Navbar
        onLoadNibbles={handleLoadNibbles}
        onToggleTheme={() => dispatch(toggleEditorTheme())}
        onToggleHelp={() => dispatch(toggleHelp())}
        onToggleMemory={() => dispatch(toggleRegisters())}
        theme={theme.surfaceMode}
        showHelp={showHelp}
        showMemory={showRegisters}
      />
      <main className="main-content">
        <div className="workspace-panel">
          <Editor />
          <Terminal />
        </div>
        <div className="inspector-panel">
          <Output />
          {showFlags ? <Flags /> : showRegisters ? <Registers /> : <Memory />}
        </div>
      </main>
      <div className={`aside-content ${showHelp ? 'visible' : ''}`}>
        <HelpPanel />
      </div>
      <Analytics />
    </div>
  );
}

const App: React.FC = () => (
  <IdeProviders>
    <AppShell />
  </IdeProviders>
);

export { AppShell };
export default App;
