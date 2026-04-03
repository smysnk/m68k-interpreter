import React from 'react';
import { useSelector } from 'react-redux';
import Editor from './Editor';
import Memory from './Memory';
import Registers from './Registers';
import Terminal from './Terminal';
import { RenderProfileBoundary, useIdeRenderTelemetry } from '@/runtime/idePerformanceTelemetry';
import { selectWorkspacePanelModel } from '@/store';

const WorkspacePanel: React.FC = () => {
  useIdeRenderTelemetry('WorkspacePanel');
  const { activeWorkspaceTab } = useSelector(selectWorkspacePanelModel);

  let panel: React.ReactNode;
  switch (activeWorkspaceTab) {
    case 'code':
      panel = <Editor />;
      break;
    case 'registers':
      panel = (
        <RenderProfileBoundary id="RegistersPanel">
          <Registers />
        </RenderProfileBoundary>
      );
      break;
    case 'memory':
      panel = (
        <RenderProfileBoundary id="MemoryPanel">
          <Memory />
        </RenderProfileBoundary>
      );
      break;
    case 'terminal':
    default:
      panel = (
        <RenderProfileBoundary id="TerminalPanel">
          <Terminal />
        </RenderProfileBoundary>
      );
      break;
  }

  return (
    <div className="workspace-panel">
      <div className="workspace-tabpanels">
        <section
          aria-labelledby={`workspace-tab-${activeWorkspaceTab}`}
          className="workspace-tabpanel active"
          data-active
          data-testid={`workspace-panel-${activeWorkspaceTab}`}
          id={`workspace-tabpanel-${activeWorkspaceTab}`}
          role="tabpanel"
        >
          {panel}
        </section>
      </div>
    </div>
  );
};

export default WorkspacePanel;
