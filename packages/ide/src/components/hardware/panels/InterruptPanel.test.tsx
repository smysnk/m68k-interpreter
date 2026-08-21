import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdeStore } from '@/store';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';
import InterruptPanel from './InterruptPanel';

const requestInterrupt = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useHardwareController', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/useHardwareController')>();
  return {
    ...original,
    useHardwareController: () => ({
      preferences: {
        automaticInterruptIntervalMs: 1000,
        automaticInterruptLevels: [],
      },
      requestInterrupt,
    }),
  };
});

describe('InterruptPanel', () => {
  beforeEach(() => requestInterrupt.mockReset());

  it('owns manual requests and the global automatic IRQ preferences', () => {
    const store = createIdeStore();
    renderWithIdeProviders(<InterruptPanel />, { store });

    for (let level = 7; level >= 1; level -= 1) {
      fireEvent.click(screen.getByRole('button', { name: `Request interrupt level ${level}` }));
    }
    expect(requestInterrupt.mock.calls.map(([level]) => level)).toEqual([7, 6, 5, 4, 3, 2, 1]);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Automatic interrupt level 3' }));
    expect(store.getState().hardware.automaticInterruptLevels).toEqual([3]);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Automatic interrupt interval' }), {
      target: { value: '250' },
    });
    expect(store.getState().hardware.automaticInterruptIntervalMs).toBe(250);
  });
});
