import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import PanelWorkspacePrototype from './PanelWorkspacePrototype';

describe('PanelWorkspacePrototype', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('renders the static three-column Debug composition', () => {
    render(<PanelWorkspacePrototype />);

    expect(screen.getByTestId('panel-workspace-prototype')).toBeInTheDocument();
    expect(screen.getByLabelText('Debug view')).toBeInTheDocument();
    expect(screen.getByLabelText('Three columns')).toBeInTheDocument();
    expect(screen.getByLabelText('Code prototype panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Screen prototype panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Registers prototype panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Memory prototype panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Help prototype panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Hardware I/O prototype panel')).toBeInTheDocument();
    expect(screen.getByText('Interactive')).toBeInTheDocument();
  });

  it('uses the isolated prototype route without mounting the live app shell', () => {
    window.history.replaceState({}, '', '/?panelPrototype=debug');

    render(<App />);

    expect(screen.getByTestId('panel-workspace-prototype')).toBeInTheDocument();
    expect(screen.queryByTestId('app-container')).not.toBeInTheDocument();
  });
});
