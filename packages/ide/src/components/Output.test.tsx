import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Output from './Output';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, resetSettingsState } from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('Output', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
  });

  it('renders the current execution state from the store', () => {
    renderWithIdeProviders(<Output />);

    expect(screen.getByText('Last Instruction')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByLabelText('Delay (s)')).toHaveValue(0);
    expect(screen.getByLabelText('Speed (x)')).toHaveValue(1);
    expect(screen.getByText(/Stop: idle/)).toBeInTheDocument();
  });
});
