# MC68010 Functional Conformance Execution Report

Completed: 2026-08-16
Starting commit: `3ab7d42d66b271d668aab0a08b29edbdc31afc9c`

## Result

The `m68010` CPU selection now implements the complete programmer-visible
MC68010 contract targeted by this project. It retains all 116 tracked MC68000
forms and adds all seven tracked MC68010-specific forms. The product label is
therefore `MC68010`, rather than `MC68010 Extensions`.

The generated [MC68010 functional inventory](generated/MC68010_FUNCTIONAL_INVENTORY.md)
is the denominator for the completion claim. The generated
[ISA coverage matrix](generated/M68000_ISA_COVERAGE.md) records the shared and
model-specific evidence.

## Implemented Architecture

- `BKPT`, both `MOVEC` directions, both `MOVES` directions, `RTD`, and
  `MOVE from CCR`, including model legality and privilege behavior.
- VBR, SFC, and DFC state with reset, snapshot, restoration, undo, worker-frame,
  editor-command, and register-panel propagation.
- User/supervisor program and data function codes, MOVES SFC/DFC overrides, and
  CPU-space breakpoint-acknowledge events.
- VBR-relative lookup for every MC68010 exception and interrupt vector.
- MC68010 format-0 normal frames, format-8 bus/address-fault frames, `RTE`
  validation/restoration, and vector-14 format errors.
- Instruction transactions that roll back unintended register, flag, address,
  and RAM mutations before a restartable fault frame is entered.
- MC68010 privilege correction for `MOVE from SR` without changing MC68000
  behavior.

## Correctness Evidence

| Gate                                        | Result                                     |
| ------------------------------------------- | ------------------------------------------ |
| MC68010 instruction/exception focused tests | 89/89 passed                               |
| Interpreter package                         | 257/257 passed                             |
| IDE package                                 | 231/231 passed                             |
| Workspace integration                       | 3/3 passed                                 |
| Browser E2E                                 | 30/30 passed                               |
| Musashi/Moira oracle suite                  | 10/10 passed                               |
| Primary-word classification                 | 65,536/65,536 under each CPU model         |
| MC68000 MAME audit                          | 317,500 vectors; 0 unexplained differences |
| Recursive Test Station                      | 503/503 passed                             |

The deterministic MOVES matrix covers 42 legal effective-address, size, and
direction combinations, plus sign extension, A7 byte stepping, privilege,
illegal addressing, function-code routing, and transactional faults. Browser
coverage executes MOVEC/MOVES, displays VBR/SFC/DFC, relocates IRQ1 through VBR,
and repeats the flow with both Bare and Easy68K machines.

The MAME audit remains unchanged at 259,501 exact vectors and 57,999 reviewed
temporal quarantines, for 317,500 total vectors and zero unexplained results.

## Performance Evidence

Node engine measurements used 10 warmups and 50 retained samples. All unchanged
workloads pass the variance-aware median, p95, throughput, and heap gates.

| Scenario                | Baseline median | Final median | Change | Gate |
| ----------------------- | --------------: | -----------: | -----: | ---- |
| Cold source load        |        0.638 ms |     0.601 ms |  -5.8% | PASS |
| Shared arithmetic loop  |        0.483 ms |     0.533 ms | +10.4% | PASS |
| MC68000 arithmetic loop |        0.326 ms |     0.335 ms |  +2.9% | PASS |
| MC68010 arithmetic loop |        0.308 ms |     0.311 ms |  +1.1% | PASS |
| Branch pressure         |        0.496 ms |     0.569 ms | +14.7% | PASS |
| Memory round trip       |        0.538 ms |     0.455 ms | -15.5% | PASS |

The new MC68010 control/MOVES/BKPT/VBR/RTE workload has a 0.263 ms median,
0.369 ms p95, and approximately 68,523 steps/second. It is reported as a new
workload and is not compared against a nonexistent pre-change baseline.

All four browser runtime scenarios pass. Desktop and mobile program timings
range from -1.4% to +4.5%. Hardware acknowledgement uses the wider of 15% or a
1 ms browser/worker scheduling floor; raw failed repeat runs remain retained.

The recursive Test Station run grew from 438 to 503 tests while total duration
fell from 145.172 s to 141.813 s (-2.3%). Coverage also increased:

| Coverage   | Baseline |  Final |
| ---------- | -------: | -----: |
| Lines      |   77.37% | 77.64% |
| Branches   |   69.46% | 70.23% |
| Functions  |   74.96% | 75.08% |
| Statements |   76.55% | 76.89% |

## Retained Artifacts

Local, ignored evidence is under
`.test-results/mc68010-functional-conformance/`:

- `baseline/` contains the immutable pre-change environment, engine, browser,
  CPU/heap, MAME, and Test Station evidence;
- `checkpoints/` contains intermediate and failed performance runs;
- `final/` contains green engine/browser comparisons, current CPU/heap profiles,
  MAME evidence, and the complete recursive Test Station report.

## Explicitly Deferred Scope

The completion claim is functional, not cycle-accurate. Pin-level asynchronous
bus timing, arbitration and DTACK/VPA/BERR timing, exact breakpoint signal
timing, prefetch-queue attribution, transparent loop-mode fetch suppression, and
cycle-by-cycle restart microsequencing remain outside this profile.
