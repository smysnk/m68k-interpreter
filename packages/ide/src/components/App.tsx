import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Analytics } from '@vercel/analytics/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useTheme } from 'styled-components';
import Navbar from './Navbar';
import WorkspacePanel from './WorkspacePanel';
import InspectorPanel from './InspectorPanel';
import StatusBar from './StatusBar';
import HelpPanel from './HelpPanel';
import FileExplorerSidebar from './FileExplorerSidebar';
import { useAppShellController } from '@/hooks/useAppShellController';
import { useEmulatorEvents } from '@/hooks/useEmulatorEvents';
import { IdeProviders } from '@/theme/IdeProviders';
import {
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  selectRootPanelLayoutModel,
  type AppDispatch,
} from '@/store';

function AppShell(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const { navbarShellRef, statusBarShellRef } = useAppShellController();
  const panelLayout = useSelector(selectRootPanelLayoutModel);

  useEmulatorEvents();

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
      <div className="app-chrome-top" ref={navbarShellRef}>
        <Navbar />
      </div>
      <FileExplorerSidebar />
      <main className="main-content">
        <PanelGroup
          className="main-shell"
          direction="horizontal"
          key={panelLayout.shellKey}
          onLayout={handleRootLayout}
        >
          <Panel
            className="panel-slot"
            defaultSize={panelLayout.workspaceDefaultSize}
            minSize={34}
            order={1}
          >
            <WorkspacePanel />
          </Panel>
          <PanelResizeHandle
            className="panel-resize-handle panel-resize-handle-horizontal"
            data-testid="resize-handle-root"
          />
          <Panel
            className="panel-slot"
            defaultSize={panelLayout.inspectorDefaultSize}
            minSize={24}
            order={2}
          >
            <InspectorPanel />
          </Panel>
          {panelLayout.hasContextPanel ? (
            <>
              <PanelResizeHandle
                className="panel-resize-handle panel-resize-handle-horizontal"
                data-testid="resize-handle-context"
              />
              <Panel className="panel-slot" defaultSize={panelLayout.contextDefaultSize ?? 18} minSize={14} order={3}>
                <div className="context-panel" data-testid="context-panel">
                  <HelpPanel />
                </div>
              </Panel>
            </>
          ) : null}
        </PanelGroup>
      </main>
      <div className="app-chrome-bottom" ref={statusBarShellRef}>
        <StatusBar />
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
