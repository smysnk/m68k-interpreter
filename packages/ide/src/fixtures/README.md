# M68K Examples

Bundled example programs for the browser IDE and interpreter:

- `hello-terminal.asm` - print text to the terminal
- `echo-input.asm` - wait for one key and echo it back
- `polling-input.asm` - poll for input with canonical `TRAP #15` task `7`
- `arithmetic-registers.asm` - basic arithmetic and memory writes
- `sum-1-to-10.asm` - a simple counting loop
- `memory-copy.asm` - copy a zero-terminated string in memory
- `subroutine-stack.asm` - call a subroutine multiple times
- `flags-compare.asm` - compare values and inspect the result flags
- `nibbles.asm` - the bundled Nibbles game source used by the IDE
- `hardware-led-switches.asm` - mirror the toggle byte to the LED latch at shared address `$E00010`
- `hardware-buttons.asm` - inspect active-low push buttons and mirror them to LEDs
- `hardware-seven-segment.asm` - write patterns to the eight display bytes at `$E00000` through `$E0000E`
- `graphics-sound-demo.asm` - animate a momentum-preserving ball with double-buffered graphics and play the bundled `beep.wav` asset on every wall impact
- `hardware-interrupts.asm` - install level 1-7 autovectors, update LEDs in handlers, and return with `RTE`
- `hardware-multi-device.asm` - exercise two displays and two independently mapped digital-I/O boards

The examples use canonical Easy68K `TRAP #15` services, so you can run them and inspect the terminal, registers, flags, memory, graphics, and sound state. Most examples use task `9` to halt; the bouncing-ball multimedia demo runs continuously until you select Reset.

Each bundled source begins with a compact `; @m68k-ide/v1 key=value ...` comment. The IDE uses this header to select an appropriate session-only layout, emulation mode, speed, panel focus, and optional hardware map before resetting the program. The directive remains an ordinary assembler comment and does not change the generated program.
