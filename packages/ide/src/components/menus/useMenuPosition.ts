import React from 'react';

export type MenuAnchor =
  { kind: 'point'; x: number; y: number } | { element: HTMLElement; kind: 'element' };

export type MenuPlacement = 'block' | 'inline' | 'point';

export interface MenuPosition {
  left: number;
  maxHeight: number;
  maxWidth: number;
  top: number;
}

const DEFAULT_POSITION: MenuPosition = {
  left: 12,
  maxHeight: 320,
  maxWidth: 300,
  top: 12,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function calculateMenuPosition({
  anchor,
  desiredHeight,
  desiredWidth,
  gap = 8,
  gutter = 12,
  placement,
  viewportHeight,
  viewportWidth,
}: {
  anchor: MenuAnchor;
  desiredHeight: number;
  desiredWidth: number;
  gap?: number;
  gutter?: number;
  placement: MenuPlacement;
  viewportHeight: number;
  viewportWidth: number;
}): MenuPosition {
  const maxWidth = Math.max(1, viewportWidth - gutter * 2);
  const width = Math.min(desiredWidth, maxWidth);
  const height = Math.min(desiredHeight, Math.max(1, viewportHeight - gutter * 2));
  let left = gutter;
  let top = gutter;

  if (anchor.kind === 'point') {
    left = anchor.x + width <= viewportWidth - gutter ? anchor.x : anchor.x - width;
    const roomBelow = viewportHeight - anchor.y - gutter;
    const roomAbove = anchor.y - gutter;
    top = roomBelow < height && roomAbove > roomBelow ? anchor.y - height : anchor.y;
  } else {
    const rect = anchor.element.getBoundingClientRect();
    if (placement === 'inline') {
      left = rect.right + gap;
      if (left + width > viewportWidth - gutter) left = rect.left - gap - width;
      top = rect.top;
    } else {
      left = rect.left + (rect.width - width) / 2;
      const roomBelow = viewportHeight - rect.bottom - gutter;
      const roomAbove = rect.top - gutter;
      top =
        roomBelow < height && roomAbove > roomBelow ? rect.top - gap - height : rect.bottom + gap;
    }
  }

  left = clamp(left, gutter, viewportWidth - width - gutter);
  top = clamp(top, gutter, viewportHeight - height - gutter);

  return {
    left,
    maxHeight: Math.max(1, viewportHeight - top - gutter),
    maxWidth,
    top,
  };
}

export function useMenuPosition({
  anchor,
  menuRef,
  open,
  placement,
  width = 300,
}: {
  anchor: MenuAnchor | null;
  menuRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  placement: MenuPlacement;
  width?: number;
}): MenuPosition {
  const [position, setPosition] = React.useState<MenuPosition>(DEFAULT_POSITION);

  const updatePosition = React.useCallback((): void => {
    if (!open || !anchor) return;
    const rect = menuRef.current?.getBoundingClientRect();
    setPosition(
      calculateMenuPosition({
        anchor,
        desiredHeight: rect?.height || 360,
        desiredWidth: rect?.width || width,
        placement,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      })
    );
  }, [anchor, menuRef, open, placement, width]);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return position;
}
