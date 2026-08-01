import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelInstance } from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';
import DigitalIoPanel from './DigitalIoPanel';

const controller = vi.hoisted(() => ({
  configure: vi.fn(),
  requestInterrupt: vi.fn(),
  setButton: vi.fn(),
  setToggle: vi.fn(),
}));

vi.mock('@/hooks/useHardwareDeviceController', () => ({
  useHardwareDeviceController: () => ({
    ...controller,
    status: 'Button 3 released',
  }),
}));

vi.mock('@/hooks/useHardwareController', () => ({
  useHardwareController: () => ({
    preferences: {
      automaticInterruptIntervalMs: 1000,
      automaticInterruptLevels: [],
    },
    requestInterrupt: controller.requestInterrupt,
  }),
}));

vi.mock('@/runtime/useHardwareSurface', () => ({
  useHardwareDeviceSurface: () => undefined,
}));

const instance: PanelInstance = {
  id: 'panel-digital-io-test',
  kind: 'hardware-digital-io',
  title: 'LEDs / Switches / Buttons / IRQs',
  minimized: false,
  config: {
    kind: 'hardware-digital-io',
    deviceId: 'device-digital-io-test',
    ledAddress: 0xe00010,
    switchAddress: 0xe00010,
    buttonAddress: 0xe00012,
  },
};

describe('DigitalIoPanel', () => {
  beforeEach(() => {
    controller.configure.mockReset();
    controller.configure.mockResolvedValue({
      valid: true,
      conflicts: [],
      errors: [],
    });
  });

  it('keeps only compact row labels and address gears in the matrix', () => {
    renderWithIdeProviders(<DigitalIoPanel instance={instance} />);

    expect(screen.getByText('Switch')).toBeInTheDocument();
    expect(screen.getByText('LED')).toBeInTheDocument();
    expect(screen.getByText('Button')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure switch address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure led address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configure button address' })).toBeInTheDocument();
    expect(screen.queryByLabelText('I/O base address')).not.toBeInTheDocument();
    expect(screen.queryByText(/READ · \$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/WRITE · \$/)).not.toBeInTheDocument();
    expect(screen.queryByText('0x00')).not.toBeInTheDocument();
    expect(screen.queryByText('Button 3 released')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request interrupt level 7' })).toBeInTheDocument();
  });

  it('configures each row address independently through its gear', async () => {
    renderWithIdeProviders(<DigitalIoPanel instance={instance} />);

    fireEvent.click(screen.getByRole('button', { name: 'Configure switch address' }));

    const input = screen.getByLabelText('Switch address');
    expect(input).toHaveValue('00E00010');

    fireEvent.change(input, { target: { value: '00E00040' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(controller.configure).toHaveBeenCalledWith({
        switchAddress: 0xe00040,
      })
    );
  });
});
