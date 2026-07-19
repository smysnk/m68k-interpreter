export const SR_TRACE_MASK = 0x8000;
export const SR_SUPERVISOR_MASK = 0x2000;
export const SR_INTERRUPT_MASK = 0x0700;
export const SR_CCR_MASK = 0x001f;

export function normalizeStatusRegister(value: number): number {
  return value & 0xffff;
}

export function getStatusRegisterCCR(statusRegister: number): number {
  return statusRegister & SR_CCR_MASK;
}

export function setStatusRegisterCCR(statusRegister: number, ccr: number): number {
  return normalizeStatusRegister((statusRegister & ~SR_CCR_MASK) | (ccr & SR_CCR_MASK));
}

export function isSupervisorMode(statusRegister: number): boolean {
  return (statusRegister & SR_SUPERVISOR_MASK) !== 0;
}

export function getInterruptMaskLevel(statusRegister: number): number {
  return (statusRegister & SR_INTERRUPT_MASK) >>> 8;
}

export function setInterruptMaskLevel(statusRegister: number, level: number): number {
  const normalizedLevel = Math.max(0, Math.min(7, Math.trunc(level)));
  return normalizeStatusRegister(
    (statusRegister & ~SR_INTERRUPT_MASK) | (normalizedLevel << 8)
  );
}

export function enterInterruptStatus(statusRegister: number, level: number): number {
  return setInterruptMaskLevel(
    (normalizeStatusRegister(statusRegister) | SR_SUPERVISOR_MASK) & ~SR_TRACE_MASK,
    level
  );
}

export function isInterruptLevelEligible(statusRegister: number, level: number): boolean {
  return level === 7 || level > getInterruptMaskLevel(statusRegister);
}
