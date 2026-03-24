import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import Navbar from './Navbar';
import { createIdeStore } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('Navbar', () => {
  it('renders shell controls and drives the interface through Redux', () => {
    const store = createIdeStore();

    const { container } = renderWithIdeProviders(<Navbar />, { store });

    expect(container.querySelector('.navbar-left')).toBeInTheDocument();
    expect(container.querySelector('.navbar-right')).toBeInTheDocument();
    expect(screen.queryByText('M68K IDE')).not.toBeInTheDocument();
    expect(screen.getByTestId('navbar-accent-mark')).toHaveTextContent('68');
    expect(screen.queryByLabelText('Delay (s)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Speed (x)')).toHaveValue(1);

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));
    fireEvent.change(screen.getByLabelText('Speed (x)'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTitle(/run program/i));
    fireEvent.click(screen.getByTitle(/reset/i));
    fireEvent.click(screen.getByTitle(/step/i));
    fireEvent.click(screen.getByTitle(/undo/i));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /style/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /m68k dark/i }));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /line numbers/i }));

    expect(store.getState().uiShell.workspaceTab).toBe('code');
    expect(store.getState().settings.editorTheme).toBe(EditorThemeEnum.M68K_DARK);
    expect(store.getState().settings.followSystemTheme).toBe(false);
    expect(store.getState().settings.lineNumbers).toBe(false);
    expect(store.getState().emulator.speedMultiplier).toBe(2.5);
    expect(screen.queryByRole('menuitem', { name: /registers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /memory/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /flags/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /compatibility notes/i })).not.toBeInTheDocument();
    expect(store.getState().emulator.runtimeIntents).toMatchObject({
      run: 1,
      step: 1,
      undo: 1,
      reset: 1,
      focusTerminal: 2,
    });
  });
});
