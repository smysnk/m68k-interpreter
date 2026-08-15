import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PanelKindMenuItems from '@/components/PanelKindMenuItems';
import ContextMenu from '@/components/menus/ContextMenu';
import MenuItem from '@/components/menus/MenuItem';
import type { MenuAnchor } from '@/components/menus/useMenuPosition';
import { fitPanelCreateTargetForKind } from '@/panels/panelDragModel';
import { getPanelDomIds } from '@/panels/panelRegistry';
import {
  createPanel,
  selectActivePanelLayout,
  type AppDispatch,
  type PanelCreateTarget,
  type PanelKind,
} from '@/store';

export interface PendingPanelContextMenu {
  anchor: Extract<MenuAnchor, { kind: 'point' }>;
  restoreFocusTo: HTMLElement | null;
  target: PanelCreateTarget;
}

export default function PanelWorkspaceContextMenu({
  onClose,
  pending,
  workspaceElement,
}: {
  onClose: () => void;
  pending: PendingPanelContextMenu | null;
  workspaceElement: HTMLElement | null;
}): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const layout = useSelector(selectActivePanelLayout);
  const [submenuAnchor, setSubmenuAnchor] = React.useState<MenuAnchor | null>(null);
  const rootMenuRef = React.useRef<HTMLDivElement | null>(null);
  const addPanelItemRef = React.useRef<HTMLButtonElement | null>(null);
  const submenuRef = React.useRef<HTMLDivElement | null>(null);
  const rootMenuId = 'panel-workspace-context-menu';
  const submenuId = 'panel-workspace-add-panel-submenu';

  const closeAll = React.useCallback((): void => {
    setSubmenuAnchor(null);
    onClose();
  }, [onClose]);

  const closeSubmenu = React.useCallback((): void => {
    setSubmenuAnchor(null);
    window.requestAnimationFrame(() => addPanelItemRef.current?.focus());
  }, []);

  const openSubmenu = React.useCallback((): void => {
    if (addPanelItemRef.current) {
      setSubmenuAnchor({ element: addPanelItemRef.current, kind: 'element' });
    }
  }, []);

  React.useEffect(() => {
    if (!pending) setSubmenuAnchor(null);
  }, [pending]);

  const addPanel = (kind: PanelKind): void => {
    if (!pending) return;
    const workspaceRect = workspaceElement?.getBoundingClientRect();
    const target = workspaceRect
      ? fitPanelCreateTargetForKind({
          kind,
          target: pending.target,
          workspaceHeight: workspaceRect.height,
          workspaceWidth: workspaceRect.width,
        })
      : pending.target;
    const expectedPanelId = `panel-${kind}-${layout.nextInstanceSequence}`;
    dispatch(createPanel({ kind, target }));
    closeAll();
    window.requestAnimationFrame(() => {
      window.document.getElementById(getPanelDomIds(expectedPanelId).frameId)?.focus();
    });
  };

  return (
    <>
      <ContextMenu
        anchor={pending?.anchor ?? null}
        className="navbar-menu panel-workspace-context-menu"
        id={rootMenuId}
        label="Panel workspace actions"
        menuRef={rootMenuRef}
        onDismiss={closeAll}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' && document.activeElement === addPanelItemRef.current) {
            event.preventDefault();
            openSubmenu();
          }
        }}
        open={Boolean(pending)}
        placement="point"
        relatedRefs={[submenuRef]}
        restoreFocusTo={pending?.restoreFocusTo}
        testId="panel-workspace-context-menu"
        width={240}
      >
        <MenuItem
          aria-controls={submenuId}
          aria-expanded={Boolean(submenuAnchor)}
          aria-haspopup="menu"
          label="Add a panel"
          meta="›"
          onClick={openSubmenu}
          onMouseEnter={openSubmenu}
          ref={addPanelItemRef}
        />
      </ContextMenu>
      <ContextMenu
        anchor={submenuAnchor}
        className="navbar-menu navbar-view-submenu panel-add-menu panel-workspace-context-submenu"
        id={submenuId}
        label="Add a panel"
        menuRef={submenuRef}
        onDismiss={closeAll}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            closeSubmenu();
          }
        }}
        open={Boolean(pending && submenuAnchor)}
        placement="inline"
        relatedRefs={[rootMenuRef]}
      >
        <PanelKindMenuItems onSelect={addPanel} />
      </ContextMenu>
    </>
  );
}
