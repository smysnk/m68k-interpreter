import type { CpuModel } from '../isa/types';

export const M68K_CONTROL_REGISTER = {
  sfc: { selector: 0x000, mask: 0x0000_0007, models: ['m68010', 'm68020'] },
  dfc: { selector: 0x001, mask: 0x0000_0007, models: ['m68010', 'm68020'] },
  cacr: { selector: 0x002, mask: 0x0000_000f, models: ['m68020'] },
  usp: { selector: 0x800, mask: 0xffff_ffff, models: ['m68010', 'm68020'] },
  vbr: { selector: 0x801, mask: 0xffff_ffff, models: ['m68010', 'm68020'] },
  caar: { selector: 0x802, mask: 0x0000_00fc, models: ['m68020'] },
  msp: { selector: 0x803, mask: 0xffff_ffff, models: ['m68020'] },
  isp: { selector: 0x804, mask: 0xffff_ffff, models: ['m68020'] },
} as const satisfies Record<
  string,
  { selector: number; mask: number; models: readonly CpuModel[] }
>;

/** @deprecated Use M68K_CONTROL_REGISTER. */
export const MC68010_CONTROL_REGISTER = {
  sfc: M68K_CONTROL_REGISTER.sfc,
  dfc: M68K_CONTROL_REGISTER.dfc,
  usp: M68K_CONTROL_REGISTER.usp,
  vbr: M68K_CONTROL_REGISTER.vbr,
} as const;

export type M68kControlRegister = keyof typeof M68K_CONTROL_REGISTER;
/** @deprecated Use M68kControlRegister. */
export type Mc68010ControlRegister = keyof typeof MC68010_CONTROL_REGISTER;

const CONTROL_REGISTER_BY_SELECTOR = new Map<number, M68kControlRegister>(
  Object.entries(M68K_CONTROL_REGISTER).map(([name, definition]) => [
    definition.selector,
    name as M68kControlRegister,
  ])
);

function isRegisterAvailable(register: M68kControlRegister, cpuModel: CpuModel): boolean {
  return (M68K_CONTROL_REGISTER[register].models as readonly CpuModel[]).includes(cpuModel);
}

export function controlRegisterFromSelector(
  selector: number,
  cpuModel: CpuModel = 'm68010'
): M68kControlRegister | undefined {
  const register = CONTROL_REGISTER_BY_SELECTOR.get(selector & 0x0fff);
  return register !== undefined && isRegisterAvailable(register, cpuModel)
    ? register
    : undefined;
}

export function maskControlRegisterValue(register: M68kControlRegister, value: number): number {
  return (value >>> 0) & M68K_CONTROL_REGISTER[register].mask;
}

export function controlRegistersForModel(cpuModel: CpuModel): readonly M68kControlRegister[] {
  return (Object.keys(M68K_CONTROL_REGISTER) as M68kControlRegister[]).filter((register) =>
    isRegisterAvailable(register, cpuModel)
  );
}
