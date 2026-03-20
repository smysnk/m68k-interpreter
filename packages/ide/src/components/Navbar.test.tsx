import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Navbar from './Navbar';

describe('Navbar', () => {
  it('renders grouped shell controls and invokes callbacks', () => {
    const onWorkspaceTabChange = vi.fn();
    const onLoadNibbles = vi.fn();
    const onToggleTheme = vi.fn();
    const onToggleHelp = vi.fn();
    const onToggleMemory = vi.fn();

    const { container } = render(
      <Navbar
        activeInspectorPane="registers"
        activeWorkspaceTab="terminal"
        engineMode="interpreter"
        onLoadNibbles={onLoadNibbles}
        onWorkspaceTabChange={onWorkspaceTabChange}
        onToggleTheme={onToggleTheme}
        onToggleHelp={onToggleHelp}
        onToggleMemory={onToggleMemory}
        theme="light"
        showHelp={false}
      />
    );

    expect(container.querySelector('.navbar-left')).toBeInTheDocument();
    expect(container.querySelector('.navbar-right')).toBeInTheDocument();
    expect(screen.getByText('M68K IDE')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /code/i }));
    fireEvent.click(screen.getByRole('button', { name: /load nibbles/i }));
    fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));
    fireEvent.click(screen.getByTitle(/compatibility notes/i));
    fireEvent.click(screen.getByTitle(/show memory view/i));

    expect(onWorkspaceTabChange).toHaveBeenCalledWith('code');
    expect(onLoadNibbles).toHaveBeenCalled();
    expect(onToggleTheme).toHaveBeenCalled();
    expect(onToggleHelp).toHaveBeenCalled();
    expect(onToggleMemory).toHaveBeenCalled();
  });
});
