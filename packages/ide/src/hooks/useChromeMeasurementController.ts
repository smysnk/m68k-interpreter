import { useLayoutEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setChromeOffsets, type AppDispatch, type RootState } from '@/store';

export function useChromeMeasurementController() {
  const dispatch = useDispatch<AppDispatch>();
  const chromeOffsets = useSelector((state: RootState) => state.uiShell.chromeOffsets);
  const chromeOffsetsRef = useRef(chromeOffsets);
  const navbarShellRef = useRef<HTMLDivElement | null>(null);
  const statusBarShellRef = useRef<HTMLDivElement | null>(null);
  chromeOffsetsRef.current = chromeOffsets;

  useLayoutEffect(() => {
    const updateChromeOffsets = (): void => {
      const currentOffsets = chromeOffsetsRef.current;
      const top = navbarShellRef.current?.getBoundingClientRect().height ?? currentOffsets.top;
      const bottom = statusBarShellRef.current?.getBoundingClientRect().height ?? currentOffsets.bottom;

      if (currentOffsets.top === top && currentOffsets.bottom === bottom) {
        return;
      }

      chromeOffsetsRef.current = { top, bottom };
      dispatch(setChromeOffsets({ top, bottom }));
    };

    updateChromeOffsets();
    window.addEventListener('resize', updateChromeOffsets);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateChromeOffsets);
    if (navbarShellRef.current) {
      resizeObserver?.observe(navbarShellRef.current);
    }
    if (statusBarShellRef.current) {
      resizeObserver?.observe(statusBarShellRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateChromeOffsets);
      resizeObserver?.disconnect();
    };
  }, [dispatch]);

  return {
    navbarShellRef,
    statusBarShellRef,
  };
}
