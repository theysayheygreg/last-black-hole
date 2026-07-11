# Agent Prompt: Phase 1 Projection Lineage Fence

> Corrective implementation packet for
> `codex/v0.4-multiplayer-architecture` after overload-accounting review.

## Purpose

Keep asynchronous replication accounting inside the run that created it and
tighten the Shallows cadence proof without weakening honest overload behavior.

The current reset path replaces `runtime.multiplayerProjection` while an old
`projectNow()` may still be in flight. Its completion callback then records
through the new global stats object, so run A can charge replication CPU to run
B and the reset can permit overlapping old/new projections.

## Read First

- `scripts/sim-runtime.cjs` around `startSession`, `tickSim`,
  `recordCompletedProjectionCost`, and `scheduleMultiplayerProjection`
- `tests/multiplayer-ws-runtime.cjs`
- `tests/overload-state.cjs`
- `docs/project/prompts/2026-07-11-agent-phase1-overload-replication-accounting.md`

## Owned Files

- `scripts/sim-runtime.cjs`
- `tests/multiplayer-ws-runtime.cjs`

Do not edit adapter, session registry, overload formulas, protocol, package,
manifest, docs, or client source.

## Required Changes

1. Capture projection stats and a run/generation lineage when scheduling async
   projection work. A completion from an obsolete run must not mutate the new
   run's counters, pending replication bucket, or `inFlight` state.
2. Preserve ordered reset/shutdown behavior without awaiting projection inside
   the authority tick. Do not create a second sim timer or authority.
3. Add a deterministic delayed-projection reset test proving old-run completion
   cannot charge or unlock the new run and cannot overlap new projection work.
4. Tighten the direct Shallows cadence proof so `NORMAL` plus a materially
   under-target 10/15 delivery rate cannot pass. Measure numerator and
   denominator over the same interval; retain modest CI jitter tolerance.
5. Narrow the force-utilization comment so it only describes capped kernels.
   Measured tick CPU remains the authoritative fallback for uncapped work; do
   not claim every force-related loop is capped and do not redesign force
   instrumentation in this slice.
6. Keep the already-proven 1/4/8 `NORMAL` cohort behavior and exact-once
   replication accounting invariant.

## Verification

```sh
node tests/multiplayer-ws-runtime.cjs
node tests/overload-state.cjs
node tests/multiplayer-ws-adapter-core.cjs
npm run test:authority
git diff --check
```

Commit atomically with a `Fix:` message. Report the delayed-reset proof,
1/4/8 cadence, accounting invariants, tests, and commit hash.
