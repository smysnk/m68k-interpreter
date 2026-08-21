import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Emulator } from '@m68k/interpreter';
import HardwarePanelPreview from './HardwarePanelPreview';
import { createIdeStore } from '@/store';
import { runtimeSessionStore } from '@/runtime/runtimeSessionStore';
import { hardwareSurfaceStore } from '@/runtime/hardwareSurfaceStore';

let runtime: Emulator;

function renderPanel() {
  return render(
    <Provider store={createIdeStore()}>
      <HardwarePanelPreview />
    </Provider>
  );
}

describe('HardwarePanelPreview', () => {
  beforeEach(() => {
    window.localStorage.clear();
    runtime = new Emulator('START\n  END START');
    runtime.setHardwareToggle(7, true);
    runtime.setHardwareToggle(5, true);
    runtime.setHardwareToggle(2, true);
    runtime.setHardwareToggle(0, true);
    runtime.writeMemoryByte(0xe00010, 0xa5);
    [0x7d, 0x7f, 0, 0, 0x5b, 0x3f, 0x5b, 0x7d].forEach((value, index) => {
      runtime.writeMemoryByte(0xe00000 + index * 2, value);
    });
    runtimeSessionStore.replace(runtime);
    hardwareSurfaceStore.reset();
    hardwareSurfaceStore.publish(runtime.getHardwareSnapshot());
  });

  afterEach(() => {
    runtimeSessionStore.clear();
    hardwareSurfaceStore.reset();
  });

  it('renders the live memory map and interactive I/O banks', async () => {
    renderPanel();

    expect(screen.getByText('Base · $00E00000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure switch address' })).toHaveAttribute(
      'data-address',
      '00E00010'
    );
    expect(screen.getByRole('button', { name: 'Configure led address' })).toHaveAttribute(
      'data-address',
      '00E00010'
    );
    expect(screen.getByRole('button', { name: 'Configure button address' })).toHaveAttribute(
      'data-address',
      '00E00012'
    );
    expect(screen.getByRole('img', { name: 'LED output 0xA5' })).toBeInTheDocument();

    const matrix = screen.getByTestId('hardware-io-matrix');
    expect(matrix.querySelectorAll('.hardware-io-switch-row .hardware-io-cell')).toHaveLength(8);
    expect(matrix.querySelectorAll('.hardware-io-led-row .hardware-io-cell')).toHaveLength(8);
    expect(matrix.querySelectorAll('.hardware-io-button-row .hardware-io-cell')).toHaveLength(8);

    const bitSeven = screen.getByRole('switch', { name: 'Toggle switch 7' });
    expect(bitSeven).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(bitSeven);

    await waitFor(() => expect(bitSeven).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByRole('img', { name: 'LED output 0xA5' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Display digit 1, pattern 0x7D' })).toBeInTheDocument();
  });

  it('models active-low buttons and configuration without embedded IRQ controls', async () => {
    renderPanel();

    const buttonRow = screen.getByTestId('hardware-matrix-button-row');
    const pushButton = screen.getByRole('button', { name: 'Push button 0' });

    expect(buttonRow).toHaveAttribute('aria-label', 'Button input 0xFF');

    fireEvent.pointerDown(pushButton);
    await waitFor(() => expect(buttonRow).toHaveAttribute('aria-label', 'Button input 0xFE'));

    fireEvent.pointerUp(pushButton);
    await waitFor(() => expect(buttonRow).toHaveAttribute('aria-label', 'Button input 0xFF'));

    expect(screen.getByTestId('hardware-address-configuration')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request interrupt level 5' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset simulator' })).not.toBeInTheDocument();
    expect(screen.queryByText('Hardware ready')).not.toBeInTheDocument();
  });
});
