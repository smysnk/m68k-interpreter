import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store';
import { getRegisterDescriptorsByGroup, REGISTER_GROUPS } from '@/components/registers/registerDescriptors';

export const selectRegisterFlagsHeadingModel = createSelector(
  [(state: RootState) => state.emulator.flags, (state: RootState) => state.emulator.registers.ccr],
  (flags, ccr) => ({
    currentFlags: [
      { key: 'x', label: 'X', active: flags.x },
      { key: 'n', label: 'N', active: flags.n },
      { key: 'z', label: 'Z', active: flags.z },
      { key: 'v', label: 'V', active: flags.v },
      { key: 'c', label: 'C', active: flags.c },
    ],
    ccrHex: `0x${ccr.toString(16).toUpperCase().padStart(2, '0')}`,
  })
);

export const selectRegisterGroupsModel = createSelector(
  [(state: RootState) => state.emulator.registers],
  (registers) =>
    REGISTER_GROUPS.map((group) => {
      const descriptors = getRegisterDescriptorsByGroup(group.id);

      return {
        ...group,
        descriptors,
        values: Object.fromEntries(
          descriptors.map((descriptor) => [descriptor.key, registers[descriptor.key] ?? 0])
        ) as Record<string, number>,
      };
    })
);
