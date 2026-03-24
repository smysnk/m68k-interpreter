import React from 'react';
import { useSelector } from 'react-redux';
import Editor from './Editor';
import Terminal from './Terminal';
import { selectWorkspacePanelModel } from '@/store';

const WorkspacePanel: React.FC = () => {
  const { terminalActive, codeActive } = useSelector(selectWorkspacePanelModel);

  return (
    <div className="workspace-panel">
      <div className="workspace-tabpanels">
        <section
          aria-labelledby="workspace-tab-terminal"
          className={`workspace-tabpanel ${terminalActive ? 'active' : ''}`}
          data-active={terminalActive}
          data-testid="workspace-panel-terminal"
          id="workspace-tabpanel-terminal"
          role="tabpanel"
        >
          <Terminal />
        </section>
        <section
          aria-labelledby="workspace-tab-code"
          className={`workspace-tabpanel ${codeActive ? 'active' : ''}`}
          data-active={codeActive}
          data-testid="workspace-panel-code"
          id="workspace-tabpanel-code"
          role="tabpanel"
        >
          <Editor />
        </section>
      </div>
    </div>
  );
};

export default WorkspacePanel;
