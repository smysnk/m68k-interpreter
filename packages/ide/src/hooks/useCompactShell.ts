import React from 'react';

export const COMPACT_SHELL_MAX_WIDTH = 960;

function readIsCompactShell(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.innerWidth <= COMPACT_SHELL_MAX_WIDTH;
}

export function useCompactShell(): boolean {
  const [isCompactShell, setIsCompactShell] = React.useState<boolean>(() => readIsCompactShell());

  React.useEffect(() => {
    const updateCompactShell = (): void => {
      setIsCompactShell(readIsCompactShell());
    };

    updateCompactShell();
    window.addEventListener('resize', updateCompactShell);

    return () => {
      window.removeEventListener('resize', updateCompactShell);
    };
  }, []);

  return isCompactShell;
}
