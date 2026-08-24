# MC68020 Extension Architecture

## Decision

The emulator represents CPU, machine, optional coprocessors, and execution
accuracy as independent configuration dimensions:

- `CpuModel` selects integer architecture (`m68000`, `m68010`, or `m68020`).
- `MachineProfile` selects the board memory map and simulator services.
- `CoprocessorRegistry` owns zero or more architectural coprocessor-ID slots.
- `ExecutionAccuracy` remains separate from functional CPU identity.

Combined CPU identifiers such as `m68020-with-68882` are intentionally not
supported. An FPU and MMU can coexist and must retain independent state,
compatibility, and exception ownership.

## Boundaries

`AddressSpacePolicy` owns logical width, wrapping, and alignment. The optional
`AddressTranslationPort` receives logical address, size, function code,
instruction/data intent, privilege, and atomicity before the physical bus is
accessed. With no translator, the core uses the physical bus directly.

`CoprocessorRegistry` dispatches typed protocol requests by coprocessor ID. A
request carries the operation class, command and extension words, instruction
context, and controlled effective-address access when applicable. Results can
complete, return a condition or opaque bytes, raise an architectural exception,
report a protocol violation, or suspend deterministically.

`M68kSystemSnapshot` versions and namespaces CPU, coprocessor, translator, and
execution state. Device identity is checked before restoration; state is never
silently applied to a different attachment.

`ModuleAccessPort` owns `CALLM`/`RTM` integration. The default port raises a
deterministic architectural exception rather than embedding application module
lookup in the CPU.

## Evidence

Contract tests cover two simultaneous coprocessors, opaque state restoration,
generic commands, conditional protocol operations, save/restore memory transfer,
no-device exceptions, translation/remap/protection behavior, atomic translation,
and namespaced system snapshots.

The architecture follows the protocol and state separation described by the
[M68000 Family Programmer's Reference Manual](https://www.nxp.com/docs/en/reference-manual/M68000PRM.pdf)
and the
[MC68020 User's Manual](https://www.nxp.com/docs/en/data-sheet/MC68020UM.pdf).

## Deferred implementations

- MC68881/MC68882 arithmetic, exact floating-point registers, conditions, and
  exception semantics.
- MC68851 descriptors, page walks, ATC, protection, control registers, and PMMU
  instructions.
- Cycle, bus, pin, and pipeline timing accuracy.

Those follow-on implementations should attach through these boundaries and must
have independent manifests, oracle evidence, snapshots, and performance gates.
