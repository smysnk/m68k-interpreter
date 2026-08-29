import React from 'react';
import { useSelector } from 'react-redux';
import { Analytics } from '@vercel/analytics/react';
import { useTheme } from 'styled-components';
import Navbar from './Navbar';
import StatusBar from './StatusBar';
import FileExplorerSidebar from './FileExplorerSidebar';
import PanelWorkspacePrototype from './PanelWorkspacePrototype';
import PanelWorkspace from './panels/PanelWorkspace';
import { useAppShellController } from '@/hooks/useAppShellController';
import { useCompactShell } from '@/hooks/useCompactShell';
import { useEmulatorEvents } from '@/hooks/useEmulatorEvents';
import { useDebuggerPanelReveal } from '@/hooks/useDebuggerPanelReveal';
import HardwareRuntimeBridge from '@/runtime/HardwareRuntimeBridge';
import {
  getIdePerformanceSnapshot,
  RenderProfileBoundary,
  useIdeRenderTelemetry,
} from '@/runtime/idePerformanceTelemetry';
import { IdeProviders } from '@/theme/IdeProviders';
import {
  NIBBLES_FILE_ID,
  requestSourceIdeIgnore,
  requestFocusTerminal,
  setEditorCode,
  setActiveFile,
  setSpeedMultiplier,
  revealPanelKind,
  resetToPreset,
  selectActivePanelLayout,
  ideStore,
  type PanelPresetId,
  type RootState,
} from '@/store';
import { executionCoordinator } from '@/runtime/executionCoordinator';

declare global {
  interface Window {
    __M68K_IDE_TEST_CONTROLS__?: {
      activateNibblesSource: () => void;
      getSourceIdeStatus: () => RootState['sourceIde']['current']['status'];
      getTerminalGeometryVersion: () => number;
      ignoreSourceConfiguration: () => void;
      loadSource: (source: string) => void;
      focusTerminal: () => void;
      runProgram: () => void;
      setSpeedMultiplier: (value: number) => void;
      setWorkspaceTab: (value: 'terminal' | 'code' | 'registers' | 'memory' | 'hardware') => void;
      setPanelPreset: (value: PanelPresetId) => void;
    };
  }
}

function RuntimeDriver(): React.ReactElement {
  useEmulatorEvents();
  return <HardwareRuntimeBridge />;
}

function IdePerformanceProbe(): React.ReactElement | null {
  const [enabled, setEnabled] = React.useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return (
      window.__M68K_IDE_PERF_ENABLED__ === true ||
      new URLSearchParams(window.location.search).get('ide_perf') === '1'
    );
  });
  const [controlsReady, setControlsReady] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState(() => getIdePerformanceSnapshot());

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextEnabled =
      window.__M68K_IDE_PERF_ENABLED__ === true ||
      new URLSearchParams(window.location.search).get('ide_perf') === '1';
    setEnabled(nextEnabled);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!enabled) {
      delete window.__M68K_IDE_TEST_CONTROLS__;
      setControlsReady(false);
      return;
    }

    window.__M68K_IDE_TEST_CONTROLS__ = {
      activateNibblesSource: () => {
        const state = ideStore.getState();
        const nibblesFile = state.files.items.find((item) => item.id === NIBBLES_FILE_ID);
        ideStore.dispatch(setActiveFile(NIBBLES_FILE_ID));
        if (nibblesFile) {
          ideStore.dispatch(setEditorCode(nibblesFile.content));
        }
      },
      getSourceIdeStatus: () => ideStore.getState().sourceIde.current.status,
      getTerminalGeometryVersion: () => ideStore.getState().emulator.terminal.geometryVersion,
      ignoreSourceConfiguration: () => {
        const activeFileId = ideStore.getState().files.activeFileId;
        ideStore.dispatch(requestSourceIdeIgnore(activeFileId));
      },
      loadSource: (source: string) => {
        ideStore.dispatch(revealPanelKind('code'));
        ideStore.dispatch(setEditorCode(source));
      },
      focusTerminal: () => {
        ideStore.dispatch(requestFocusTerminal());
      },
      runProgram: () => {
        executionCoordinator.execute('run');
      },
      setSpeedMultiplier: (value: number) => {
        ideStore.dispatch(setSpeedMultiplier(value));
      },
      setWorkspaceTab: (value) => {
        ideStore.dispatch(revealPanelKind(value === 'hardware' ? 'hardware-display' : value));
      },
      setPanelPreset: (value) => {
        ideStore.dispatch(resetToPreset(value));
      },
    };
    setControlsReady(true);

    const updateSnapshot = (): void => {
      setSnapshot(getIdePerformanceSnapshot());
    };

    updateSnapshot();
    const intervalId = window.setInterval(updateSnapshot, 100);

    return () => {
      window.clearInterval(intervalId);
      delete window.__M68K_IDE_TEST_CONTROLS__;
      setControlsReady(false);
    };
  }, [enabled]);

  return (
    <output
      hidden
      aria-hidden="true"
      data-testid="ide-perf-probe"
      data-ide-perf-enabled={enabled ? 'true' : 'false'}
      data-ide-test-controls-ready={controlsReady ? 'true' : 'false'}
      data-worker-frame-events={snapshot.workerTransport.frameEventsReceived}
      data-debugger-snapshot-dispatches={snapshot.debuggerSurface.snapshotDispatchCount}
      data-debugger-pause-snapshots={snapshot.debuggerSurface.pauseSnapshotCount}
      data-debugger-pause-latency={snapshot.debuggerSurface.lastPauseToSnapshotLatencyMs}
      data-terminal-repaints={snapshot.terminalRepaint.repaintCount}
      data-touch-dispatches={snapshot.touchLatency.dispatchCount}
      data-touch-visuals={snapshot.touchLatency.visualLatencyCount}
    />
  );
}

function AppShell(): React.ReactElement {
  useIdeRenderTelemetry('AppShell');
  useDebuggerPanelReveal();
  const theme = useTheme();
  const { navbarShellRef, statusBarShellRef } = useAppShellController();
  const panelLayout = useSelector(selectActivePanelLayout);
  const bottomChromeOffset = useSelector((state: RootState) => state.uiShell.chromeOffsets.bottom);
  const isCompactShell = useCompactShell();
  const [isFileExplorerOpen, setIsFileExplorerOpen] = React.useState(false);
  const focusedPanel = panelLayout.focusedPanelId
    ? panelLayout.instances[panelLayout.focusedPanelId]
    : undefined;
  const isFocusedMobileTerminal = isCompactShell && focusedPanel?.kind === 'terminal';
  const closeFileExplorer = React.useCallback(() => setIsFileExplorerOpen(false), []);
  const toggleFileExplorer = React.useCallback(
    () => setIsFileExplorerOpen((current) => !current),
    []
  );

  React.useEffect(() => {
    if (isFocusedMobileTerminal) {
      setIsFileExplorerOpen(false);
    }
  }, [isFocusedMobileTerminal]);

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
        <Navbar fileExplorerOpen={isFileExplorerOpen} onToggleFileExplorer={toggleFileExplorer} />
      </div>
      {!isFocusedMobileTerminal ? (
        <FileExplorerSidebar open={isFileExplorerOpen} onClose={closeFileExplorer} />
      ) : null}
      <main className={`main-content ${isCompactShell ? 'main-content-mobile' : ''}`.trim()}>
        <div
          className={isCompactShell ? 'mobile-workspace-shell' : 'main-shell'}
          data-testid={isCompactShell ? 'mobile-workspace-shell' : 'desktop-workspace-shell'}
        >
          <PanelWorkspace />
        </div>
      </main>
      {!isFocusedMobileTerminal ? (
        <div className="app-chrome-bottom" ref={statusBarShellRef}>
          <StatusBar />
        </div>
      ) : null}
      <IdePerformanceProbe />
      {import.meta.env.VITE_IDE_ANALYTICS !== 'false' ? <Analytics /> : null}
    </div>
  );
}

function shouldRenderPanelWorkspacePrototype(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('panelPrototype') === 'debug';
}

const App: React.FC = () => {
  const showPanelWorkspacePrototype = shouldRenderPanelWorkspacePrototype();

  return (
    <IdeProviders>
      {showPanelWorkspacePrototype ? (
        <PanelWorkspacePrototype />
      ) : (
        <>
          <RuntimeDriver />
          <RenderProfileBoundary id="AppShell">
            <AppShell />
          </RenderProfileBoundary>
        </>
      )}
    </IdeProviders>
  );
};

export { AppShell };
export default App;
