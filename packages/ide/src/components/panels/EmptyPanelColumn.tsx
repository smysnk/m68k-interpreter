import React from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import PanelKindMenuItems from '@/components/PanelKindMenuItems';
import { createPanel, type AppDispatch, type PanelKind } from '@/store';

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

export default function EmptyPanelColumn({
  columnId,
  columnIndex,
}: {
  columnId: string;
  columnIndex: number;
}): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<MenuPosition>({
    top: 12,
    left: 12,
    maxHeight: 320,
  });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const menuId = `panel-add-menu-${columnId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const columnNumber = columnIndex + 1;

  const updatePosition = React.useCallback((): void => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const gutter = 12;
    const gap = 8;
    const menuWidth = Math.min(300, window.innerWidth - gutter * 2);
    const desiredHeight = Math.min(
      menuRef.current?.getBoundingClientRect().height || 360,
      window.innerHeight - gutter * 2,
    );
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const openAbove = spaceBelow < desiredHeight && rect.top - gutter > spaceBelow;
    const top = openAbove ? Math.max(gutter, rect.top - gap - desiredHeight) : rect.bottom + gap;

    setPosition({
      top,
      left: Math.max(
        gutter,
        Math.min(rect.left + (rect.width - menuWidth) / 2, window.innerWidth - menuWidth - gutter)
      ),
      maxHeight: openAbove
        ? Math.max(120, rect.top - gap - gutter)
        : Math.max(120, window.innerHeight - top - gutter),
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;

    updatePosition();
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const addPanel = (kind: PanelKind): void => {
    dispatch(createPanel({ kind, target: { columnId } }));
    setOpen(false);
  };

  const toggleMenu = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    updatePosition();
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
      {open
        ? createPortal(
            <div
              aria-label={`Add panel to column ${columnNumber}`}
              className="navbar-menu navbar-view-submenu panel-add-menu"
              data-testid={`panel-add-menu-column-${columnNumber}`}
              id={menuId}
              ref={menuRef}
              role="menu"
              style={{
                top: position.top,
                left: position.left,
                maxHeight: position.maxHeight,
              }}
            >
              <PanelKindMenuItems onSelect={addPanel} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
