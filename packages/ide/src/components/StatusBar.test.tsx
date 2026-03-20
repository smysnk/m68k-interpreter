import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { nibblesSource } from '@/programs/nibbles';
import { useEmulatorStore } from '@/stores/emulatorStore';
import {
  ideStore,
  resetSettingsState,
  setEngineMode,
  setEditorCursorPosition,
  setEditorCode,
  setWorkspaceTab,
} from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('StatusBar', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetSettingsState());
  });

  it('renders default runtime and terminal information', () => {
    renderWithIdeProviders(<StatusBar />);

    expect(screen.getByLabelText('IDE status bar')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /interpreter engine/i })).toHaveTextContent('Interpreter');
    expect(screen.getByText(/Terminal: 80x25/)).toBeInTheDocument();
    expect(screen.getByText(/Cursor 1:1/)).toBeInTheDocument();
    expect(screen.getByText(/Stop: idle/)).toBeInTheDocument();
  });

  it('shows editor line and column when the code view is active', () => {
    ideStore.dispatch(setWorkspaceTab('code'));
    ideStore.dispatch(setEditorCursorPosition({ line: 12, column: 7 }));

    renderWithIdeProviders(<StatusBar />);

    expect(screen.getByText(/View: Code/)).toBeInTheDocument();
    expect(screen.getByText(/Ln 12, Col 7/)).toBeInTheDocument();
  });

  it('identifies the nibbles program when it is loaded', () => {
    useEmulatorStore.getState().setEditorCode(nibblesSource);
    ideStore.dispatch(setEditorCode(nibblesSource));

    renderWithIdeProviders(<StatusBar />);

    expect(screen.queryByText(/Program:/)).not.toBeInTheDocument();
  });

  it('opens the engine menu upward and updates redux when a new engine is selected', () => {
    const resetListener = vi.fn();
    window.addEventListener('emulator:reset', resetListener);

    renderWithIdeProviders(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: /interpreter engine/i }));

    const listbox = screen.getByRole('listbox', { name: /interpreter engine options/i });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /interpreter redux/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /interpreter redux/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter-redux');
    expect(screen.queryByRole('listbox', { name: /interpreter engine options/i })).not.toBeInTheDocument();
    expect(resetListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('emulator:reset', resetListener);
  });

  it('can switch back to the regular interpreter engine', () => {
    const resetListener = vi.fn();
    window.addEventListener('emulator:reset', resetListener);
    ideStore.dispatch(setEngineMode('interpreter-redux'));

    renderWithIdeProviders(<StatusBar />);

    fireEvent.click(screen.getByRole('button', { name: /interpreter engine/i }));
    fireEvent.click(screen.getByRole('option', { name: /^Interpreter$/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter');
    expect(screen.getByRole('button', { name: /interpreter engine/i })).toHaveTextContent('Interpreter');
    expect(resetListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('emulator:reset', resetListener);
  });
});
