import { useLayoutEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setChromeOffsets, type AppDispatch, type RootState } from '@/store';

export function useChromeMeasurementController() {
  const dispatch = useDispatch<AppDispatch>();
  const chromeOffsets = useSelector((state: RootState) => state.uiShell.chromeOffsets);
  const navbarShellRef = useRef<HTMLDivElement | null>(null);
  const statusBarShellRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const updateChromeOffsets = (): void => {
      const top = navbarShellRef.current?.getBoundingClientRect().height ?? chromeOffsets.top;
      const bottom = statusBarShellRef.current?.getBoundingClientRect().height ?? chromeOffsets.bottom;

      if (chromeOffsets.top === top && chromeOffsets.bottom === bottom) {
        return;
      }

      dispatch(setChromeOffsets({ top, bottom }));
    };

    updateChromeOffsets();
    window.addEventListener('resize', updateChromeOffsets);

    return () => {
      window.removeEventListener('resize', updateChromeOffsets);
    };
  }, [chromeOffsets.bottom, chromeOffsets.top, dispatch]);

  return {
    navbarShellRef,
    statusBarShellRef,
  };
}
