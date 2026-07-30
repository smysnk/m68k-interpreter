import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HardwareAddressField } from './HardwareAddressField';

describe('HardwareAddressField', () => {
  it('commits a normalized address once on Enter', async () => {
    const onCommit = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HardwareAddressField
        label="Display base"
        value={0xe00000}
        onCommit={onCommit}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Display base address' });
    fireEvent.change(input, { target: { value: 'e00020' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(0xe00020));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('00E00020');
  });

  it('rolls back and exposes an associated runtime validation error', async () => {
    const onCommit = vi.fn().mockResolvedValue({
      ok: false,
      message: 'That address conflicts with display A.',
    });
    render(
      <HardwareAddressField
        label="Display base"
        value={0xe00020}
        onCommit={onCommit}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Display base address' });
    fireEvent.change(input, { target: { value: 'e00000' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    expect(input).toHaveValue('00E00020');
    expect(screen.getByText('That address conflicts with display A.')).toHaveAttribute(
      'id',
      input.getAttribute('aria-describedby')
    );
  });

  it('ignores an obsolete response when the committed address changes externally', async () => {
    let resolveCommit!: (result: { ok: false; message: string }) => void;
    const onCommit = vi.fn(
      () =>
        new Promise<{ ok: false; message: string }>((resolve) => {
          resolveCommit = resolve;
        })
    );
    const { rerender } = render(
      <HardwareAddressField
        label="Display base"
        value={0xe00000}
        onCommit={onCommit}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Display base address' });
    fireEvent.change(input, { target: { value: 'e00020' } });
    fireEvent.blur(input);
    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'));

    rerender(
      <HardwareAddressField
        label="Display base"
        value={0xe00040}
        onCommit={onCommit}
      />
    );
    await waitFor(() => expect(input).toHaveValue('00E00040'));
    resolveCommit({ ok: false, message: 'Obsolete conflict.' });

    await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'false'));
    expect(input).toHaveValue('00E00040');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });
});
