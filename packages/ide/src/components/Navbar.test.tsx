import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Navbar from './Navbar';
import { EditorThemeEnum } from '@/theme/editorThemeRegistry';

describe('Navbar', () => {
  it('renders shell controls and invokes app menu callbacks', () => {
    const onWorkspaceTabChange = vi.fn();
    const onSetEditorTheme = vi.fn();
    const onSetFollowSystemTheme = vi.fn();
    const onSetLineNumbers = vi.fn();
    const onToggleHelp = vi.fn();
    const onShowFlags = vi.fn();
    const onShowMemory = vi.fn();
    const onShowRegisters = vi.fn();

    const { container } = render(
      <Navbar
        activeInspectorPane="registers"
        activeWorkspaceTab="terminal"
        editorTheme={EditorThemeEnum.M68K_LIGHT}
        engineMode="interpreter"
        followSystemTheme={false}
        lineNumbers={true}
        onSetEditorTheme={onSetEditorTheme}
        onSetFollowSystemTheme={onSetFollowSystemTheme}
        onSetLineNumbers={onSetLineNumbers}
        onShowFlags={onShowFlags}
        onShowMemory={onShowMemory}
        onShowRegisters={onShowRegisters}
        onWorkspaceTabChange={onWorkspaceTabChange}
        onToggleHelp={onToggleHelp}
        showHelp={false}
      />
    );

    expect(container.querySelector('.navbar-left')).toBeInTheDocument();
    expect(container.querySelector('.navbar-right')).toBeInTheDocument();
    expect(screen.queryByText('M68K IDE')).not.toBeInTheDocument();
    expect(screen.getByTestId('navbar-accent-mark')).toHaveTextContent('68');

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /style/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /m68k dark/i }));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /memory/i }));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /compatibility notes/i }));
    fireEvent.click(screen.getByRole('button', { name: /open app menu/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /line numbers/i }));

    expect(onWorkspaceTabChange).toHaveBeenCalledWith('code');
    expect(onSetEditorTheme).toHaveBeenCalledWith(EditorThemeEnum.M68K_DARK);
    expect(onSetFollowSystemTheme).not.toHaveBeenCalled();
    expect(onSetLineNumbers).toHaveBeenCalledWith(false);
    expect(onToggleHelp).toHaveBeenCalled();
    expect(onShowMemory).toHaveBeenCalled();
    expect(onShowFlags).not.toHaveBeenCalled();
    expect(onShowRegisters).not.toHaveBeenCalled();
  });
});
