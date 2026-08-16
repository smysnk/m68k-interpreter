export interface ModuleCallRequest {
  readonly module: number;
  readonly entryAddress: number;
  readonly returnAddress: number;
  readonly stackPointer: number;
}

export interface ModuleReturnRequest {
  readonly generalRegister: number;
  readonly registerValue: number;
  readonly stackPointer: number;
}

export type ModuleAccessResult =
  | { readonly kind: 'completed'; readonly programCounter: number; readonly stackPointer?: number }
  | { readonly kind: 'exception'; readonly vector: number; readonly message: string };

/** Machine-owned integration seam for the MC68020 module-call protocol. */
export interface ModuleAccessPort {
  call(request: ModuleCallRequest): ModuleAccessResult;
  return(request: ModuleReturnRequest): ModuleAccessResult;
}

export const NO_MODULE_ACCESS: ModuleAccessPort = Object.freeze({
  call: () => ({
    kind: 'exception' as const,
    vector: 4,
    message: 'CALLM requires a machine module-access service',
  }),
  return: () => ({
    kind: 'exception' as const,
    vector: 4,
    message: 'RTM requires a machine module-access service',
  }),
});
