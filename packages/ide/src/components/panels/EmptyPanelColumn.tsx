import React from 'react';
import { useDispatch } from 'react-redux';
import PanelKindMenuItems from '@/components/PanelKindMenuItems';
import ContextMenu from '@/components/menus/ContextMenu';
import type { MenuAnchor } from '@/components/menus/useMenuPosition';
import { createPanel, type AppDispatch, type PanelKind } from '@/store';

export default function EmptyPanelColumn({
  columnId,
  columnIndex,
}: {
  columnId: string;
  columnIndex: number;
}): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const [open, setOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<MenuAnchor | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const menuId = `panel-add-menu-${columnId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const columnNumber = columnIndex + 1;

  const addPanel = (kind: PanelKind): void => {
    dispatch(createPanel({ kind, target: { columnId } }));
    setOpen(false);
  };

  const toggleMenu = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    if (buttonRef.current) setMenuAnchor({ element: buttonRef.current, kind: 'element' });
    setOpen(true);
  };

  return (
    <>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Add panel to column ${columnNumber}`}
        className="empty-panel-column"
        onClick={toggleMenu}
        ref={buttonRef}
        type="button"
      >
        + Add panel
      </button>
      <ContextMenu
        anchor={menuAnchor}
        className="navbar-menu navbar-view-submenu panel-add-menu"
        id={menuId}
        label={`Add panel to column ${columnNumber}`}
        menuRef={menuRef}
        onDismiss={() => setOpen(false)}
        open={open}
        placement="block"
        relatedRefs={[buttonRef]}
        restoreFocusTo={buttonRef.current}
        testId={`panel-add-menu-column-${columnNumber}`}
      >
        <PanelKindMenuItems onSelect={addPanel} />
      </ContextMenu>
    </>
  );
}
