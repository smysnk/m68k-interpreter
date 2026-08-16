# MC68020 Functional Conformance Execution Report

**Executed:** 2026-08-16
**Working baseline:** `7fe7f36`
**Profile:** functional MC68020 integer architecture

## Result

The MC68020 profile is implemented through the source assembler, binary decoder,
strict executor, runtime worker, persistence, register UI, bottom model selector,
generated inventory, and benchmark/Test Station surfaces.

The generated denominator contains 40 MC68020-specific forms, 163 inherited
forms in total, zero missing forms, and zero audit-pending forms. The profile
adds all 18 effective-address categories, sparse 32-bit addressing, unaligned
data access, three stack banks, MC68020 control/cache state, format-aware fault
frames and `RTE`, integer extensions, atomic operations, module access, and the
generic coprocessor envelope.

MC68881/MC68882 floating-point behavior, MC68851 MMU semantics, and cycle/pin
accuracy remain explicitly excluded.

## Correctness evidence

| Gate | Result |
| --- | --- |
| Interpreter unit/conformance | 330/330 passed |
| IDE unit/runtime | 234/234 passed |
| Workspace integration | 3/3 passed |
| Browser E2E | 30/30 passed |
| Test Station aggregate | 583/583 passed |
| Musashi/Moira bounded differential suite | 11/11 passed |
| MAME MC68000 audit | 317,500 vectors; 259,501 exact; 57,999 reviewed; 0 unexplained |
| Primary-word classification | all 65,536 words for all three CPU models |
| Generated artifacts | deterministic regeneration hashes |
| Type check/build/lint | passed; lint retains pre-existing warnings only |

The browser matrix selects and reloads all six combinations of three CPU models
and two machine profiles. This proves that terminal and trainer-board services
remain machine features rather than CPU-model branches.

## Performance evidence

Raw baseline, checkpoint, final, environment, and comparison artifacts are under
`.test-results/mc68020-functional-conformance/`.

The implementation removed a per-effective-address policy allocation found by
the phase gate and extracted optional MC68020 handlers from the legacy dispatch
method. The configured final battery (10 warm-ups and 50 retained samples per
scenario) is green across every inherited workload:

| Scenario | Median change | p95 change | Heap change | Gate |
| --- | ---: | ---: | ---: | --- |
| cold-load-generated-source | -3.1% | -14.2% | -8.5% | PASS |
| tight-arithmetic-loop | -8.2% | -0.3% | -4.3% | PASS |
| tight-arithmetic-loop-m68000 | -28.6% | -12.6% | -5.9% | PASS |
| tight-arithmetic-loop-m68010 | -6.6% | +16.7% | -4.2% | PASS |
| branch-pressure-loop | -1.0% | -0.9% | -4.7% | PASS |
| memory-roundtrip-unrolled | -7.1% | +19.4% | -1.8% | PASS |

The p95 gate uses the widest of 15%, two baseline median absolute deviations,
or the 0.1 ms measurement-noise floor. Raw samples and earlier red diagnostic
runs remain retained; they were not deleted or promoted into the baseline.

IDE runtime gates are green:

- desktop program intro/gameplay: -2.3% / -2.0%
- mobile program intro/gameplay: -1.1% / -1.8%
- desktop hardware gameplay: +8.3%; acknowledgement: -38.4%
- compact hardware gameplay: +0.7%; acknowledgement: +5.0%

## Test Station

The final local Test Station run completed in 89 seconds with 583/583 tests and emitted
108 structured performance statistics. The complete local report is retained in
the final evidence directory.

Remote ingest and recursive results-page timing were attempted but could not be
published because `TEST_STATION_INGEST_SHARED_KEY` is not present in the local
environment. The publisher reported `Skipping test-station ingest: no shared key
provided.` This is an external proof blocker, not a local test failure.

## Follow-on release gates

1. Run authenticated Test Station ingest and capture ingest, persistence,
   results-page load, and render responsiveness metrics.
2. Expand independent MC68020 oracle coverage beyond the selected Musashi/Moira
   instruction samples before making a stronger claim than functional integer
   coverage.

See [MC68020 extension architecture](MC68020_EXTENSION_ARCHITECTURE.md) and the
[generated functional inventory](generated/MC68020_FUNCTIONAL_INVENTORY.md).
