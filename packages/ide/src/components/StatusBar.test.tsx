import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { useEmulatorStore } from '@/stores/emulatorStore';
import {
  ideStore,
  resetFilesState,
  resetSettingsState,
  setEngineMode,
  setEditorCursorPosition,
  setWorkspaceTab,
} from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('StatusBar', () => {
  beforeEach(() => {
    useEmulatorStore.getState().reset();
    ideStore.dispatch(resetFilesState());
    ideStore.dispatch(resetSettingsState());
  });

  it('renders default runtime and terminal information', () => {
    renderWithIdeProviders(<StatusBar />);

    expect(screen.getByLabelText('IDE status bar')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /interpreter engine/i })).toHaveTextContent('Interpreter');
    expect(screen.queryByText(/Inspector:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Help:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Terminal:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Speed:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Delay:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Cursor 1:1/)).toBeInTheDocument();
    expect(screen.getByText(/Stop: idle/)).toBeInTheDocument();
  });

  it('shows editor line and column when the code view is active', () => {
    ideStore.dispatch(setWorkspaceTab('code'));
    ideStore.dispatch(setEditorCursorPosition({ line: 12, column: 7 }));

    renderWithIdeProviders(<StatusBar />);

    expect(screen.getByText(/Ln 12, Col 7/)).toBeInTheDocument();
  });

  it('keeps the status bar focused on runtime info rather than program labels', () => {
    renderWithIdeProviders(<StatusBar />);

    expect(screen.queryByText(/Program:/)).not.toBeInTheDocument();
  });

  it('opens the engine menu upward and updates redux when a new engine is selected', () => {
    renderWithIdeProviders(<StatusBar />);
    const startingResetCount = ideStore.getState().emulator.runtimeIntents.reset;

    fireEvent.click(screen.getByRole('button', { name: /interpreter engine/i }));

    const listbox = screen.getByRole('listbox', { name: /interpreter engine options/i });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /interpreter redux/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /interpreter redux/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter-redux');
    expect(ideStore.getState().emulator.runtimeIntents.reset).toBe(startingResetCount + 1);
    expect(screen.queryByRole('listbox', { name: /interpreter engine options/i })).not.toBeInTheDocument();
  });

  it('can switch back to the regular interpreter engine', () => {
    ideStore.dispatch(setEngineMode('interpreter-redux'));

    renderWithIdeProviders(<StatusBar />);
    const startingResetCount = ideStore.getState().emulator.runtimeIntents.reset;

    fireEvent.click(screen.getByRole('button', { name: /interpreter engine/i }));
    fireEvent.click(screen.getByRole('option', { name: /^Interpreter$/i }));

    expect(ideStore.getState().settings.engineMode).toBe('interpreter');
    expect(screen.getByRole('button', { name: /interpreter engine/i })).toHaveTextContent('Interpreter');
    expect(ideStore.getState().emulator.runtimeIntents.reset).toBe(startingResetCount + 1);
  });
});
