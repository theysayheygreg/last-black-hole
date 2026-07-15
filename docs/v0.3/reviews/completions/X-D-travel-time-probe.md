# X-D Completion: Travel-Time Probe

Date: 2026-07-15

## Outcome

Done: authoritative current-value seconds-per-cell measurement recorded with no gameplay changes.

## What Changed

- Added `scripts/x-d-travel-time-probe.cjs`, a deterministic measurement harness that consumes the canonical CJS movement seam, canonical 5x5/15x15/25x25 map registry and loader, canonical session profiles, and current hull ability data.
- Added `docs/v0.3/reviews/artifacts/x-d-travel-time-probe.json` with 72 machine-readable raw runs and derived summaries.
- Added this completion receipt and one v0.3 changelog entry.
- The current lineage does not contain `docs/v0.3/reviews/v0.3.1-encounter-generation.md`; the later spacing source is cited by exact commit `a4efcee8f4f4ee39727e8bee8d0d21ec2f2f4bb3`, with the later-doc dependency recorded below.

## Protocol

The harness holds `moveX/moveY` on the shortest route direction, `thrust=1`, and `brake=0` every tick. Cruise is the canonical baseline brain defaults with sustained full-stick thrust. Burst is the existing Breacher `Burn` ability active, using its live `thrustMult` and `fuelMax`; no slingshot or invented burst mechanic is used. It runs at the current authority profile dt: 1/15 s, 1/12 s, and 1/10 s for Shallows, Expanse, and Deep Field. The flow sample is zero and all entity forces/contact systems are absent. Termination is accumulated path distance reaching the requested distance.

The movement lane uses the existing `AUTHORED_MAP_CONTRACT.travel.sufficientDeltaV: true` condition with a 1e9 reserve so tank depletion cannot become the measured travel time; the actual Breacher Burn fuel maximum remains recorded in each raw row. There are three deterministic sample labels, `101`, `202`, and `303`. The isolated movement protocol has no RNG draw, so the seeds intentionally do not alter the result. Each map/mode/probe is repeated under all three labels. One-cell and full-width probes are direct runs; representative legs use every current authored route leg and shortest toroidal route distance.

## Measurement Table

All times are seconds. `wu` means current registry world units. `cell` equals 1 wu only as the W1-E provisional placement equivalence; this does not ratify a fiction/meters scale.

| Map | dt | Cruise s/cell | Burst s/cell | Cruise full-width | Burst full-width | Authority read radius wu/cells | DPM proxy |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5x5 Shallows | 0.066667 | 1.400000 | 0.666667 | 5.133333 | 1.866667 | 1.4 / 1.4 | 30.612245 |
| 15x15 Expanse | 0.083333 | 1.416667 | 0.666667 | 14.750000 | 4.666667 | 1.2 / 1.2 | 35.294118 |
| 25x25 Deep Field | 0.100000 | 1.400000 | 0.700000 | 24.900000 | 7.500000 | 1.0 / 1.0 | 42.857143 |

Representative route legs, direct raw medians across the three deterministic labels:

| Map route | Leg distances wu | Cruise seconds | Burst seconds |
|---|---:|---:|---:|
| Shallows `first-current` | 1.201850 | 1.533333 | 0.733333 |
| Expanse `outer-circuit` | 1.272792 / 9.333810 / 0.900000 | 1.666667 / 9.333333 / 1.250000 | 0.750000 / 3.083333 / 0.583333 |
| Deep Field `long-descent` | 1.767767 / 15.925608 | 2.200000 / 16.000000 | 1.000000 / 5.000000 |

## Derived And Unresolved

- Directly measured: the raw one-cell, full-width, and route-leg tick counts/times in the JSON artifact; current profile dt; current authority read radius values.
- Derived: seconds per cell is the median of the three identical one-cell runs; route rows are medians of the three identical leg runs; DPM proxy is `60 / (cruise seconds per cell * authority read radius in provisional cells)`, treating one newly entered sensor-radius horizon as one decision opportunity.
- The read radius is `session profile entityRelevanceRadius` (`1.4/1.2/1.0 wu`). The player `brain.sensorRange` hull stat is not wired as a general human sensor-read radius in this lineage; it is not substituted into the table. That is a product gap, not an unresolved number to fabricate.
- The later encounter-generation spacing section says a flag-tier read should be within approximately 30 seconds and calls for this probe. That section is present only at exact source commit `a4efcee8f4f4ee39727e8bee8d0d21ec2f2f4bb3`, not on this worktree lineage, so no later-doc file was edited. The later section remains dependent on this receipt for exact current values and on a future authority/movement rebinding after W1-A.
- The measurement uses the current registry's 1 wu = 1 provisional cell placement equivalence. Fictional meters or physical scale remain unresolved.
- Slingshot is unresolved for this probe: current authored routes contain slingshot-labeled stages, but no deterministic fixture route with valid engage/hold/release inputs and a target crossing contract exists on this lineage. The reported burst is only Breacher Burn.

## Evidence

- `node scripts/x-d-travel-time-probe.cjs --verify --print`: deterministic rerun identical; 72 raw runs; schema and derived math assertions pass.
- `node tests/w2a4-map-scale.cjs`: 8 passed, 0 failed.
- `git diff --no-ext-diff e693adb26fc69390bdb2b0a1d9fb72404f4f5376 -- scripts/ src/ tests/`: no production behavior diff; only the new harness and docs/artifact are changed.
- Parent/base: `e693adb26fc69390bdb2b0a1d9fb72404f4f5376`.
