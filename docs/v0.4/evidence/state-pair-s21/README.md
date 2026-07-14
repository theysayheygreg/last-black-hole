# S21 authority clock attribution and worker feasibility

This directory contains profiler-on A1, profiler-off B, profiler-on A2, and a
public-only projection-worker feasibility artifact. Every process capture keeps
one match in one dedicated logical authority process and every simulated
receiver in its own process.

`attribution/` (A1) validates with aggregate SHA-256
`0c469ac5f12c1295e9d2a8514ec357c5e3dd61b159f25da3797c5a953394e281`.
`control/` (B) is the same-source profiler-off control. `attribution-r2/` (A2)
binds clean commit `ec515a8`, records the stage-profile environment in its
command, and validates with aggregate SHA-256
`14299940c78ace66073d8e9272b4a50210f98b968dfee7308a10ba4a2f6d8573`.

Profiler instrumentation materially changes cadence and wall time, so none of
these captures replaces product or admission evidence. The sealed,
counterbalanced profiler-off S20 runs remain product truth.

`worker-feasibility.json` binds its clean source commit, source hashes, command,
machine, public-only input digest, and expected-output digest. Its validator is:

```sh
node tests/multiplayer-state-pair-worker-feasibility.cjs \
  --validate-artifact docs/v0.4/evidence/state-pair-s21/worker-feasibility.json
```

It contains 234 jobs, 936 byte/digest/frame/selection comparisons, zero
mismatch, three Latin-square topology orders, alternating recipient order, and
passing stale/cross-match/duplicate/order/mutation/backpressure/timeout/crash/
drain/shutdown checks. It is synthetic feasibility evidence only.

The decision and limits are in
`docs/v0.4/MULTIPLAYER-STATE-PAIR-S21-AUTHORITY-CLOCK.md`.
