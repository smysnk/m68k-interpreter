# Easy68K Subset And Limitations

This document describes Easy68K simulator compatibility layered on top of the
complete strict MC68000 instruction core. It is not the MC68000 instruction
coverage list; see the generated ISA report for that evidence.

## Runtime modes

- The strict byte-addressed core is the only instruction execution authority.
- The `Emulator` composes either supported CPU model with either the Bare or
  Easy68K machine adapter.
- `nibbles.asm` defaults to MC68000 plus the worker-backed Easy68K machine.

## Quick start

1. Load `nibbles.asm` with the `Load Nibbles` command.
2. Press `Run`.
3. Use `W`, `A`, `S`, `D`, arrow keys, or keypad `4`, `5`, `6`, `8`.
4. Press `Enter` to confirm menu selections.
5. Use `Reset` to clear the current emulator session and terminal before replaying.

## Supported Easy68K compatibility subset

- Assembler compatibility:
  - standalone labels
  - `END <label>`
  - `EQU`
  - `DC.B`, `DC.W`, `DC.L`
  - `DS.B`, `DS.W`, `DS.L`
  - character immediates such as `#'w'`
- Complete strict MC68000 instruction execution, independently audited in the
  generated ISA evidence matrix.
- Easy68K trap services currently implemented:
  - `TRAP #15` task `1` for output
  - `TRAP #15` task `3` for blocking input
  - `TRAP #15` task `4` for keyboard polling
  - `TRAP #11` task `0` for halt
- Terminal support:
  - clear screen
  - cursor positioning
  - carriage return and line feed
  - ANSI SGR color and style sequences used by Nibbles

## Known limitations

- Easy68K simulator services remain a targeted compatibility subset; this does
  not limit strict MC68000 instruction coverage.
- Trainer board DUART routines are still out of scope for this build.
- The built-in Hardware I/O Board implements the EASy68K seven-segment display, switches, LEDs, active-low buttons, and level 1–7 autovector interrupts. Other generic graphics or framebuffer devices remain outside the current subset.
- Architectural results are conformance-tested. Exact MC68000 address-error
  microcycles, internal frame words, and prefetch-stage attribution remain
  reviewed temporal-conformance quarantines.
- The IDE currently uses the internal fixed-grid terminal adapter path; broader display-surface integration remains future work.
