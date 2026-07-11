# Agent Prompt: Phase 1 Overload and Replication Accounting

> Corrective implementation packet for
> `codex/v0.4-multiplayer-architecture` after runtime baseline review.

## Purpose

Make the overload controller honest about declared capacity and WebSocket
replication CPU, then restore a real Shallows 15 Hz authority / 10 Hz
projection gate for the 1/4/8 runtime baseline.

The current count formula assigns pressure `0.7 + 0.4 = 1.1` when both player
and AI counts are exactly at their configured maxima. That guarantees a
healthy match at its own declared capacity eventually degrades. Separately,
async per-recipient projection completes after tick-cost sampling, so its CPU
is absent from overload pressure. The direct socket test hid both facts by
widening cadence assertions to the already-degraded target.

## Read First

- `scripts/overload-state.cjs`
- `scripts/sim-runtime.cjs` around `tickSim`, `scheduleMultiplayerProjection`,
  and multiplayer diagnostics
- `tests/overload-state.cjs`
- `tests/multiplayer-ws-runtime.cjs`
- `docs/project/prompts/2026-07-11-agent-phase1-ws-runtime-baseline.md`
- `docs/v0.4/research/high-count-performance-model.md`

## Owned Files

- `scripts/overload-state.cjs`
- `scripts/sim-runtime.cjs`
- `tests/overload-state.cjs`
- `tests/multiplayer-ws-runtime.cjs`

Do not edit adapter, session registry, protocol, package/build, manifest, docs,
or client source.

## Required Changes

1. Redefine count pressure so configured `maxPlayers` and `maxScavengers` are
   healthy capacity, not an overload event by themselves. Use a simple,
   documented monotonic formula where both ratios at 1.0 produce pressure at
   or below the controller's healthy threshold, while meaningful over-cap
   counts still trigger degradation. Do not disable CPU/force pressure.
2. Add focused tests proving sustained low-cost work at exactly configured
   player+AI capacity remains/recoverable `NORMAL`, and sustained over-cap or
   expensive work still steps through overload states.
3. Measure each completed `projectNow()` duration with `performance.now()`.
   Accumulate completed projection cost into one bounded pending replication
   bucket, consume/reset it exactly once in the next overload sample, and add
   it to that tick's sampled cost. Do not add the same projection cost to
   multiple ticks and do not await projection inside the authority tick.
4. Expose separate secret-free diagnostics for latest/average/worst/total
   projection duration, pending replication cost, and the combined sampled
   cost so sim versus replication pressure remains inspectable.
5. Restore the direct Shallows cadence gate to the declared base clocks:
   approximately 10 Hz projection and 15 Hz authority for real 1/4/8 socket
   cohorts under the existing seeded Shallows fixture. Do not kill AI, widen
   assertions to degraded targets, or accept `DILATED` as success.
6. Keep overload transitions measurable. If real CPU/force pressure still
   degrades a cohort after the count fix, report and diagnose it rather than
   falsifying the gate.

The 24/48/96 forecasts remain separate capacity profiles. This fix does not
claim those counts fit the 8-player Phase 1 runtime cap; it makes future
profile maxima semantically meaningful and ensures replication cost is not
invisible.

## Verification

```sh
node tests/overload-state.cjs
node tests/multiplayer-ws-runtime.cjs
node tests/multiplayer-ws-adapter-core.cjs
node tests/multiplayer-authority.cjs
node tests/sim-scale.cjs
npm run test:authority
git diff --check
```

Commit atomically with a `Fix:` or `L0:` message. Report before/after 1/4/8
cadence, projection-cost metrics, controller formula, tests, and hash.
