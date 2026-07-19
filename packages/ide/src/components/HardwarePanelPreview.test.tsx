import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import HardwarePanelPreview from './HardwarePanelPreview';

describe('HardwarePanelPreview', () => {
  it('renders the proposed memory map and interactive I/O banks', () => {
    render(<HardwarePanelPreview />);

    expect(screen.getByLabelText('Base address')).toHaveValue('00E00000');
    expect(screen.getByText('Read · $00E00010')).toBeInTheDocument();
    expect(screen.getByText('Write · $00E00010')).toBeInTheDocument();
    expect(screen.getByText('Read low · $00E00012')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'LED output 0xA5' })).toBeInTheDocument();

    const matrix = screen.getByTestId('hardware-io-matrix');
    expect(matrix.querySelectorAll('.hardware-io-switch-row .hardware-io-cell')).toHaveLength(8);
    expect(matrix.querySelectorAll('.hardware-io-led-row .hardware-io-cell')).toHaveLength(8);
    expect(matrix.querySelectorAll('.hardware-io-button-row .hardware-io-cell')).toHaveLength(8);

    const bitSeven = screen.getByRole('switch', { name: 'Toggle switch 7' });
    expect(bitSeven).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(bitSeven);

    expect(bitSeven).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('img', { name: 'LED output 0x25' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cycle preview display' }));
    expect(screen.getByRole('img', { name: 'Display digit 1, pattern 0x7F' })).toBeInTheDocument();
  });

  it('models active-low buttons, interrupt feedback, and reset behavior', () => {
    render(<HardwarePanelPreview />);

    const buttonRow = screen.getByTestId('hardware-matrix-button-row');
    const pushButton = screen.getByRole('button', { name: 'Push button 0' });

    expect(within(buttonRow).getByText('0xFF')).toBeInTheDocument();

    fireEvent.pointerDown(pushButton);
    expect(within(buttonRow).getByText('0xFE')).toBeInTheDocument();

    fireEvent.pointerUp(pushButton);
    expect(within(buttonRow).getByText('0xFF')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Request interrupt level 5' }));
    expect(screen.getByText('IRQ 5 requested • preview only')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset board' }));
    expect(screen.getByRole('img', { name: 'LED output 0xA5' })).toBeInTheDocument();
    expect(screen.getByText('1 automatic level armed • preview only')).toBeInTheDocument();
  });
});
