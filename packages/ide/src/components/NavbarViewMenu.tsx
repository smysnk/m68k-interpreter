import React from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronRight, faTableColumns } from '@fortawesome/free-solid-svg-icons';
import { useDispatch, useSelector } from 'react-redux';
import PanelKindMenuItems from '@/components/PanelKindMenuItems';
import { PANEL_PRESETS } from '@/panels/panelPresets';
import {
  closeAppMenu,
  createPanel,
  deleteView,
  renameView,
  resetToPreset,
  restoreView,
  saveView,
  selectPanelLayoutState,
  setColumnCount,
  type AppDispatch,
  type PanelKind,
} from '@/store';

export default function NavbarViewMenu(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const {
    activeLayout: layout,
    activeLayoutDirty,
    activeSourceViewId,
    userViews,
    userViewOrder,
  } = useSelector(selectPanelLayoutState);
  const [open, setOpen] = React.useState(false);
  const [activeSubmenu, setActiveSubmenu] = React.useState<
    'columns' | 'add-panel' | 'layouts' | 'saved-views' | null
  >(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({
    top: 0,
    left: 0,
    maxWidth: 260,
    submenuDirection: 'right' as 'left' | 'right',
  });

  React.useEffect(() => {
    if (!open) return;
    const updatePosition = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 272)),
        maxWidth: Math.max(220, Math.min(260, window.innerWidth - 24)),
        submenuDirection: rect.left + 260 + 300 + 24 <= window.innerWidth ? 'right' : 'left',
      });
    };
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !layerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (activeSubmenu) {
        setActiveSubmenu(null);
      } else {
        setOpen(false);
      }
    };
    updatePosition();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [activeSubmenu, open]);

  const toggle = (): void => {
    const nextOpen = !open;
    if (nextOpen) dispatch(closeAppMenu());
    setActiveSubmenu(null);
    setOpen(nextOpen);
  };
  const closeMenu = (): void => {
    setActiveSubmenu(null);
    setOpen(false);
  };
  const chooseColumnCount = (count: number): void => {
    dispatch(setColumnCount(count));
    closeMenu();
  };
  const addPanel = (kind: PanelKind): void => {
    dispatch(createPanel({ kind }));
    closeMenu();
  };
  const applyPreset = (presetId: Parameters<typeof resetToPreset>[0]): void => {
    dispatch(resetToPreset(presetId));
    closeMenu();
  };
  const saveCurrentView = (): void => {
    if (!activeSourceViewId || !userViews[activeSourceViewId]) return;
    dispatch(saveView({ id: activeSourceViewId, name: userViews[activeSourceViewId].name }));
    closeMenu();
  };
  const saveViewAs = (): void => {
    const name = window.prompt('Save workspace view as', layout.name);
    if (name) {
      dispatch(saveView({ name }));
      closeMenu();
    }
  };
  const restoreSavedView = (viewId: string): void => {
    dispatch(restoreView(viewId));
    closeMenu();
  };

  return (
    <div className="navbar-menu-wrap navbar-view-menu-wrap">
      <button
        aria-controls="navbar-view-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open view menu"
        className={`btn-toolbar navbar-menu-button navbar-view-menu-button ${open ? 'active' : ''}`}
        data-testid="navbar-view-menu-button"
        onClick={toggle}
        ref={buttonRef}
        type="button"
      >
        <FontAwesomeIcon icon={faTableColumns} size="sm" />
        <span>View</span>
      </button>
      {open
        ? createPortal(
            <div
              aria-label="View options"
              className="navbar-menu navbar-view-menu"
              data-testid="navbar-view-menu"
              id="navbar-view-menu"
              ref={layerRef}
              role="menu"
              style={{
                top: position.top,
                left: position.left,
                maxWidth: `${position.maxWidth}px`,
              }}
            >
              <button
                aria-controls="navbar-view-columns-submenu"
                aria-expanded={activeSubmenu === 'columns'}
                aria-haspopup="menu"
                aria-label="Columns"
                className={`navbar-menu-item ${activeSubmenu === 'columns' ? 'active' : ''}`}
                onClick={() => setActiveSubmenu('columns')}
                onFocus={() => setActiveSubmenu('columns')}
                onMouseEnter={() => setActiveSubmenu('columns')}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Columns</span>
                  <span className="navbar-menu-subtitle">
                    {layout.columnCount} {layout.columnCount === 1 ? 'column' : 'columns'}
                  </span>
                </span>
                <span className="navbar-menu-meta">
                  <FontAwesomeIcon icon={faChevronRight} size="sm" />
                </span>
              </button>
              <button
                aria-controls="navbar-view-add-panel-submenu"
                aria-expanded={activeSubmenu === 'add-panel'}
                aria-haspopup="menu"
                aria-label="Add Panel"
                className={`navbar-menu-item ${activeSubmenu === 'add-panel' ? 'active' : ''}`}
                onClick={() => setActiveSubmenu('add-panel')}
                onFocus={() => setActiveSubmenu('add-panel')}
                onMouseEnter={() => setActiveSubmenu('add-panel')}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Add Panel</span>
                  <span className="navbar-menu-subtitle">Choose a panel type</span>
                </span>
                <span className="navbar-menu-meta">
                  <FontAwesomeIcon icon={faChevronRight} size="sm" />
                </span>
              </button>
              <button
                aria-controls="navbar-view-layouts-submenu"
                aria-expanded={activeSubmenu === 'layouts'}
                aria-haspopup="menu"
                aria-label="Layouts"
                className={`navbar-menu-item ${activeSubmenu === 'layouts' ? 'active' : ''}`}
                onClick={() => setActiveSubmenu('layouts')}
                onFocus={() => setActiveSubmenu('layouts')}
                onMouseEnter={() => setActiveSubmenu('layouts')}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Layouts</span>
                  <span className="navbar-menu-subtitle">
                    {layout.name}{activeLayoutDirty ? ' (modified)' : ''}
                  </span>
                </span>
                <span className="navbar-menu-meta">
                  <FontAwesomeIcon icon={faChevronRight} size="sm" />
                </span>
              </button>
              <button
                aria-controls="navbar-view-saved-views-submenu"
                aria-expanded={activeSubmenu === 'saved-views'}
                aria-haspopup="menu"
                aria-label="Saved Views"
                className={`navbar-menu-item ${activeSubmenu === 'saved-views' ? 'active' : ''}`}
                onClick={() => setActiveSubmenu('saved-views')}
                onFocus={() => setActiveSubmenu('saved-views')}
                onMouseEnter={() => setActiveSubmenu('saved-views')}
                role="menuitem"
                type="button"
              >
                <span className="navbar-menu-copy">
                  <span className="navbar-menu-title">Saved Views</span>
                  <span className="navbar-menu-subtitle">
                    {userViewOrder.length
                      ? `${userViewOrder.length} saved ${userViewOrder.length === 1 ? 'view' : 'views'}`
                      : 'Save or restore a workspace'}
                  </span>
                </span>
                <span className="navbar-menu-meta">
                  <FontAwesomeIcon icon={faChevronRight} size="sm" />
                </span>
              </button>

              {activeSubmenu === 'columns' ? (
                <div
                  aria-label="Column count"
                  className={`navbar-submenu navbar-view-submenu navbar-submenu-${position.submenuDirection}`}
                  data-testid="navbar-view-columns-submenu"
                  id="navbar-view-columns-submenu"
                  role="menu"
                >
                  <span className="navbar-view-menu-heading">Column count</span>
                  <div className="navbar-view-menu-columns">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      aria-checked={layout.columnCount === count}
                      aria-label={`${count} ${count === 1 ? 'column' : 'columns'}`}
                      className={`navbar-view-column-item ${layout.columnCount === count ? 'active' : ''}`}
                      key={count}
                      onClick={() => chooseColumnCount(count)}
                      role="menuitemradio"
                      type="button"
                    >
                      <span>{count}</span>
                      {layout.columnCount === count ? <FontAwesomeIcon icon={faCheck} size="xs" /> : null}
                    </button>
                  ))}
                  </div>
                </div>
              ) : null}

              {activeSubmenu === 'add-panel' ? (
                <div
                  aria-label="Add panel"
                  className={`navbar-submenu navbar-view-submenu navbar-submenu-${position.submenuDirection}`}
                  data-testid="navbar-view-add-panel-submenu"
                  id="navbar-view-add-panel-submenu"
                  role="menu"
                >
                  <PanelKindMenuItems onSelect={addPanel} />
                </div>
              ) : null}

              {activeSubmenu === 'layouts' ? (
                <div
                  aria-label="Workspace layouts"
                  className={`navbar-submenu navbar-view-submenu navbar-submenu-${position.submenuDirection}`}
                  data-testid="navbar-view-layouts-submenu"
                  id="navbar-view-layouts-submenu"
                  role="menu"
                >
                  {PANEL_PRESETS.map((preset) => (
                    <button
                      aria-label={`Apply ${preset.name} layout`}
                      className="navbar-menu-item"
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      role="menuitem"
                      type="button"
                    >
                      <span className="navbar-menu-copy">
                        <span className="navbar-menu-title">{preset.name}</span>
                        <span className="navbar-menu-subtitle">{preset.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {activeSubmenu === 'saved-views' ? (
                <div
                  aria-label="Saved workspace views"
                  className={`navbar-submenu navbar-view-submenu navbar-submenu-${position.submenuDirection}`}
                  data-testid="navbar-view-saved-views-submenu"
                  id="navbar-view-saved-views-submenu"
                  role="menu"
                >
                  {activeSourceViewId && userViews[activeSourceViewId] && activeLayoutDirty ? (
                    <button className="navbar-menu-item" onClick={saveCurrentView} role="menuitem" type="button">
                      <span className="navbar-menu-copy">
                        <span className="navbar-menu-title">Save current view</span>
                        <span className="navbar-menu-subtitle">Update {userViews[activeSourceViewId].name}</span>
                      </span>
                    </button>
                  ) : null}
                  <button className="navbar-menu-item" onClick={saveViewAs} role="menuitem" type="button">
                    <span className="navbar-menu-copy">
                      <span className="navbar-menu-title">Save view as…</span>
                      <span className="navbar-menu-subtitle">Create a reusable workspace view</span>
                    </span>
                  </button>
                  {userViewOrder.length ? <span className="navbar-view-menu-subheading">Saved views</span> : (
                    <span className="navbar-view-menu-empty">No saved views yet</span>
                  )}
                  {userViewOrder.map((id) => {
                    const view = userViews[id];
                    if (!view) return null;
                    return (
                      <span className="navbar-view-saved-row" key={id}>
                        <button
                          aria-current={activeSourceViewId === id}
                          aria-label={`Restore ${view.name} layout`}
                          className="navbar-menu-item"
                          onClick={() => restoreSavedView(id)}
                          role="menuitem"
                          type="button"
                        >
                          <span className="navbar-menu-copy">
                            <span className="navbar-menu-title">{view.name}</span>
                          </span>
                        </button>
                        <button
                          aria-label={`Rename ${view.name}`}
                          className="navbar-view-row-action"
                          onClick={() => {
                            const name = window.prompt('Rename workspace view', view.name);
                            if (name) dispatch(renameView({ viewId: id, name }));
                          }}
                          type="button"
                        >
                          ✎
                        </button>
                        <button
                          aria-label={`Delete ${view.name}`}
                          className="navbar-view-row-action"
                          onClick={() => dispatch(deleteView(id))}
                          type="button"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
