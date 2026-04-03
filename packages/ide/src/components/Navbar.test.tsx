import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import Navbar from './Navbar';
import { createIdeStore } from '@/store';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });

  window.dispatchEvent(new Event('resize'));
}

describe('Navbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1280);
  });

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
    fireEvent.click(screen.getByRole('menuitem', { name: /terminal input/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /touch only/i }));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /line numbers/i }));

    expect(store.getState().uiShell.workspaceTab).toBe('code');
    expect(store.getState().settings.editorTheme).toBe(EditorThemeEnum.M68K_DARK);
    expect(store.getState().settings.followSystemTheme).toBe(false);
    expect(store.getState().settings.lineNumbers).toBe(false);
    expect(store.getState().settings.terminalInputMode).toBe('touch-only');
    expect(store.getState().emulator.speedMultiplier).toBe(2.5);
    expect(screen.queryByRole('menuitem', { name: /registers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /memory/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /flags/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /compatibility notes/i })
    ).not.toBeInTheDocument();
    expect(store.getState().emulator.runtimeIntents).toMatchObject({
      run: 1,
      step: 1,
      undo: 1,
      reset: 1,
      focusTerminal: 2,
    });
  });

  it('shows mobile workspace tabs and hides runtime controls while terminal is active', () => {
    setViewportWidth(600);
    const store = createIdeStore();

    renderWithIdeProviders(<Navbar />, { store });

    expect(screen.queryByTestId('navbar-accent-mark')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /registers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /memory/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open app menu/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Speed (x)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Run program')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));

    expect(store.getState().uiShell.workspaceTab).toBe('code');
    expect(screen.getByRole('button', { name: /open app menu/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Speed (x)')).toBeInTheDocument();
    expect(screen.getByLabelText('Run program')).toBeInTheDocument();
  });
});
