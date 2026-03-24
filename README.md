[![M68K Interpreter Demo](https://raw.githubusercontent.com/smysnk/m68k-interpreter/main/docs/assets/m68k-interpreter-nibbles-demo.webp)](https://github.com/smysnk/m68k-interpreter/releases/download/readme-assets/m68k-interpreter-nibbles-demo.mp4)

This demo is running my old [m68k-nibbles](https://github.com/smysnk/m68k-nibbles) game, which I originally wrote for a college assembly class back in 2007. I always wished someone would eventually build a 68000 browser emulator so I could bring it back to life, so I was excited when I found [gianlucarea's m68k-interpreter project](https://github.com/gianlucarea/m68k-interpreter). I took a little liberty with this fork to adapt the interface, auto-load the game, and add a screen terminal emulator so the project could feel closer to the original experience.

# m68k-interpreter

[![tests](https://img.shields.io/endpoint?url=https%3A%2F%2Ftest-station.smysnk.com%2Fapi%2Fbadges%2Ftests.json%3FprojectKey%3Dm68k-interpreter)](https://test-station.smysnk.com/projects/m68k-interpreter)
[![coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Ftest-station.smysnk.com%2Fapi%2Fbadges%2Fcoverage.json%3FprojectKey%3Dm68k-interpreter)](https://test-station.smysnk.com/projects/m68k-interpreter)
[![health](https://img.shields.io/endpoint?url=https%3A%2F%2Ftest-station.smysnk.com%2Fapi%2Fbadges%2Fhealth.json%3FprojectKey%3Dm68k-interpreter)](https://test-station.smysnk.com/projects/m68k-interpreter)

A Motorola 68000 assembly emulator that runs entirely in the browser.  
Write, step through, and debug m68k assembly — no installation needed.

**[→ Live demo](https://smysnk.github.io/m68k-interpreter/)**

---

## Why this exists

[Easy68K](http://www.easy68k.com/) is the standard tool for learning m68k assembly in university courses. It's Windows-only, requires installation, and hasn't been updated in years. This runs in any browser, on any OS, with zero setup.

---

## Features

- Step-by-step execution with full undo/redo history
- Live register viewer and memory inspector
- Detailed error reporting with line context
- Preloaded examples covering common patterns
- Export register and memory state to file
- Terminal-mode execution path for `nibbles.asm`
- Runtime batching and keyboard capture for browser-playable terminal programs
- Engine dropdown with default `Interpreter` and experimental `Interpreter Redux`

## Supported instructions

**Arithmetic** — `ADD` `ADDA` `ADDI` `SUB` `SUBA` `SUBI`  
**Logic** — `AND` `ANDI` `EOR` `EORI` `NOT` `OR` `ORI`  
**Data movement** — `CLR` `EXG` `EXT` `MOVE` `MOVEA` `NEG` `SWAP`  
**Shifts & rotates** — `ASL` `ASR` `LSL` `LSR` `ROL` `ROR`  
**Comparisons** — `CMP` `CMPA` `CMPI` `TST`  
**Control flow** — `JMP` `JSR` `RTS` `BRA` `BSR` `BEQ` `BNE` `BGE` `BGT` `BLE` `BLT`

## Easy68K subset notes

The current terminal build is aimed at the Easy68K subset needed by `nibbles.asm`, including `EQU`, `DC.*`, `DS.*`, trap tasks `1`, `3`, `4`, and `TRAP #11` halt. See [docs/EASY68K_SUBSET_AND_LIMITATIONS.md](docs/EASY68K_SUBSET_AND_LIMITATIONS.md) for the supported subset and known limitations.

## Runtime shape

- `Interpreter` is the default IDE runtime and the supported path for `nibbles.asm`
- `Interpreter Redux` is available as an experimental alternate engine for reducer-runtime parity work and store integration
- `Load Nibbles` intentionally switches the IDE back to `Interpreter` so the main demo path stays playable

## IDE architecture

- The shell follows a view/controller Redux pattern
- Top-level interface components are store-connected and prop-free
- Selectors own derived UI models
- Controller hooks own browser/runtime side effects
- Terminal and memory byte buffers stay outside Redux in external surface stores

See [docs/VIEW_CONTROLLER_REDUX_CONVENTIONS.md](docs/VIEW_CONTROLLER_REDUX_CONVENTIONS.md) for the current architecture rules.

---
<!-- 
## Examples

The [`examples/`](./examples) folder contains annotated programs to get started:

| File | What it demonstrates |
|---|---|
| `fibonacci.asm` | Loops, D registers, branching |
| `factorial.asm` | Recursion via JSR/RTS, stack discipline |
| `bubble_sort.asm` | Nested loops, memory addressing, CMPI |
| `stack_ops.asm` | MOVE to/from stack pointer, subroutine conventions |
| `hello_world.asm` | Basic MOVE and output |
| `loop_counter.asm` | DBRA countdown loop |

Each file is commented line by line — useful if you are following a computer architecture course.
--- 
-->

## Built with

React 18 · Redux Toolkit · TypeScript · Next.js 15 · Vitest

---

## Run locally

```bash
git clone https://github.com/gianlucarea/m68k-interpreter.git
cd m68k-interpreter
yarn install
cp .env.example .env
yarn dev
```

```bash
yarn dev:raw         # bypass mono-helper and use your own WEB_* env vars
yarn build           # production build
yarn test            # run tests
yarn type-check      # workspace type-check
```

Boot-time IDE env vars:
- `NEXT_PUBLIC_IDE_PRELOAD_FILE=nibbles.asm` selects which known file should be loaded on startup. You can use the file id, name, or path, for example `example:nibbles.asm`, `nibbles.asm`, or `examples/nibbles.asm`.
- `NEXT_PUBLIC_IDE_AUTOPLAY=true` runs the loaded program automatically on boot.

---

## For educators

If you teach a course that uses Easy68K, this works as a drop-in browser-based alternative — no student setup required. If you use it in your course and want it listed here, open an issue or send an email.

---

## Acknowledgments

Special thanks to [MarkeyJester's Motorola 68000 Beginner's Tutorial](https://mrjester.hapisan.com/04_MC68/Index.html) — an excellent reference for instruction behavior, cycle times, and assembly fundamentals that informed this implementation.

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
