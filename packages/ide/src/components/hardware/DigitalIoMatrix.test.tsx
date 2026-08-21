import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EASY68K_HARDWARE_CONFIG,
  type Easy68kHardwareDeviceSnapshot,
} from '@m68k/interpreter';
import { DigitalIoMatrix } from './DigitalIoMatrix';

const snapshot: Easy68kHardwareDeviceSnapshot = {
  id: 'test-digital-io',
  deviceType: 'digital-io',
  config: { ...DEFAULT_EASY68K_HARDWARE_CONFIG },
  display: new Array(8).fill(0),
  leds: 0,
  switches: 0,
  buttons: 0xff,
  version: 0,
  outputVersion: 0,
};

function renderMatrix(onLabelCommit = vi.fn()) {
  render(
    <DigitalIoMatrix
      bitLabels={['Zero', '', '', '', '', '', '', 'Motor']}
      onAddressCommit={async () => ({ ok: true })}
      onButton={() => undefined}
      onLabelCommit={onLabelCommit}
      onToggle={() => undefined}
      snapshot={snapshot}
    />
  );
  return onLabelCommit;
}

describe('DigitalIoMatrix bit labels', () => {
  it('renders eight rotated label cells in visual bit order 7 through 0', () => {
    renderMatrix();

    expect(
      [...screen.getByRole('group', { name: 'Digital I/O bit labels' }).children]
        .slice(1)
        .map((cell) => cell.getAttribute('data-bit'))
    ).toEqual(['7', '6', '5', '4', '3', '2', '1', '0']);
    expect(screen.getByText('Motor')).toHaveClass('hardware-io-rotated-label');
    expect(screen.getByText('Zero')).toHaveClass('hardware-io-rotated-label');
  });

  it('focuses the inline input and commits a trimmed label with Enter', () => {
    const onCommit = renderMatrix();

    fireEvent.click(screen.getByRole('button', { name: 'Edit label for bit 7' }));
    const input = screen.getByRole('textbox', { name: 'Label for bit 7' });
    expect(input).toHaveFocus();
    expect(input).toHaveClass('hardware-io-rotated-label-input');
    fireEvent.change(input, { target: { value: '  Drive motor  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(7, 'Drive motor');
    expect(screen.queryByRole('textbox', { name: 'Label for bit 7' })).not.toBeInTheDocument();
  });

  it('cancels edits with Escape and keeps only one inline editor open', () => {
    const onCommit = renderMatrix();

    fireEvent.click(screen.getByRole('button', { name: 'Edit label for bit 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit label for bit 6' }));
    expect(screen.queryByRole('textbox', { name: 'Label for bit 7' })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Label for bit 6' });
    fireEvent.change(input, { target: { value: 'Discard me' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Label for bit 6' })).not.toBeInTheDocument();
  });

  it('clears a label when whitespace is submitted', () => {
    const onCommit = renderMatrix();

    fireEvent.click(screen.getByRole('button', { name: 'Edit label for bit 7' }));
    const input = screen.getByRole('textbox', { name: 'Label for bit 7' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(7, '');
  });
});
