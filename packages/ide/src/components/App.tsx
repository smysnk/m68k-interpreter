import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { flushSync } from 'react-dom';
import { useTheme } from 'styled-components';
import { Analytics } from '@vercel/analytics/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import 'react-retro-display-tty-ansi/styles.css';
import Navbar from './Navbar';
import Editor from './Editor';
import Registers from './Registers';
import Output from './Output';
import StatusBar from './StatusBar';
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
  setInspectorView,
  setEditorCode,
  setEngineMode,
  setInspectorVerticalLayout,
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  setWorkspaceTab,
  syncSystemTheme,
  toggleContextView,
  toggleEditorTheme,
  toggleInspectorView,
  toggleShowFlags,
  type RootState,
  type AppDispatch,
} from '@/store';
import '../styles/main.css';

function AppShell(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const showFlags = useSelector((state: RootState) => state.emulator.showFlags);
  const workspaceTab = useSelector((state: RootState) => state.uiShell.workspaceTab);
  const inspectorView = useSelector((state: RootState) => state.uiShell.inspectorView);
  const rootHorizontalLayout = useSelector((state: RootState) => state.uiShell.layout.rootHorizontal);
  const rootHorizontalWithContextLayout = useSelector(
    (state: RootState) => state.uiShell.layout.rootHorizontalWithContext
  );
  const inspectorVerticalLayout = useSelector(
    (state: RootState) => state.uiShell.layout.inspectorVertical
  );
  const showHelp = useSelector(
    (state: RootState) => state.uiShell.contextOpen && state.uiShell.contextView === 'help'
  );
  const followSystemTheme = useSelector((state: RootState) => state.settings.followSystemTheme);
  const engineMode = useSelector((state: RootState) => state.settings.engineMode);
  const activeInspectorPane = showFlags ? 'flags' : inspectorView;

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

  useEffect(() => {
    const showTerminalWorkspace = (): void => {
      flushSync(() => {
        dispatch(setWorkspaceTab('terminal'));
      });
    };

    window.addEventListener('emulator:run', showTerminalWorkspace);
    window.addEventListener('emulator:resume', showTerminalWorkspace);
    window.addEventListener('emulator:step', showTerminalWorkspace);

    return () => {
      window.removeEventListener('emulator:run', showTerminalWorkspace);
      window.removeEventListener('emulator:resume', showTerminalWorkspace);
      window.removeEventListener('emulator:step', showTerminalWorkspace);
    };
  }, [dispatch]);

  const handleLoadNibbles = (): void => {
    dispatch(setWorkspaceTab('terminal'));
    dispatch(setEngineMode('interpreter'));
    dispatch(setEditorCode(nibblesSource));
    window.editorCode = nibblesSource;
    window.dispatchEvent(new CustomEvent('emulator:reset'));
  };

  const handleToggleInspector = (): void => {
    if (showFlags) {
      dispatch(toggleShowFlags());
      dispatch(setInspectorView('memory'));
      return;
    }

    dispatch(toggleInspectorView());
  };

  const handleRootLayout = (sizes: number[]): void => {
    if (sizes.length === 3) {
      dispatch(setRootHorizontalWithContextLayout(sizes as [number, number, number]));
      return;
    }

    if (sizes.length === 2) {
      dispatch(setRootHorizontalLayout(sizes as [number, number]));
    }
  };

  return (
    <div className="app-container" data-testid="app-container" data-theme={theme.surfaceMode}>
      <Navbar
        activeInspectorPane={activeInspectorPane}
        activeWorkspaceTab={workspaceTab}
        onLoadNibbles={handleLoadNibbles}
        onWorkspaceTabChange={(tab) => dispatch(setWorkspaceTab(tab))}
        onToggleTheme={() => dispatch(toggleEditorTheme())}
        onToggleHelp={() => dispatch(toggleContextView('help'))}
        onToggleMemory={handleToggleInspector}
        engineMode={engineMode}
        theme={theme.surfaceMode}
        showHelp={showHelp}
      />
      <main className="main-content">
        <PanelGroup
          className="main-shell"
          direction="horizontal"
          key={showHelp ? 'main-shell-with-context' : 'main-shell-default'}
          onLayout={handleRootLayout}
        >
          <Panel
            className="panel-slot"
            defaultSize={showHelp ? rootHorizontalWithContextLayout[0] : rootHorizontalLayout[0]}
            minSize={34}
            order={1}
          >
            <div className="workspace-panel">
              <div className="workspace-tabpanels">
                <section
                  aria-labelledby="workspace-tab-terminal"
                  className={`workspace-tabpanel ${workspaceTab === 'terminal' ? 'active' : ''}`}
                  data-active={workspaceTab === 'terminal'}
                  data-testid="workspace-panel-terminal"
                  id="workspace-tabpanel-terminal"
                  role="tabpanel"
                >
                  <Terminal />
                </section>
                <section
                  aria-labelledby="workspace-tab-code"
                  className={`workspace-tabpanel ${workspaceTab === 'code' ? 'active' : ''}`}
                  data-active={workspaceTab === 'code'}
                  data-testid="workspace-panel-code"
                  id="workspace-tabpanel-code"
                  role="tabpanel"
                >
                  <Editor />
                </section>
              </div>
            </div>
          </Panel>
          <PanelResizeHandle
            className="panel-resize-handle panel-resize-handle-horizontal"
            data-testid="resize-handle-root"
          />
          <Panel
            className="panel-slot"
            defaultSize={showHelp ? rootHorizontalWithContextLayout[1] : rootHorizontalLayout[1]}
            minSize={24}
            order={2}
          >
            <div className="inspector-panel">
              <PanelGroup
                className="inspector-panel-group"
                direction="vertical"
                onLayout={(sizes) => dispatch(setInspectorVerticalLayout(sizes as [number, number]))}
              >
                <Panel
                  className="panel-slot panel-slot-vertical"
                  defaultSize={inspectorVerticalLayout[0]}
                  minSize={24}
                  order={1}
                >
                  <div className="inspector-section inspector-output-section">
                    <Output />
                  </div>
                </Panel>
                <PanelResizeHandle
                  className="panel-resize-handle panel-resize-handle-vertical"
                  data-testid="resize-handle-inspector"
                />
                <Panel
                  className="panel-slot panel-slot-vertical"
                  defaultSize={inspectorVerticalLayout[1]}
                  minSize={24}
                  order={2}
                >
                  <div className="inspector-section inspector-machine-section">
                    {activeInspectorPane === 'flags' ? (
                      <Flags />
                    ) : activeInspectorPane === 'registers' ? (
                      <Registers />
                    ) : (
                      <Memory />
                    )}
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </Panel>
          {showHelp ? (
            <>
              <PanelResizeHandle
                className="panel-resize-handle panel-resize-handle-horizontal"
                data-testid="resize-handle-context"
              />
              <Panel className="panel-slot" defaultSize={rootHorizontalWithContextLayout[2]} minSize={14} order={3}>
                <div className="context-panel" data-testid="context-panel">
                  <HelpPanel />
                </div>
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      </main>
      <StatusBar />
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
