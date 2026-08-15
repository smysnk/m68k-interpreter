import React from 'react';

export interface MenuItemProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  label: React.ReactNode;
  meta?: React.ReactNode;
  subtitle?: React.ReactNode;
}

const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { className = '', label, meta, role = 'menuitem', subtitle, type = 'button', ...props },
  ref
) {
  return (
    <button
      {...props}
      className={`navbar-menu-item ${className}`.trim()}
      ref={ref}
      role={role}
      type={type}
    >
      <span className="navbar-menu-copy">
        <span className="navbar-menu-title">{label}</span>
        {subtitle ? <span className="navbar-menu-subtitle">{subtitle}</span> : null}
      </span>
      {meta ? (
        <span aria-hidden="true" className="navbar-menu-meta">
          {meta}
        </span>
      ) : null}
    </button>
  );
});

export default MenuItem;
