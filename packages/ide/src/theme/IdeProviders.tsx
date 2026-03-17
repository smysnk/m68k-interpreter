import React from 'react';
import { Provider, useSelector } from 'react-redux';
import { ThemeProvider } from 'styled-components';
import { ideStore, type RootState, type AppStore } from '@/store';
import { editorThemes } from '@/theme/editorThemeRegistry';
import { GlobalStyle } from '@/theme/GlobalStyle';

const ThemeBridge: React.FC<React.PropsWithChildren> = ({ children }) => {
  const editorTheme = useSelector((state: RootState) => state.settings.editorTheme);
  const theme = editorThemes[editorTheme];

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      {children}
    </ThemeProvider>
  );
};

type IdeProvidersProps = React.PropsWithChildren<{
  store?: AppStore;
}>;

export const IdeProviders: React.FC<IdeProvidersProps> = ({ children, store = ideStore }) => (
  <Provider store={store}>
    <ThemeBridge>{children}</ThemeBridge>
  </Provider>
);
