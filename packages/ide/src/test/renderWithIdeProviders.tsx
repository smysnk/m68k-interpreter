import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { IdeProviders } from '@/theme/IdeProviders';
import { ideStore, type AppStore } from '@/store';

type RenderWithIdeProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  store?: AppStore;
};

export function renderWithIdeProviders(
  ui: React.ReactElement,
  { store = ideStore, ...options }: RenderWithIdeProvidersOptions = {}
) {
  return render(ui, {
    wrapper: ({ children }) => <IdeProviders store={store}>{children}</IdeProviders>,
    ...options,
  });
}
