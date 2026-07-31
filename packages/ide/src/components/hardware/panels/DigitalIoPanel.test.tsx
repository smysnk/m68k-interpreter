import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelInstance } from '@/store';
import DigitalIoPanel from './DigitalIoPanel';
import { DigitalIoHeaderAccessory } from './HardwarePanelHeaderAccessories';

const controller = vi.hoisted(() => ({
  configureDigitalIoBase: vi.fn(),
  setButton: vi.fn(),
  setToggle: vi.fn(),
}));

vi.mock('@/hooks/useHardwareDeviceController', () => ({
  useHardwareDeviceController: () => ({
    ...controller,
    configure: vi.fn(),
    status: 'Button 3 released',
  }),
}));

vi.mock('@/runtime/useHardwareSurface', () => ({
  useHardwareDeviceSurface: () => undefined,
}));

const instance: PanelInstance = {
  id: 'panel-digital-io-test',
  kind: 'hardware-digital-io',
  title: 'LEDs / Switches / Buttons',
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
    controller.configureDigitalIoBase.mockReset();
    controller.configureDigitalIoBase.mockResolvedValue({
      valid: true,
      conflicts: [],
      errors: [],
    });
  });

  it('keeps address controls and redundant summary labels out of the panel body', () => {
    render(<DigitalIoPanel instance={instance} />);

    expect(screen.queryByText('Digital I/O')).not.toBeInTheDocument();
    expect(screen.queryByText('8 columns')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('I/O base address')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'LED writes and switch reads use the base address; buttons use base + 2.'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Button 3 released')).not.toBeInTheDocument();
  });

  it('provides one shared address control through the title-bar accessory', async () => {
    render(<DigitalIoHeaderAccessory instance={instance} />);

    const input = screen.getByLabelText('I/O base address');
    expect(input).toHaveValue('00E00010');

    fireEvent.change(input, { target: { value: '00E00040' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(controller.configureDigitalIoBase).toHaveBeenCalledWith(0xe00040)
    );
  });
});
