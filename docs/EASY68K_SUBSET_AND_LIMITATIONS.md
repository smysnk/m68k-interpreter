# Easy68K Subset And Limitations

This workspace now includes a terminal-first path for running `nibbles.asm` in the browser IDE.

## Runtime modes

- The classic `Interpreter` is the only IDE runtime.
- `nibbles.asm` runs through the worker-backed classic interpreter path.

## Quick start

1. Load `nibbles.asm` with the `Load Nibbles` command.
2. Press `Run`.
3. Use `W`, `A`, `S`, `D`, arrow keys, or keypad `4`, `5`, `6`, `8`.
4. Press `Enter` to confirm menu selections.
5. Use `Reset` to clear the current emulator session and terminal before replaying.

## Supported Easy68K subset

- Assembler compatibility:
  - standalone labels
  - `END <label>`
  - `EQU`
  - `DC.B`, `DC.W`, `DC.L`
  - `DS.B`, `DS.W`, `DS.L`
  - character immediates such as `#'w'`
- Runtime coverage used by Nibbles:
  - `MOVE`, `MOVEA`, `LEA`, `CLR`, `CMP`
  - branch and subroutine flow including `BRA`, `Bxx`, `BSR`, `JSR`, `RTS`
  - `MULU`, `DIVU`, `MOVEM`, `BTST`
  - register indirect, predecrement, postincrement, and indexed memory forms used by the game
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

- This is a targeted Easy68K subset for terminal-oriented programs. It is not full Easy68K compatibility.
- Trainer board DUART routines are still out of scope for this build.
- The built-in Hardware I/O Board implements the EASy68K seven-segment display, switches, LEDs, active-low buttons, and level 1–7 autovector interrupts. Other generic graphics or framebuffer devices remain outside the current subset.
- Execution is tuned for browser playability and deterministic testing, not cycle accuracy.
- The IDE currently uses the internal fixed-grid terminal adapter path; broader display-surface integration remains future work.
