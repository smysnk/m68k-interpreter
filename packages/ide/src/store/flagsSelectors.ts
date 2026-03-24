import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';

export const selectFlagsPanelModel = createSelector(
  [(state: RootState) => state.emulator.flags, (state: RootState) => state.emulator.registers.ccr],
  (flags, ccr) => ({
    ccrHex: `0x${ccr.toString(16).toUpperCase().padStart(2, '0')}`,
    rows: [
      { key: 'z', name: 'Z (Zero)', active: flags.z },
      { key: 'n', name: 'N (Negative)', active: flags.n },
      { key: 'v', name: 'V (Overflow)', active: flags.v },
      { key: 'c', name: 'C (Carry)', active: flags.c },
      { key: 'x', name: 'X (Extend)', active: flags.x },
    ],
  })
);
