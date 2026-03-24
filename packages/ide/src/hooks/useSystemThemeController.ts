import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from 'styled-components';
import { ideStore, syncSystemTheme, type AppDispatch, type RootState } from '@/store';
import { editorThemes } from '@/theme/editorThemeRegistry';

export function useSystemThemeController(): void {
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const followSystemTheme = useSelector((state: RootState) => state.settings.followSystemTheme);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery || !followSystemTheme) {
      return;
    }

    const handleChange = (event: MediaQueryListEvent): void => {
      const nextMode = event.matches ? 'dark' : 'light';
      const activeMode = editorThemes[ideStore.getState().settings.editorTheme].surfaceMode;
      if (ideStore.getState().settings.followSystemTheme && activeMode !== nextMode) {
        dispatch(syncSystemTheme(nextMode));
      }
    };

    const nextMode = mediaQuery.matches ? 'dark' : 'light';
    if (theme.surfaceMode !== nextMode) {
      dispatch(syncSystemTheme(nextMode));
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, [dispatch, followSystemTheme, theme.surfaceMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme.surfaceMode;
    document.documentElement.style.colorScheme = theme.surfaceMode;
  }, [theme.surfaceMode]);
}
