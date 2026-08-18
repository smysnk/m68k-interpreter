# Compact source IDE directive implementation plan

## Objective

Allow an assembly source file to place one versioned comment on its first nonblank line that configures the IDE for that program without changing assembler semantics:

```asm
; @m68k-ide/v1 layout=hardware-lab machine=easy68k cpu=m68000 focus=hardware-digital-io speed=1 run=auto
```

Source-directed settings are session-local. They must not overwrite the user's persisted workspace preferences, and manual changes after activation remain effective until the source is reloaded or its configuration is explicitly reapplied.

## V1 grammar

- Prefix: `; @m68k-ide/v1` or column-one Easy68K comment form `* @m68k-ide/v1`.
- Location: first nonblank line only, with an optional UTF-8 BOM.
- Body: whitespace-separated `key=value` tokens; no quoting or executable expressions.
- Duplicate keys, unknown keys, malformed values, invalid device maps, and headers longer than 1,024 characters invalidate the configuration but never prevent assembly.
- Keys: `layout`, `machine`, `cpu`, `focus`, `speed`, `run`, `memory`, `display`, `digital-io`, `graphics-scale`, and `graphics-smoothing`.
- Address values accept `$` hexadecimal, `0x` hexadecimal, or decimal. Address lists use commas.
- Deployment autoplay policy is an upper bound: a source may disable autoplay, but cannot bypass `VITE_IDE_AUTOPLAY=false`.

## Phases

1. [x] Add a pure parser and resolver with strict typed validation and deterministic diagnostics.
2. [x] Add session-only source configuration state, including the pre-directive preference baseline, applied status, warnings, ignore, and reapply intent.
3. [x] Add one controller for initial source hydration and file activation. Apply layout and hardware before runtime reset, then permit autoplay only after the configured runtime surface is ready.
4. [x] Add a status-bar control exposing applied/invalid state plus Reapply and Ignore actions.
5. [x] Add compact headers to every bundled example. Leave `scratch.asm` unconfigured so it inherits user preferences.
6. [x] Add parser, resolver, store/controller, fixture-contract, and browser coverage. Validate type-checking, lint, build, assembly, runtime behavior, and exact panel/device presentation.

## Example migration

- Multimedia: `graphics-sound-demo.asm` uses the multimedia layout focused on graphics.
- Multi-device hardware: `hardware-multi-device.asm` declares displays at `$E00000,$E00020` and digital I/O at `$E00040,$E00050`.
- Standard hardware: LED/switch, button, interrupt, and seven-segment fixtures use Hardware Lab with the relevant panel focused.
- Terminal programs: Nibbles, hello, echo, and polling input use Terminal Focus.
- Inspection programs: arithmetic and sum focus registers; memory copy opens memory at `$1000`; subroutine and flags examples use Debug at quarter speed without autoplay.

## Acceptance criteria

- Every bundled fixture has exactly one valid directive and still assembles.
- Selecting an example applies its declared CPU, machine, layout, focus, speed, memory view, and hardware map before reset.
- `run=manual` never autoplays; `run=auto` respects deployment policy.
- Switching to an unconfigured file restores the pre-directive session baseline.
- Persisted preferences serialize the baseline rather than source-owned overrides.
- Invalid directives are visible but non-blocking.
- Multimedia and multi-device examples are proven in the browser against their real panels and device addresses.

## Completion evidence

- `yarn test:ide`: 51 files and 252 tests passed, including directive parsing, controller behavior, and the all-fixtures assembly contract.
- `yarn test:interpreter`: 29 files and 275 tests passed.
- `yarn test:integration`: 3 tests passed.
- `yarn type-check`, `yarn lint`, and `git diff --check` completed without errors.
- Playwright directive coverage passed 2 tests for terminal, multimedia, multi-device, manual/debug, baseline restoration, Ignore, and Reapply behavior.
- Live browser verification confirmed two display panels and two digital-I/O panels for `hardware-multi-device.asm`, with all four source-declared panels visible.
