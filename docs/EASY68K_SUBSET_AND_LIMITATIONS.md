# Easy68K Compatibility And Limitations

This document describes canonical Easy68K simulator compatibility layered on
top of the strict Motorola instruction core. It is separate from CPU opcode
coverage, which is recorded in the generated ISA report.

## Runtime profiles

- The strict byte-addressed core remains the only instruction execution
  authority.
- CPU model and machine profile are selected independently.
- The Bare machine exposes CPU behavior without Easy68K devices or services.
- The Easy68K machine owns terminal, trainer-board, graphics, and sound devices
  and dispatches `TRAP #15` services.

## Implemented Easy68K services

- Terminal tasks `5`, `6`, `7`, `9`, and `11` provide blocking input, output,
  polling, halt, clear-screen, and cursor behavior.
- Environment task `33` reports supported simulator capabilities.
- Graphics tasks `80` through `96` provide pixel, line, rectangle, ellipse,
  flood-fill, text, draw-mode, pen-width, cursor, double-buffer, and clear
  operations on a deterministic pixel surface.
- Sound tasks `70` through `77` provide one-shot, looping, polyphonic, stop,
  and playback-status operations backed by explicitly registered audio assets.
- The memory-mapped trainer board provides seven-segment displays, switches,
  LEDs, active-low buttons, and level 1-7 autovector interrupts.

## Graphics and sound panels

- Graphics and Sound are first-class workspace panel kinds. Multiple mirrors
  can be docked, floated, minimized, duplicated, and persisted like other
  panels.
- Graphics pixels and sound diagnostics use external runtime stores rather
  than Redux. Worker messages contain dirty rectangles and ordered sound
  commands instead of serializing live surfaces into application state.
- The bundled `graphics-sound-demo.asm` example demonstrates double-buffered
  animation, momentum-preserving wall collisions, and polyphonic playback of a
  registered WAV asset on every impact.
- Browser audio starts only after the user selects **Enable audio**, as required
  by browser autoplay policies. Muting or closing a panel does not change the
  emulated sound-device state.

## Assembler compatibility

The assembler supports standalone labels, `END <label>`, `EQU`, `DC.B/W/L`,
`DS.B/W/L`, and character immediates. The multimedia service layer does not
introduce a second assembler or execution path.

## Known limitations

- Easy68K sound file tasks can play registered project assets; arbitrary host
  filesystem paths are intentionally unavailable in the browser sandbox.
- Audio completion timing is supplied by the host audio backend and is not a
  CPU-cycle-accurate model.
- Graphics behavior is deterministic at the service boundary, but exact legacy
  Windows font rasterization and host paint timing are not emulated.
- Trainer-board DUART routines remain outside the supported machine profile.
- Pin-level bus timing, arbitration, and prefetch-stage attribution remain
  outside the functional CPU contract.
