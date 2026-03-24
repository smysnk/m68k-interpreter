import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Output from './Output';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('Output', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
  });

  it('renders the current execution state from the store', () => {
    renderWithIdeProviders(<Output />);

    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Last instruction: Ready')).toBeInTheDocument();
  });

  it('trims semicolon comments from the displayed last instruction', () => {
    useEmulatorStore.getState().setExecutionState({
      lastInstruction: 'MOVE.B #1,D0 ; increment the accumulator',
    });

    renderWithIdeProviders(<Output />);

    expect(screen.getByText('Last instruction: MOVE.B #1,D0')).toBeInTheDocument();
    expect(screen.queryByText(/increment the accumulator/i)).not.toBeInTheDocument();
  });

  it('renders runtime issues when errors or exceptions are present', () => {
    useEmulatorStore.getState().setExecutionState({
      errors: ['Stack underflow'],
      exception: 'Address error',
    });

    renderWithIdeProviders(<Output />);

    expect(screen.getByText('Review the current runtime issues below.')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('Stack underflow')).toBeInTheDocument();
    expect(screen.getByText('Exception')).toBeInTheDocument();
    expect(screen.getByText('Address error')).toBeInTheDocument();
  });
});
