# W2-A2 Growth Events And Collapse Epochs

## Outcome

**phase-2/shared-substrate**

The catalog-backed authority substrate is implemented while `base-well` remains
the only shipping runtime behavior. The micro black hole, supermassive black
hole, and pulsar remain planned metadata and do not gain distinct physics.

## What Changed

- Added the provisional `collapseEpochContract` and shared well-growth event
  contract to `src/content/anomalies.data.json`, with mirrored ESM/CJS exports
  and validation.
- Added deterministic match-progress epoch schedule/state helpers in
  `scripts/sim/collapse-epochs.cjs`. The Conductor retains the ordered epoch
  schedule; transitions publish once through the normal event journal even when
  one variable-`dt` update crosses more than one boundary.
- Routed scheduled growth and authoritative star consumption through
  `scripts/sim/well-growth.cjs` and `applyWellGrowth()`. `well.grew` now carries
  exact well/catalog identity, source/reason, before/after mass and kill radius,
  scheduled/event time, wave identity, and tell identity.
- Applied only the declared epoch multipliers to seeded ambient and live-wave
  terms in the existing authoritative coarse field. Epoch zero is identity,
  preserving pre-first-transition base-well field output.
- Extended snapshots and presentation normalization with current epoch,
  schedule, catalog-backed well identity, and safe growth/epoch event fields.
- Added focused pure/server contract proof in `tests/sim-growth-epochs.cjs`.

## Provisional Values

- Boundaries: `0.00`, `0.25`, `0.50`, `0.65` of `MATCH_MAX_SIM_TIME`.
- Default 600-second schedule: `0s`, `150s`, `300s`, `390s`.
- `seededSeaAmbientMultiplier`: `1.00`, `1.08`, `1.16`, `1.24`, bounded
  `[1.00, 1.25]`.
- `liveWavePushMultiplier`: `1.00`, `1.05`, `1.10`, `1.15`, bounded
  `[1.00, 1.20]`.

## Evidence

- `node tests/anomaly-catalog.cjs`: **5 passed, 0 failed**.
- `node tests/sim-growth-epochs.cjs`: **8 passed, 0 failed**.
- `node tests/conductor.cjs`: **13 passed, 0 failed**.
- `node tests/presentation-frame.cjs`: **4 passed, 0 failed**.
- `node tests/authoritative-field.cjs`: **5 passed, 0 failed**.
- Normal authority boot and snapshot probe on port `8817` exposed
  `collapse-epoch-0`, four epoch schedule entries, and `base-well` identity.
- Normal authority growth probe on seed `424242` published one scheduled
  `well.grew` event with `wellId=well-1`, catalog identity, before/after values,
  `waveId`, `tellId`, and `scheduledTime=eventTime=11.266666666666646`.
- `git diff --check` passed. The focused source scan found no new
  `Math.random` or per-player epoch state.

## Deviations And Deferred Work

- `node tests/sim-bounded-growth.cjs` was attempted but could not boot its
  existing `LBH_SIM_MAX_SIM_TIME=2` fixture: the pre-existing final portal at
  `2s` conflicts with the Conductor's 10-second phase-zero offset guard. This
  slice did not alter that unrelated fixture/schedule policy.
- No browser, screenshot, package, broad/full CI, or renderer redesign was run.
- Distinct trio behavior, anomaly-specific physics, visible art tells, collapse
  endgame/session termination ownership, and Greg's provisional tuning call
  remain deferred.

## Boundary Checks

- No W1 movement, fabric ownership, slingshot, portal, or Inhibitor constants
  were retuned.
- No per-player clock or new random source was added.
- The authoritative star-consumption owner exists and now emits the shared
  growth event; it is not a blocker for this phase.
