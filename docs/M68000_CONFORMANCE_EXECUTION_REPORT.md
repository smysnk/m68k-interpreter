# MC68000 Conformance Execution Report

Executed: 2026-08-15

## Outcome

The strict binary CPU core is now the single execution authority used by the
public `Emulator` facade, IDE, and worker. The normalized ISA inventory contains
116 distinct strict MC68000 forms, 2 MC68010 extension forms, and 1 Easy68K
compatibility form. All 116 strict forms are classified as conformant; missing,
partial, and audit-required counts are zero.

The original count of 117 strict forms included a duplicate `RTE` manifest row.
Removing that duplicate changed the denominator without removing an instruction.
The generated evidence matrix is in
[M68000_ISA_COVERAGE.md](./generated/M68000_ISA_COVERAGE.md).

## Product Integration

- Source is assembled into an exact byte-addressed program image before it is
  executed by the strict core.
- The Easy68K terminal, trap, interrupt, and trainer-board behavior is isolated
  in the compatibility layer rather than the CPU instruction implementation.
- MC68000, MC68010 Extensions, and Easy68K modes are visible and selectable in
  the bottom status bar, persisted with IDE preferences, and sent explicitly to
  the worker when a program is loaded.
- A successfully accepted autovector is treated as a normal runtime transition
  by the facade, so the worker continues into the interrupt handler. The direct
  strict-core API retains its detailed exception-entry result for conformance
  inspection.

## Oracle Results

The bounded Musashi and Moira differential suites pass. The complete local MAME
single-step corpus audit reports:

| Result                        |   Count |
| ----------------------------- | ------: |
| Families                      |     127 |
| Vectors                       | 317,500 |
| Exact matches                 | 259,501 |
| Reviewed temporal quarantines |  57,999 |
| Unexplained differences       |       0 |

The reviewed quarantines are deliberately excluded from the exact-match count:

| Quarantine                               |  Count | Reason                                                                                                                                   |
| ---------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Address-error frame and bus sequencing   | 47,580 | The architectural address error is raised, but the core does not yet model the exact internal 14-byte frame and microcycle bus sequence. |
| Target-prefetch or `STOP` PC attribution |  9,256 | The non-prefetch core observes the target fault on the next step instead of modelling the processor pipeline stage.                      |
| `CHK` saved CCR bits                     |  1,163 | Only architecturally undefined condition-code bits differ in the saved exception frame.                                                  |

`yarn test:oracles:mame` fails if a difference does not match one of these
reviewed classifications.

## Performance Comparison

The pre-refactor workload was reconstructed from detached commit `5e19af7`.
Both sides used the unchanged original workloads, 10 warmups, 50 measured runs,
Node 22.17.0, macOS arm64, and the same host. Raw samples, median, p95, MAD, CPU,
and heap profiles are retained under `.test-results/m68000-conformance/`.

| Original workload | Pre-refactor median | Post-cutover median | Change |
| ----------------- | ------------------: | ------------------: | -----: |
| Cold source load  |            0.656 ms |            0.646 ms |  -1.6% |
| Arithmetic loop   |            0.513 ms |            0.521 ms |  +1.6% |
| Branch loop       |            0.554 ms |            0.551 ms |  -0.7% |
| Memory roundtrip  |            0.590 ms |            0.567 ms |  -3.9% |

Negative changes are improvements. The arithmetic result remains inside the
measured noise band. `yarn profile:m68000:compare` enforces the current variance-aware policy:
an elapsed-time median may not regress by more than 10% or two baseline MADs,
whichever is wider. All four unchanged workloads pass. Additional arithmetic
scenarios cover MC68000 and MC68010 initialization and execution separately.

Test Station now publishes elapsed-time p95 and MAD alongside its existing
median, throughput, memory, CPU, and step metrics.

## Release Validation

- Test Station without coverage: 405/405 tests passed across 9 suites.
- Test Station with coverage: 405/405 passed; 69.62% lines, 62.04% branches,
  71.98% functions, and 69.01% statements.
- Interpreter package: 169/169 passed.
- IDE package: 222/222 passed.
- Workspace integration: 3/3 passed.
- Browser E2E: 28/28 passed, including Nibbles, mode persistence, panel docking,
  and independently addressed hardware panels with live interrupts.
- Musashi/Moira oracle suites: 9/9 passed.
- Type-check, build, generated-report consistency, and lint complete; lint has
  no errors and retains 18 pre-existing warnings.

## Reproduction

```sh
yarn generate:isa-report
yarn test:oracles
yarn test:oracles:mame
yarn profile:m68000:final
yarn profile:m68000:compare
PLAYWRIGHT_PORT=4273 yarn test:station:coverage
```

The default Playwright port can be used when port 4173 is available. Port 4273
was selected for this run because another local project owned port 4173.
