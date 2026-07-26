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

The harness holds `moveX/moveY` on the shortest route direction, `thrust=1`, and `brake=0` every tick. Cruise is the canonical baseline brain defaults with sustained full-stick thrust. Burst is the existing Breacher `Burn` ability active, using its live `thrustMult` and `fuelMax`; no slingshot or invented burst mechanic is used. It runs at `1 / MOVEMENT.authority.integrationHz` (15 Hz) for Shallows, Expanse, and Deep Field. The flow sample is zero and all entity forces/contact systems are absent. Termination is accumulated path distance reaching the requested distance.

The movement lane uses the existing `AUTHORED_MAP_CONTRACT.travel.sufficientDeltaV: true` condition with a 1e9 reserve so tank depletion cannot become the measured travel time; the actual Breacher Burn fuel maximum remains recorded in each raw row. There are three deterministic sample labels, `101`, `202`, and `303`. The isolated movement protocol has no RNG draw, so the seeds intentionally do not alter the result. Each map/mode/probe is repeated under all three labels. One-cell and full-width probes are direct runs; representative legs use every current authored route leg and shortest toroidal route distance.

## Measurement Table

All times are seconds. `wu` means current registry world units. `cell` equals 1
wu as the W1-E placement equivalence. Fictional meters are now locked separately
by `src/content/units.data.json`; this probe does not retune or reinterpret its
world-unit measurements.

| Map | dt | Cruise s/cell | Burst s/cell | Cruise full-width | Burst full-width |
|---|---:|---:|---:|---:|---:|
| 5x5 Shallows | 0.066667 | 1.400000 | 0.666667 | 5.133333 | 1.866667 |
| 15x15 Expanse | 0.066667 | 1.400000 | 0.666667 | 14.400000 | 4.600000 |
| 25x25 Deep Field | 0.066667 | 1.400000 | 0.666667 | 23.666667 | 7.266667 |

Representative route legs, direct raw medians across the three deterministic labels:

| Map route | Leg distances wu | Cruise seconds | Burst seconds |
|---|---:|---:|---:|
| Shallows `first-current` | 1.201850 | 1.533333 | 0.733333 |
| Expanse `outer-circuit` | 1.272792 / 9.333810 / 0.900000 | 1.600000 / 9.133333 / 1.266667 | 0.733333 / 3.066667 / 0.600000 |
| Deep Field `long-descent` | 1.767767 / 15.925608 | 2.133333 / 15.266667 | 0.933333 / 4.866667 |

## Derived And Unresolved

- Directly measured: the raw one-cell, full-width, and route-leg tick counts/times in the JSON artifact at the shared authority dt.
- Derived: seconds per cell is the median of the three identical one-cell runs; route rows are medians of the three identical leg runs.
- The former per-map authority-relevance radius and DPM proxy were removed: they could silently omit gameplay updates and were not a player sensor contract. A future player-facing read radius needs its own design and proof rather than borrowing an authority budget.
- The later encounter-generation spacing section says a flag-tier read should be within approximately 30 seconds and calls for this probe. That section is present only at exact source commit `a4efcee8f4f4ee39727e8bee8d0d21ec2f2f4bb3`, not on this worktree lineage, so no later-doc file was edited. The later section remains dependent on this receipt for exact current values and on a future authority/movement rebinding after W1-A.
- The measurement uses the current registry's 1 wu = 1 cell placement equivalence. Physical meter conversion belongs only to the locked units manifest and is not part of this travel-time claim.
- Slingshot is unresolved for this probe: current authored routes contain slingshot-labeled stages, but no deterministic fixture route with valid engage/hold/release inputs and a target crossing contract exists on this lineage. The reported burst is only Breacher Burn.

## Evidence

- `node scripts/x-d-travel-time-probe.cjs --verify --print`: deterministic rerun identical; 72 raw runs; schema and derived math assertions pass.
- `node tests/w2a4-map-scale.cjs`: 8 passed, 0 failed.
- `git diff --no-ext-diff e693adb26fc69390bdb2b0a1d9fb72404f4f5376 -- scripts/ src/ tests/`: no production behavior diff; only the new harness and docs/artifact are changed.
- Parent/base: `e693adb26fc69390bdb2b0a1d9fb72404f4f5376`.
