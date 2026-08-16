import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusBar from './StatusBar';
import { useEmulatorStore } from '@/stores/emulatorStore';
import { ideStore, resetFilesState, resetSettingsState } from '@/store';
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
    expect(screen.queryByText('Files')).not.toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Emulation mode: MC68000 · Easy68K' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Inspector:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Help:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Terminal:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Speed:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Delay:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cursor/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Frame:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stop:/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'smysnk.com' })).toHaveAttribute(
      'href',
      'https://smysnk.com'
    );
    expect(screen.getByRole('link', { name: /buy me a coffee/i })).toHaveAttribute(
      'href',
      'https://buymeacoffee.com/josh1g'
    );
  });

  it('changes CPU and machine independently from the bottom status bar', async () => {
    const user = userEvent.setup();
    renderWithIdeProviders(<StatusBar />);

    await user.click(screen.getByRole('button', { name: 'Emulation mode: MC68000 · Easy68K' }));

    expect(screen.getByRole('menu', { name: 'Select emulation mode' })).toHaveClass(
      'context-menu-surface',
      'navbar-menu'
    );
    expect(screen.getByRole('menuitemradio', { name: 'Easy68K' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await user.click(screen.getByRole('menuitemradio', { name: 'MC68010' }));

    expect(ideStore.getState().settings.cpuModel).toBe('m68010');
    expect(ideStore.getState().settings.machineProfile).toBe('easy68k');
    expect(
      screen.getByRole('button', { name: 'Emulation mode: MC68010 · Easy68K' })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the status bar focused on runtime info rather than program labels', () => {
    renderWithIdeProviders(<StatusBar />);

    expect(screen.queryByText(/Program:/)).not.toBeInTheDocument();
  });

  it('renders the bottom panel inline in compact mobile shells', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });

    renderWithIdeProviders(<StatusBar />);

    expect(screen.getByLabelText('IDE status bar')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('status-bar-inline')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Emulation mode: MC68000 · Easy68K' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'smysnk.com' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /buy me a coffee/i })).toBeInTheDocument();
  });
});
