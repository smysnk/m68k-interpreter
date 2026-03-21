import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faFileCode, faFolderTree } from '@fortawesome/free-solid-svg-icons';
import {
  NIBBLES_FILE_ID,
  selectActiveFileId,
  selectFiles,
  setActiveFile,
  setEditorCode,
  setEngineMode,
  setWorkspaceTab,
  type AppDispatch,
  type RootState,
} from '@/store';

interface FileExplorerSidebarProps {
  bottomOffset: number;
  topOffset: number;
}

const FileExplorerSidebar: React.FC<FileExplorerSidebarProps> = ({ bottomOffset, topOffset }) => {
  const dispatch = useDispatch<AppDispatch>();
  const files = useSelector(selectFiles);
  const activeFileId = useSelector(selectActiveFileId);
  const engineMode = useSelector((state: RootState) => state.settings.engineMode);
  const [isOpen, setIsOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<number | null>(null);

  const groupedFiles = React.useMemo(
    () => [
      {
        label: 'Workspace',
        items: files.filter((file) => file.kind === 'workspace'),
      },
      {
        label: 'Examples',
        items: files.filter((file) => file.kind === 'example'),
      },
    ].filter((group) => group.items.length > 0),
    [files]
  );

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openSidebar = React.useCallback(() => {
    clearCloseTimeout();
    setIsOpen(true);
  }, [clearCloseTimeout]);

  const closeSidebarSoon = React.useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, 120);
  }, [clearCloseTimeout]);

  React.useEffect(
    () => () => {
      clearCloseTimeout();
    },
    [clearCloseTimeout]
  );

  const handleSelectFile = (fileId: string): void => {
    const file = files.find((entry) => entry.id === fileId);
    if (!file) {
      return;
    }

    dispatch(setActiveFile(file.id));
    dispatch(setEditorCode(file.content));
    dispatch(setWorkspaceTab('code'));

    if (file.id === NIBBLES_FILE_ID && engineMode === 'interpreter-redux') {
      dispatch(setEngineMode('interpreter'));
    }

    window.editorCode = file.content;
    window.dispatchEvent(new CustomEvent('emulator:reset'));
  };

  return (
    <div
      className={`file-explorer-sidebar ${isOpen ? 'open' : ''}`}
      data-testid="file-explorer-sidebar-shell"
      style={{
        top: `${topOffset + 12}px`,
        bottom: `${bottomOffset + 12}px`,
      }}
    >
      <button
        aria-controls="file-explorer-sidebar"
        aria-expanded={isOpen}
        aria-label="Open file explorer"
        className="file-explorer-tab"
        data-testid="file-explorer-tab"
        onClick={() => setIsOpen((current) => !current)}
        onFocus={openSidebar}
        onMouseEnter={openSidebar}
        onMouseLeave={closeSidebarSoon}
        type="button"
      >
        <FontAwesomeIcon icon={faChevronRight} size="sm" />
        <span>Files</span>
      </button>

      <aside
        aria-label="File explorer"
        className="file-explorer-slideout pane-surface"
        data-testid="file-explorer-sidebar"
        id="file-explorer-sidebar"
        onMouseEnter={openSidebar}
        onMouseLeave={closeSidebarSoon}
      >
        <div className="file-explorer-header">
          <div className="pane-title-group">
            <p className="pane-eyebrow">Workspace</p>
            <h2 className="pane-title">Files</h2>
            <p className="pane-caption">Choose the source shown in the editor and used when you run.</p>
          </div>
        </div>

        <div className="file-explorer-groups">
          {groupedFiles.map((group) => (
            <section className="file-explorer-group" key={group.label}>
              <div className="file-explorer-group-label">
                <FontAwesomeIcon icon={faFolderTree} size="sm" />
                <span>{group.label}</span>
              </div>
              <div className="file-explorer-list">
                {group.items.map((file) => (
                  <button
                    aria-pressed={file.id === activeFileId}
                    className={`file-explorer-item ${file.id === activeFileId ? 'active' : ''}`}
                    data-testid={`file-explorer-item-${file.id}`}
                    key={file.id}
                    onClick={() => handleSelectFile(file.id)}
                    type="button"
                  >
                    <FontAwesomeIcon icon={faFileCode} size="sm" />
                    <span className="file-explorer-item-copy">
                      <span className="file-explorer-item-name">{file.name}</span>
                      <span className="file-explorer-item-path">{file.path}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default FileExplorerSidebar;
