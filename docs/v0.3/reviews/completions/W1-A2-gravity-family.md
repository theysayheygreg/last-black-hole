# W1-A2 Gravity Family

Outcome: done.

## What Changed

- `src/content/well-gravity.js` now owns the single inverse-power scalar/vector
  family consumed by browser physics and the authoritative runtime.
- `scripts/sim/well-gravity.cjs` is the authority adapter: it re-exports the
  shared math and keeps named production profiles for player, scavenger, and
  wreck.
- `scripts/sim-runtime.cjs` routes direct player gravity, scavenger gravity,
  and wreck drift through that family. Its generic inverse-power wrapper also
  delegates to the player profile for star/slingshot callers.
- `scripts/coarse-flow-field.cjs` uses the same player scalar helper, while
  preserving its existing orbital-current implementation and near-well
  hazard shortcut.
- The browser consumers remain routed through `src/physics.js`, import the
  shared math, and retain their existing client body-class tuning; those
  values are not used as authority parameters.
- `tests/gravity-family.cjs` independently proves the production parameter
  matrix, toroidal wrap direction, and browser/authority source consumers.

## Evidence

- `node tests/gravity-family.cjs`: 4 passed; 30 matrix rows and 3 wrap rows.
- `node tests/coarse-field.cjs`: 3 passed.
- `node tests/flow-field.cjs`: 4 passed.
- `node tests/movement-contract.cjs`: 2 passed.
- `node tests/movement-golden.cjs`: 5 passed.
- `node tests/movement-trajectory-parity.cjs`: 1 passed.
- `node tests/wreck-drift.cjs`: 1 passed.
- `node --check` passed for the changed browser, shared, authority, and fixture
  modules.
- `git diff --check`: passed.

The production matrix independently reproduces the pre-slice authority
curves: player `0.6 / (d / 0.25)^1.5` with minimum distance `0.15`, effective
zero-distance threshold `0.001`, and linear range `1.2`; scavenger
`0.02 / d^1.8` with minimum distance `0.02`, zero-distance threshold `0.0001`,
and no range fade; wreck `0.0045 / d^1.5` with minimum distance `0.02`,
zero-distance threshold `0.001`, and hard cutoff `0.8`. The wrap fixture
confirms all three vectors point across the toroidal seam toward the well.

## Deviations

None. The authority profiles preserve the exact representative outputs and
directions requested by the production paths. Browser-side scavenger/wreck
tuning remains separate client presentation/sandbox behavior and was not
substituted for authority tuning.

## Open Questions

None discovered in this bounded slice. Dead movement-knob cleanup remains a
separate W1-A row.

## Anchor Updates

The velocity-ledger authority anchors were not edited. The live authority
consumers are `applyWellGravity`, `applyWellGravityToEntity`, and `tickWrecks`
in `scripts/sim-runtime.cjs`, plus `buildCoarseFlowField` in
`scripts/coarse-flow-field.cjs`; all route through the adapter at
`scripts/sim/well-gravity.cjs` and the shared math at
`src/content/well-gravity.js`. The browser consumers remain in `src/ship.js`,
`src/scavengers.js`, and `src/wrecks.js` through `src/physics.js`.
