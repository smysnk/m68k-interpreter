import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import Registers from './Registers';
import { createIdeStore, setFlags, setRegisters } from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

function expandRegisterGroup(name: RegExp | string): void {
  const groupToggle = screen.getByRole('button', { name });
  if (groupToggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(groupToggle);
  }
}

describe('Registers', () => {
  it('renders all supported registers with inline hex, decimal, and binary views', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0xff,
        d7: 0x12345678,
        a0: 0x1000,
        a7: 0x2000,
        pc: 0x10a0,
        ccr: 0xa5,
        sr: 0x00a5,
        usp: 0x2000,
        ssp: 0x2000,
      })
    );
    store.dispatch(setFlags({ x: 1, n: 0, z: 1, v: 0, c: 1 }));

    renderWithIdeProviders(<Registers />, { store });

    const flagsToggle = screen.getByRole('button', { name: /flags/i });
    expect(flagsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('register-group-panel-flags')).toHaveAttribute('hidden');
    expect(screen.queryByLabelText('Current condition flags')).not.toBeInTheDocument();
    fireEvent.click(flagsToggle);
    const flagsPanel = screen.getByLabelText('Current condition flags');
    expect(flagsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('register-group-panel-flags')).not.toHaveAttribute('hidden');
    expect(flagsPanel).toHaveTextContent('CCR');
    expect(flagsPanel).toHaveTextContent('0xA5');
    expect(screen.getByRole('button', { name: /data registers \(d0-d7\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /address registers \(a0-a7\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /control registers/i })).toBeInTheDocument();
    expect(document.querySelector('.registers-group-indicator')).toBeInTheDocument();
    expect(document.querySelector('.register-card-toggle-indicator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /data registers \(d0-d7\)/i })).toHaveAttribute(
      'data-register-group',
      'data'
    );
    expect(document.getElementById('register-group-panel-data')).toHaveAttribute('hidden');
    expect(document.getElementById('register-group-panel-address')).toHaveAttribute('hidden');
    expect(document.getElementById('register-group-panel-control')).toHaveAttribute('hidden');
    expandRegisterGroup(/data registers \(d0-d7\)/i);
    expandRegisterGroup(/address registers \(a0-a7\)/i);
    expandRegisterGroup(/control registers/i);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D7 register view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle CCR register view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle SR register view' }));
    expect(screen.getByRole('button', { name: 'Toggle D0 register view' })).toHaveAttribute(
      'data-register-group',
      'data'
    );
    expect(screen.queryByText('Registers')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Download registers')).not.toBeInTheDocument();
    expect(document.querySelector('.registers-matrix')).not.toBeInTheDocument();
    expect(document.querySelector('.register-group-section')).not.toBeInTheDocument();
    expect(screen.getByText('D0')).toBeInTheDocument();
    expect(screen.getByText('D7')).toBeInTheDocument();
    expect(screen.getByText('A0')).toBeInTheDocument();
    expect(screen.getByText('A7')).toBeInTheDocument();
    expect(screen.getByText('PC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle CCR register view' })).toBeInTheDocument();
    expect(screen.getByText('SR')).toBeInTheDocument();
    expect(screen.getByText('USP')).toBeInTheDocument();
    expect(screen.getByText('SSP')).toBeInTheDocument();

    expect(screen.getByLabelText('D0 full hex value')).toHaveValue('0x000000FF');
    expect(screen.getByLabelText('SR full hex value')).toHaveTextContent('0x000000A5');
    expect(screen.getByLabelText('D0 dec input')).toHaveValue('255');
    expect(screen.getByLabelText('D0 row 1 hex input')).toHaveValue('0x0000');
    expect(screen.getByLabelText('D0 row 2 hex input')).toHaveValue('0x00FF');
    expect(screen.getByLabelText('D7 row 1 hex input')).toHaveValue('0x1234');
    expect(screen.getByLabelText('D7 row 2 hex input')).toHaveValue('0x5678');
    expect(screen.getByLabelText('PC dec value')).toHaveTextContent('4256');
    expect(screen.getByLabelText('SR row 1 hex value')).toHaveTextContent('0x00A5');
    expect(screen.getByLabelText('SR dec value')).toHaveTextContent('165');
    expect(screen.getByLabelText('CCR row 1 binary 0000 0000 1010 0101')).toBeInTheDocument();
  });

  it('lets a group heading toggle all registers in that section', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0xff,
        a0: 0x1000,
        pc: 0x10a0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });

    const dataToggle = screen.getByRole('button', { name: /data registers \(d0-d7\)/i });

    expect(document.getElementById('register-group-panel-data')).toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: 'Toggle D0 register view' })).not.toBeInTheDocument();

    fireEvent.click(dataToggle);

    expect(document.getElementById('register-group-panel-data')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Toggle D0 register view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle D7 register view' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle A0 register view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle PC register view' })).not.toBeInTheDocument();

    fireEvent.click(dataToggle);

    expect(document.getElementById('register-group-panel-data')).toHaveAttribute('hidden');
    expect(screen.queryByRole('button', { name: 'Toggle D0 register view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle D7 register view' })).not.toBeInTheDocument();
  });

  it('lets a register be edited through hex, decimal, or individual bit buttons', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    const lowerHexInput = screen.getByLabelText('D0 row 2 hex input') as HTMLInputElement;
    const decimalInput = screen.getByLabelText('D0 dec input') as HTMLInputElement;

    fireEvent.focus(lowerHexInput);
    lowerHexInput.setSelectionRange(4, 5);
    fireEvent.select(lowerHexInput);
    fireEvent.keyDown(lowerHexInput, { key: '1' });
    fireEvent.keyDown(lowerHexInput, { key: '0' });

    expect(store.getState().emulator.registers.d0).toBe(0x10);
    expect(screen.getByLabelText('D0 full hex value')).toHaveValue('0x00000010');
    expect(screen.getByLabelText('D0 row 2 hex input')).toHaveValue('0x0010');
    expect(screen.getByLabelText('D0 dec input')).toHaveValue('16');

    fireEvent.change(decimalInput, { target: { value: '255' } });
    fireEvent.blur(decimalInput);

    expect(store.getState().emulator.registers.d0).toBe(0xff);
    expect(screen.getByLabelText('D0 full hex value')).toHaveValue('0x000000FF');
    expect(screen.getByLabelText('D0 row 2 hex input')).toHaveValue('0x00FF');
    expect(screen.getByLabelText('D0 dec input')).toHaveValue('255');

    fireEvent.click(screen.getByRole('button', { name: 'D0 bit 8' }));

    expect(store.getState().emulator.registers.d0).toBe(0x1ff);
    expect(screen.getByLabelText('D0 full hex value')).toHaveValue('0x000001FF');
    expect(screen.getByLabelText('D0 row 2 hex input')).toHaveValue('0x01FF');
    expect(screen.getByLabelText('D0 dec input')).toHaveValue('511');
  });

  it('keeps the 0x prefix fixed and moves nibble selection across rows while editing', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    const upperHexInput = screen.getByLabelText('D0 row 1 hex input') as HTMLInputElement;
    const lowerHexInput = screen.getByLabelText('D0 row 2 hex input') as HTMLInputElement;

    fireEvent.focus(upperHexInput);
    expect(upperHexInput.selectionStart).toBe(2);
    expect(upperHexInput.selectionEnd).toBe(3);

    upperHexInput.setSelectionRange(5, 6);
    fireEvent.select(upperHexInput);
    fireEvent.keyDown(upperHexInput, { key: 'A' });

    expect(store.getState().emulator.registers.d0).toBe(0x000a0000);
    expect(screen.getByLabelText('D0 row 1 hex input')).toHaveValue('0x000A');
    expect(lowerHexInput).toHaveFocus();
    expect(lowerHexInput.selectionStart).toBe(2);
    expect(lowerHexInput.selectionEnd).toBe(3);
  });

  it('allows a middle hex nibble to be selected and edited directly', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    const lowerHexInput = screen.getByLabelText('D0 row 2 hex input') as HTMLInputElement;

    fireEvent.focus(lowerHexInput);
    lowerHexInput.setSelectionRange(4, 5);
    fireEvent.mouseUp(lowerHexInput);

    expect(lowerHexInput.selectionStart).toBe(4);
    expect(lowerHexInput.selectionEnd).toBe(5);

    fireEvent.keyDown(lowerHexInput, { key: 'A' });

    expect(store.getState().emulator.registers.d0).toBe(0x00a0);
    expect(screen.getByLabelText('D0 row 2 hex input')).toHaveValue('0x00A0');
  });

  it('does not force the first nibble on the first mouse click into a later hex position', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    const lowerHexInput = screen.getByLabelText('D0 row 2 hex input') as HTMLInputElement;

    lowerHexInput.setSelectionRange(4, 5);
    fireEvent.mouseDown(lowerHexInput);
    fireEvent.focus(lowerHexInput);
    fireEvent.mouseUp(lowerHexInput);

    expect(lowerHexInput.selectionStart).toBe(4);
    expect(lowerHexInput.selectionEnd).toBe(5);

    fireEvent.keyDown(lowerHexInput, { key: 'C' });

    expect(store.getState().emulator.registers.d0).toBe(0x00c0);
    expect(screen.getByLabelText('D0 row 2 hex input')).toHaveValue('0x00C0');
  });

  it('lets the top full hex input be selected and edited directly', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);

    const fullHexInput = screen.getByLabelText('D0 full hex value') as HTMLInputElement;

    fireEvent.focus(fullHexInput);
    expect(fullHexInput.selectionStart).toBe(2);
    expect(fullHexInput.selectionEnd).toBe(3);

    fullHexInput.setSelectionRange(5, 6);
    fireEvent.select(fullHexInput);
    fireEvent.keyDown(fullHexInput, { key: 'A' });

    expect(store.getState().emulator.registers.d0).toBe(0x000a0000);
    expect(screen.getByLabelText('D0 full hex value')).toHaveValue('0x000A0000');
  });

  it('increments and decrements the selected lower hex nibble with arrow keys', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    const lowerHexInput = screen.getByLabelText('D0 row 2 hex input') as HTMLInputElement;

    fireEvent.focus(lowerHexInput);
    lowerHexInput.setSelectionRange(4, 5);
    fireEvent.select(lowerHexInput);
    fireEvent.keyDown(lowerHexInput, { key: 'ArrowUp' });

    expect(store.getState().emulator.registers.d0).toBe(0x10);
    expect(lowerHexInput).toHaveValue('0x0010');
    expect(lowerHexInput.selectionStart).toBe(4);
    expect(lowerHexInput.selectionEnd).toBe(5);

    fireEvent.keyDown(lowerHexInput, { key: 'ArrowDown' });

    expect(store.getState().emulator.registers.d0).toBe(0);
    expect(lowerHexInput).toHaveValue('0x0000');
    expect(lowerHexInput.selectionStart).toBe(4);
    expect(lowerHexInput.selectionEnd).toBe(5);
  });

  it('increments and decrements the selected full hex nibble with arrow keys', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0,
      })
    );

    renderWithIdeProviders(<Registers />, { store });
    expandRegisterGroup(/data registers \(d0-d7\)/i);

    const fullHexInput = screen.getByLabelText('D0 full hex value') as HTMLInputElement;

    fireEvent.focus(fullHexInput);
    fullHexInput.setSelectionRange(4, 5);
    fireEvent.select(fullHexInput);
    fireEvent.keyDown(fullHexInput, { key: 'ArrowUp' });

    expect(store.getState().emulator.registers.d0).toBe(0x100000);
    expect(fullHexInput).toHaveValue('0x00100000');
    expect(fullHexInput.selectionStart).toBe(4);
    expect(fullHexInput.selectionEnd).toBe(5);

    fireEvent.keyDown(fullHexInput, { key: 'ArrowDown' });

    expect(store.getState().emulator.registers.d0).toBe(0);
    expect(fullHexInput).toHaveValue('0x00000000');
    expect(fullHexInput.selectionStart).toBe(4);
    expect(fullHexInput.selectionEnd).toBe(5);
  });

  it('lets each register toggle between expanded and compact views', () => {
    const store = createIdeStore();
    store.dispatch(
      setRegisters({
        d0: 0xff,
      })
    );

    renderWithIdeProviders(<Registers />, { store });

    expandRegisterGroup(/data registers \(d0-d7\)/i);
    expect(screen.queryByLabelText('D0 row 2 hex input')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('D0 binary value')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    expect(screen.getByLabelText('D0 row 2 hex input')).toBeInTheDocument();
    expect(screen.getByLabelText('D0 full hex value')).toHaveValue('0x000000FF');
    expect(screen.getByLabelText('D0 dec input')).toHaveValue('255');
    expect(screen.queryByLabelText('D0 binary value')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle D0 register view' }));

    expect(screen.queryByLabelText('D0 row 2 hex input')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('D0 binary value')).not.toBeInTheDocument();
  });
});
