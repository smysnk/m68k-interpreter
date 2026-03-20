import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
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
    expect(screen.getByTitle(/run program/i)).toBeInTheDocument();
    expect(screen.getByTitle(/reset/i)).toBeInTheDocument();
    expect(screen.getByTitle(/step/i)).toBeInTheDocument();
    expect(screen.getByTitle(/undo/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Delay (s)')).toHaveValue(0);
    expect(screen.getByLabelText('Speed (x)')).toHaveValue(1);
  });

  it('trims semicolon comments from the displayed last instruction', () => {
    useEmulatorStore.getState().setExecutionState({
      lastInstruction: 'MOVE.B #1,D0 ; increment the accumulator',
    });

    renderWithIdeProviders(<Output />);

    expect(screen.getByText('MOVE.B #1,D0')).toBeInTheDocument();
    expect(screen.queryByText(/increment the accumulator/i)).not.toBeInTheDocument();
  });

  it('dispatches execution events from the last instruction controls', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderWithIdeProviders(<Output />);

    fireEvent.click(screen.getByTitle(/run program/i));
    fireEvent.click(screen.getByTitle(/step/i));
    fireEvent.click(screen.getByTitle(/undo/i));
    fireEvent.click(screen.getByTitle(/reset/i));

    const dispatchedTypes = dispatchSpy.mock.calls.map(([event]) => event.type);

    expect(dispatchedTypes).toEqual([
      'emulator:run',
      'emulator:focus-terminal',
      'emulator:step',
      'emulator:focus-terminal',
      'emulator:undo',
      'emulator:reset',
    ]);
  });
});
