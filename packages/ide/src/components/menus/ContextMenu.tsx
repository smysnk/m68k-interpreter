import React from 'react';
import { createPortal } from 'react-dom';
import { type MenuAnchor, type MenuPlacement, useMenuPosition } from './useMenuPosition';

export type MenuDismissReason = 'escape' | 'outside' | 'tab';

function directMenuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]')
  ).filter(
    (item) =>
      item.closest('[role="menu"]') === menu &&
      !item.disabled &&
      item.getAttribute('aria-disabled') !== 'true'
  );
}

export default function ContextMenu({
  anchor,
  autoFocus = true,
  children,
  className = '',
  id,
  label,
  menuRef,
  onDismiss,
  onKeyDown,
  open,
  placement,
  relatedRefs = [],
  restoreFocusTo,
  testId,
  width = 300,
}: {
  anchor: MenuAnchor | null;
  autoFocus?: boolean;
  children: React.ReactNode;
  className?: string;
  id: string;
  label: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onDismiss: (reason: MenuDismissReason) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  open: boolean;
  placement: MenuPlacement;
  relatedRefs?: ReadonlyArray<React.RefObject<HTMLElement | null>>;
  restoreFocusTo?: HTMLElement | null;
  testId?: string;
  width?: number;
}): React.ReactElement | null {
  const position = useMenuPosition({ anchor, menuRef, open, placement, width });

  React.useEffect(() => {
    if (!open) return;
    const focusFrame = autoFocus
      ? window.requestAnimationFrame(() => directMenuItems(menuRef.current)[0]?.focus())
      : null;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (relatedRefs.some((ref) => ref.current?.contains(target))) return;
      onDismiss('outside');
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss('escape');
      restoreFocusTo?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [autoFocus, menuRef, onDismiss, open, relatedRefs, restoreFocusTo]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      aria-label={label}
      className={`context-menu-surface ${className}`.trim()}
      data-testid={testId}
      id={id}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const items = directMenuItems(event.currentTarget);
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          const nextIndex =
            currentIndex < 0
              ? direction > 0
                ? 0
                : items.length - 1
              : (currentIndex + direction + items.length) % items.length;
          items[nextIndex]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
        } else if (event.key === 'Tab') {
          onDismiss('tab');
        }
      }}
      ref={menuRef}
      role="menu"
      style={{
        left: position.left,
        maxHeight: position.maxHeight,
        maxWidth: position.maxWidth,
        top: position.top,
        width,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
