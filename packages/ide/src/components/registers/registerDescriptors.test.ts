import { describe, expect, it } from 'vitest';
import {
  REGISTER_GROUPS,
  getAllRegisterDescriptors,
  getRegisterDescriptor,
  getRegisterDescriptorsByGroup,
} from './registerDescriptors';

describe('registerDescriptors', () => {
  it('defines the expected register groups and visible register inventory', () => {
    expect(REGISTER_GROUPS.map((group) => group.id)).toEqual(['data', 'address', 'control']);
    expect(getAllRegisterDescriptors()).toHaveLength(21);
    expect(getRegisterDescriptorsByGroup('data').map((descriptor) => descriptor.key)).toEqual([
      'd0',
      'd1',
      'd2',
      'd3',
      'd4',
      'd5',
      'd6',
      'd7',
    ]);
  });

  it('marks control register widths and editability correctly', () => {
    expect(getRegisterDescriptor('pc')).toMatchObject({
      bitWidth: 32,
      decimalMode: 'unsigned',
      editable: false,
    });
    expect(getRegisterDescriptor('ccr')).toMatchObject({
      bitWidth: 8,
      decimalMode: 'unsigned',
      editable: false,
    });
    expect(getRegisterDescriptor('sr')).toMatchObject({
      bitWidth: 16,
      decimalMode: 'unsigned',
      editable: false,
    });
    expect(getRegisterDescriptor('usp')).toMatchObject({
      bitWidth: 32,
      decimalMode: 'unsigned',
      editable: false,
    });
  });
});
