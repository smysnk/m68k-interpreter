import type { Registers } from '@m68k/interpreter';
import type { RegisterBitWidth, RegisterDecimalMode } from './registerFormatting';

export type RegisterGroupId = 'data' | 'address' | 'control';
export type RegisterName = keyof Registers;

export interface RegisterGroupDescriptor {
  id: RegisterGroupId;
  title: string;
  subtitle: string;
}

export interface RegisterDescriptor {
  key: RegisterName;
  label: string;
  groupId: RegisterGroupId;
  bitWidth: RegisterBitWidth;
  decimalMode: RegisterDecimalMode;
  editable: boolean;
}

export const REGISTER_GROUPS: readonly RegisterGroupDescriptor[] = [
  {
    id: 'data',
    title: 'Data Registers (D0-D7)',
    subtitle: 'Arithmetic and general-purpose state.',
  },
  {
    id: 'address',
    title: 'Address Registers (A0-A7)',
    subtitle: 'Pointers, stack, and effective-address state.',
  },
  {
    id: 'control',
    title: 'Control Registers',
    subtitle: 'Program flow and condition codes.',
  },
] as const;

export const REGISTER_DESCRIPTORS: readonly RegisterDescriptor[] = [
  { key: 'd0', label: 'D0', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd1', label: 'D1', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd2', label: 'D2', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd3', label: 'D3', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd4', label: 'D4', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd5', label: 'D5', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd6', label: 'D6', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'd7', label: 'D7', groupId: 'data', bitWidth: 32, decimalMode: 'signed', editable: true },
  { key: 'a0', label: 'A0', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a1', label: 'A1', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a2', label: 'A2', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a3', label: 'A3', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a4', label: 'A4', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a5', label: 'A5', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a6', label: 'A6', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'a7', label: 'A7', groupId: 'address', bitWidth: 32, decimalMode: 'unsigned', editable: true },
  { key: 'pc', label: 'PC', groupId: 'control', bitWidth: 32, decimalMode: 'unsigned', editable: false },
  { key: 'ccr', label: 'CCR', groupId: 'control', bitWidth: 8, decimalMode: 'unsigned', editable: false },
  { key: 'sr', label: 'SR', groupId: 'control', bitWidth: 16, decimalMode: 'unsigned', editable: false },
  { key: 'usp', label: 'USP', groupId: 'control', bitWidth: 32, decimalMode: 'unsigned', editable: false },
  { key: 'ssp', label: 'SSP', groupId: 'control', bitWidth: 32, decimalMode: 'unsigned', editable: false },
] as const;

export function getAllRegisterDescriptors(): readonly RegisterDescriptor[] {
  return REGISTER_DESCRIPTORS;
}

export function getRegisterDescriptor(registerName: RegisterName): RegisterDescriptor | undefined {
  return REGISTER_DESCRIPTORS.find((descriptor) => descriptor.key === registerName);
}

export function getRegisterDescriptorsByGroup(groupId: RegisterGroupId): RegisterDescriptor[] {
  return REGISTER_DESCRIPTORS.filter((descriptor) => descriptor.groupId === groupId);
}
