# W1-F2 Inhibitor Clock

## Outcome

Done.

## What Changed

- `scripts/sim-runtime.cjs` now creates exactly one match-scoped Conductor from
  the authoritative run seed at session start.
- Phase 0 is published at match start. The provisional clock uses a 90-second
  grace and 90-second intervals, placing phases 1/2/3 at 90/180/270 seconds.
  These values are tunable in 0.5-minute (30-second) steps. Phase 3 plus the
  unchanged 60-second final-portal delay remains inside `RUN_DURATION=600`.
- Each scheduled phase uses an announced Conductor severity wave with stable
  `waveId`, `phase`, `tier`, `scheduledTime`, `budget`, `announced`, and
  `conductorId` metadata. `inhibitor.phase` and `inhibitor.form` events carry
  the same identity. `form` is now only the current scheduled-tier projection.
- Signal remains available for post-arrival targeting and form behavior, but it
  cannot advance, delay, regress, or dissipate the clock.
- Removed Inhibitor pressure accumulation, randomized threshold state, pressure
  snapshot/debug/Ballpark/client fields, well-growth pressure input, and the
  pressure-driven client pre-spawn haunt.
- Preserved form-specific movement, targeting, cargo drain, Vessel physics,
  portal blocking, and final-portal spawn/delay behavior.

## Evidence

- `node tests/conductor.cjs`: **11 passed, 0 failed**.
- `node tests/inhibitor.cjs`: **6 passed, 0 failed**.
- `node tests/ballpark-mirror.cjs`: **10 passed, 0 failed**.
- `node --check` passed for the runtime and directly changed test files.
- `git diff --check` passed.

The Inhibitor contract test proves seed-stable schedule bytes, phase 0 start,
announced ordered waves, 90/180/270 timing, positive budget metadata, no early
scheduled tier projection, no pressure fields, and the existing phase-specific
server behavior.

## Deviations And Blockers

No W1-F2 blocker. `scripts/sim/conductor.cjs` was not modified. The full
`tests/remote-authority.cjs` attempt was not closure evidence: its changed
Inhibitor assertions were reached and passed, but unrelated control-plane and
browser setup failures caused a 2 passed / 16 failed cascade. No unrelated
failures were changed.

## W1-F3 Seam

Portal open/close windows remain on their existing schedule and were not
registered with the Conductor. The final portal algorithm, 60-second delay,
spawn selection, and Vessel blocking remain unchanged. W1-F3 owns portal-window
conversion and future Conductor offset coupling.

## Anchor Updates

Runtime line numbers moved around the Inhibitor helpers and snapshot contract;
named-function and symbol searches remain the source anchors. No older design
review or portal documents were edited.
