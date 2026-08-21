import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileCode, faFolderTree } from '@fortawesome/free-solid-svg-icons';
import {
  selectFileExplorerModel,
  setActiveFile,
  setEditorCode,
  revealPanelKind,
  type AppDispatch,
} from '@/store';

interface FileExplorerSidebarProps {
  open: boolean;
  onClose: () => void;
}

const FileExplorerSidebar: React.FC<FileExplorerSidebarProps> = ({ open, onClose }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { files, activeFileId, chromeOffsets, groupedFiles } = useSelector(selectFileExplorerModel);
  const sidebarRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const trigger = document.querySelector<HTMLElement>(
        '[aria-controls="file-explorer-sidebar"]'
      );
      if (sidebarRef.current?.contains(target) || trigger?.contains(target)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  const handleSelectFile = (fileId: string): void => {
    const file = files.find((entry) => entry.id === fileId);
    if (!file) {
      return;
    }

    onClose();
    dispatch(setActiveFile(file.id));
    dispatch(setEditorCode(file.content));
    dispatch(revealPanelKind('code'));
  };

  return (
    <div
      className={`file-explorer-sidebar ${open ? 'open' : ''}`}
      data-testid="file-explorer-sidebar-shell"
      style={{
        top: `${chromeOffsets.top}px`,
        bottom: `${chromeOffsets.bottom}px`,
      }}
    >
      <aside
        aria-label="File explorer"
        aria-hidden={!open}
        className="file-explorer-slideout pane-surface"
        data-testid="file-explorer-sidebar"
        id="file-explorer-sidebar"
        inert={!open}
        ref={sidebarRef}
      >
        <div className="file-explorer-header">
          <div className="pane-title-group">
            <p className="pane-eyebrow">Workspace</p>
            <h2 className="pane-title">Files</h2>
            <p className="pane-caption">
              Choose the source shown in the editor and used when you run.
            </p>
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
