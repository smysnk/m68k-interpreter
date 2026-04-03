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
import { useCompactShell } from '@/hooks/useCompactShell';
import { useEmulatorEvents } from '@/hooks/useEmulatorEvents';
import {
  getIdePerformanceSnapshot,
  RenderProfileBoundary,
  useIdeRenderTelemetry,
} from '@/runtime/idePerformanceTelemetry';
import { IdeProviders } from '@/theme/IdeProviders';
import {
  setRootHorizontalLayout,
  setRootHorizontalWithContextLayout,
  setInspectorView,
  setWorkspaceTab,
  selectRootPanelLayoutModel,
  type AppDispatch,
  type RootState,
} from '@/store';

function RuntimeDriver(): null {
  useEmulatorEvents();
  return null;
}

function IdePerformanceProbe(): React.ReactElement | null {
  const [enabled, setEnabled] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState(() => getIdePerformanceSnapshot());

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextEnabled =
      window.__M68K_IDE_PERF_ENABLED__ === true ||
      new URLSearchParams(window.location.search).get('ide_perf') === '1';
    setEnabled(nextEnabled);

    if (!nextEnabled) {
      return;
    }

    const updateSnapshot = (): void => {
      setSnapshot(getIdePerformanceSnapshot());
    };

    updateSnapshot();
    const intervalId = window.setInterval(updateSnapshot, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <output
      hidden
      aria-hidden="true"
      data-testid="ide-perf-probe"
      data-ide-perf-enabled={enabled ? 'true' : 'false'}
      data-worker-frame-events={snapshot.workerTransport.frameEventsReceived}
      data-terminal-repaints={snapshot.terminalRepaint.repaintCount}
      data-touch-dispatches={snapshot.touchLatency.dispatchCount}
      data-touch-visuals={snapshot.touchLatency.visualLatencyCount}
    />
  );
}

function AppShell(): React.ReactElement {
  useIdeRenderTelemetry('AppShell');
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const { navbarShellRef, statusBarShellRef } = useAppShellController();
  const panelLayout = useSelector(selectRootPanelLayoutModel);
  const bottomChromeOffset = useSelector((state: RootState) => state.uiShell.chromeOffsets.bottom);
  const activeWorkspaceTab = useSelector((state: RootState) => state.uiShell.workspaceTab);
  const isCompactShell = useCompactShell();
  const isFocusedMobileTerminal = isCompactShell && activeWorkspaceTab === 'terminal';

  React.useEffect(() => {
    if (isCompactShell) {
      return;
    }

    if (activeWorkspaceTab === 'registers' || activeWorkspaceTab === 'memory') {
      dispatch(setInspectorView(activeWorkspaceTab));
      dispatch(setWorkspaceTab('terminal'));
    }
  }, [activeWorkspaceTab, dispatch, isCompactShell]);

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
    <div
      className="app-container"
      data-shell-mode={isCompactShell ? 'mobile' : 'desktop'}
      data-terminal-view-mode={isFocusedMobileTerminal ? 'focused' : 'standard'}
      data-testid="app-container"
      data-theme={theme.surfaceMode}
      style={
        {
          '--app-chrome-bottom-offset': `${bottomChromeOffset}px`,
        } as React.CSSProperties
      }
    >
      <div className="app-chrome-top" ref={navbarShellRef}>
        <Navbar />
      </div>
      {!isFocusedMobileTerminal ? <FileExplorerSidebar /> : null}
      <main className={`main-content ${isCompactShell ? 'main-content-mobile' : ''}`.trim()}>
        {isCompactShell ? (
          <div className="mobile-workspace-shell" data-testid="mobile-workspace-shell">
            <WorkspacePanel />
          </div>
        ) : (
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
        )}
      </main>
      {!isFocusedMobileTerminal ? (
        <div className="app-chrome-bottom" ref={statusBarShellRef}>
          <StatusBar />
        </div>
      ) : null}
      <IdePerformanceProbe />
      <Analytics />
    </div>
  );
}

const App: React.FC = () => (
  <IdeProviders>
    <RuntimeDriver />
    <RenderProfileBoundary id="AppShell">
      <AppShell />
    </RenderProfileBoundary>
  </IdeProviders>
);

export { AppShell };
export default App;
