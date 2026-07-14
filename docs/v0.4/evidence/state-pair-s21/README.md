# S21 authority clock attribution and worker feasibility

This directory contains profiler-on A1, profiler-off B, final profiler-on A2,
one intermediate label-closure capture, and a
public-only projection-worker feasibility artifact. Every process capture keeps
one match in one dedicated logical authority process and every simulated
receiver in its own process.

`attribution/` (A1) validates with aggregate SHA-256
`0c469ac5f12c1295e9d2a8514ec357c5e3dd61b159f25da3797c5a953394e281`.
`control/` (B) binds clean commit `bf54903` and validates with aggregate SHA-256
`1ff214ede3c9c2b02b6a24ccf0fb522d9153eb8383451611132820038a39c8b1`.
`attribution-final/` (A2) binds clean commit `d7c14a5`, records the stage-profile
environment in its command, emits pair choice as synchronous inclusive time,
and validates with aggregate SHA-256
`d79262770f1f397533f806f954c411b04e4ad081aeb61f0be873cd1ba112c5f5`.

`attribution-r2/` is the clean `ec515a8` intermediate captured while closing
review labels. It validates with aggregate SHA-256
`14299940c78ace66073d8e9272b4a50210f98b968dfee7308a10ba4a2f6d8573`,
but `attribution-final/` is the decision input. A1 to final A2 runtime changes
are diagnostic JSON-size de-duplication and timing-label corrections only;
worker work remains test-only.

Profiler instrumentation materially changes cadence and wall time, so none of
these captures replaces product or admission evidence. The sealed,
counterbalanced profiler-off S20 runs remain product truth.

`worker-feasibility.json` binds clean source commit `92e93e8`, source hashes, command,
machine, public-only input digest, and expected-output digest. Its validator is:

```sh
node tests/multiplayer-state-pair-worker-feasibility.cjs \
  --validate-artifact docs/v0.4/evidence/state-pair-s21/worker-feasibility.json
```

It contains 234 jobs, 936 byte/digest/frame/selection comparisons, zero
mismatch, three Latin-square topology orders, alternating recipient order, and
passing authority/ballpark/manifest/recipient rotation, cross-match, unissued,
superseded, duplicate, mutation, registry-retirement, backpressure, timeout,
crash, drain, and shutdown checks. It is synthetic feasibility evidence only.

The decision and limits are in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S21-AUTHORITY-CLOCK.md`.
