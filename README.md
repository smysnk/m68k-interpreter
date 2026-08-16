# M68K Interpreter [![tests](https://github.com/smysnk/m68k-interpreter/actions/workflows/ci-cd.yml/badge.svg?branch=main)](https://github.com/smysnk/m68k-interpreter/actions/workflows/ci-cd.yml) [![coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fsmysnk.github.io%2Fm68k-interpreter%2Fbadges%2Fcoverage.json)](https://github.com/smysnk/m68k-interpreter/actions/workflows/ci-cd.yml) [![site](https://img.shields.io/website?url=https%3A%2F%2Fsmysnk.com%2Fm68k-interpreter&label=site)](https://smysnk.com/m68k-interpreter)

**Hosted Demo:** [**smysnk.com/m68k-interpreter**](https://smysnk.com/m68k-interpreter)

[![M68K Interpreter demo video](assets/m68k-interpreter-demo.webp)](https://github.com/user-attachments/assets/ec1eefff-b997-4261-bd53-46690e0b6075)

**[▶ Watch the HD demo](https://github.com/user-attachments/assets/ec1eefff-b997-4261-bd53-46690e0b6075)** · **[Play Nibbles](https://smysnk.com/nibbles)**

This demo is running my old [m68k-nibbles](https://github.com/smysnk/m68k-nibbles) game, which I originally wrote for a college assembly class back in 2007. I always wished someone would eventually build a 68000 browser emulator so I could bring it back to life, so I was excited when I found [gianlucarea's m68k-interpreter project](https://github.com/gianlucarea/m68k-interpreter). I took a little liberty with this fork to adapt the interface, auto-load the game, and add a screen terminal emulator so the project could feel closer to the original experience. If you enjoy this version, please consider showing some support to the upstream project too.

A Motorola 68000 assembly emulator that runs entirely in the browser.  
Write, step through, and debug m68k assembly — no installation needed.

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
- Independently addressable EASy68K panels for seven-segment displays, aligned switches/LEDs/active-low buttons, and CPU interrupt requests
- Level 1–7 autovector interrupts, SR masking, automatic IRQ scheduling, and `RTE`

## Runtime shape

- the strict byte-addressed core is the single instruction execution authority
- the public `Emulator` API is a compatibility facade over that core
- browser execution and `nibbles.asm` run through the same worker-backed strict runtime
- MC68000, MC68010 Extensions, and Easy68K modes are selected from the bottom status bar

## IDE architecture

- The shell follows a view/controller Redux pattern
- Top-level interface components are store-connected and prop-free
- Selectors own derived UI models
- Controller hooks own browser/runtime side effects
- Terminal, memory, and live hardware snapshots stay outside Redux in external surface stores

See [docs/VIEW_CONTROLLER_REDUX_CONVENTIONS.md](docs/VIEW_CONTROLLER_REDUX_CONVENTIONS.md) for the current architecture rules.

---

<!--
## Examples

The [`packages/ide/src/fixtures/`](./packages/ide/src/fixtures) folder contains bundled example programs to get started:

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

React 19 · Redux Toolkit · TypeScript · Vite · Vitest · Playwright

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

- `VITE_IDE_PRELOAD_FILE=nibbles.asm` selects which known file should be loaded on startup. You can use the file id, name, or path, for example `example:nibbles.asm`, `nibbles.asm`, or `fixtures/nibbles.asm`.
- `VITE_IDE_AUTOPLAY=true` runs the loaded program automatically on boot.

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
