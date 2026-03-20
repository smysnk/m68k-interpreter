import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import Memory from './Memory';
import { memorySurfaceStore } from '@/runtime/memorySurfaceStore';
import { renderWithIdeProviders } from '@/test/renderWithIdeProviders';

describe('Memory', () => {
  beforeEach(() => {
    memorySurfaceStore.reset();
  });

  it('renders the visible memory viewport from the external memory surface store', () => {
    memorySurfaceStore.replaceFromRuntime({
      getMemory: () => ({
        0x1000: 0x4e,
        0x1001: 0x75,
      }),
      getMemoryMeta: () => ({
        usedBytes: 2,
        minAddress: 0x1000,
        maxAddress: 0x1001,
        version: 2,
      }),
      readMemoryRange: (address, length) => {
        const bytes = new Uint8Array(length);
        if (address === 0x1000 && length >= 2) {
          bytes[0] = 0x4e;
          bytes[1] = 0x75;
        }
        return bytes;
      },
    });

    renderWithIdeProviders(<Memory />);

    expect(screen.getByText('Used bytes: 2')).toBeInTheDocument();
    expect(screen.getByText('Address range: 0x00001000 - 0x00001001')).toBeInTheDocument();
    expect(screen.getByText('4e')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
  });
});
