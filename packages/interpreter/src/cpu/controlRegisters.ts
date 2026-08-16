export const MC68010_CONTROL_REGISTER = {
  sfc: { selector: 0x000, mask: 0x0000_0007 },
  dfc: { selector: 0x001, mask: 0x0000_0007 },
  usp: { selector: 0x800, mask: 0xffff_ffff },
  vbr: { selector: 0x801, mask: 0xffff_ffff },
} as const;

export type Mc68010ControlRegister = keyof typeof MC68010_CONTROL_REGISTER;

const CONTROL_REGISTER_BY_SELECTOR = new Map<number, Mc68010ControlRegister>(
  Object.entries(MC68010_CONTROL_REGISTER).map(([name, definition]) => [
    definition.selector,
    name as Mc68010ControlRegister,
  ])
);

export function controlRegisterFromSelector(selector: number): Mc68010ControlRegister | undefined {
  return CONTROL_REGISTER_BY_SELECTOR.get(selector & 0x0fff);
}

export function maskControlRegisterValue(register: Mc68010ControlRegister, value: number): number {
  return (value >>> 0) & MC68010_CONTROL_REGISTER[register].mask;
}
