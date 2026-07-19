# M68K Examples

Bundled example programs for the browser IDE and interpreter:

- `hello-terminal.asm` - print text to the terminal
- `echo-input.asm` - wait for one key and echo it back
- `polling-input.asm` - poll for input with `TRAP #15` task `4`
- `arithmetic-registers.asm` - basic arithmetic and memory writes
- `sum-1-to-10.asm` - a simple counting loop
- `memory-copy.asm` - copy a zero-terminated string in memory
- `subroutine-stack.asm` - call a subroutine multiple times
- `flags-compare.asm` - compare values and inspect the result flags
- `nibbles.asm` - the bundled Nibbles game source used by the IDE
- `hardware-led-switches.asm` - mirror the toggle byte to the LED latch at shared address `$E00010`
- `hardware-buttons.asm` - inspect active-low push buttons and mirror them to LEDs
- `hardware-seven-segment.asm` - write patterns to the eight display bytes at `$E00000` through `$E0000E`
- `hardware-interrupts.asm` - install level 1-7 autovectors, update LEDs in handlers, and return with `RTE`

Most of these examples halt with `TRAP #11` task `0`, so you can run them and inspect the terminal, registers, flags, and memory.
