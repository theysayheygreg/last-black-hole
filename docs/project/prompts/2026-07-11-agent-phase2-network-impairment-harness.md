# Agent Prompt: Phase 2 Network Impairment Harness

> Delegation prompt for an independent networking/harness reviewer. Produce a
> decision-ready design memo, not code.

## Purpose

LBH v0.4 has closed its local Phase 1 browser slice: one logical authority per
match, four browsers twice and eight once, reliable actions/events, private
owner state, and measured uncompressed JSON budgets. Phase 2 must prove that
this contract survives imperfect networks without weakening the single-writer
authority or confusing deterministic protocol proof with real WAN/TLS proof.

Design the smallest two-layer impairment program that is repeatable in CI and
honest enough to gate a later hosted pilot. Take a strong position on where
delay, jitter, loss, reorder, duplication, bandwidth caps, blackout, slow
readers, and simultaneous reconnect should be injected.

## Read First

- `docs/v0.4/ROADMAP.md` Phase 2
- `docs/v0.4/research/phase1-ws-runtime-baseline.md`
- `docs/v0.4/research/ballpark-multiplayer-architecture.md`
- `docs/v0.4/research/p2p-history-network-budgets.md`
- `docs/design/TEST-HARNESS.md`
- `src/sim/sim-client.js`
- `src/sim/sim-stream-transport.js`
- `scripts/sim-ws-adapter.cjs`
- `scripts/multiplayer-send-queue.cjs`
- `tests/multiplayer-browser-journey.cjs`
- `tests/multiplayer-ws-runtime.cjs`
- `tests/browser-driver.cjs`

## Current Context

- Target branch is `codex/v0.4-multiplayer-architecture`; Phase 1 closes at
  commit `a52c715`.
- One match has one logical canonical writer. Fleet scale means one authority
  instance per concurrent match, packed across hosts; never one global sim.
- The final local gate held `NORMAL` at 15 Hz authority / 10 Hz projection.
  Steady uncompressed application traffic was 0.810--0.812 MB/s aggregate at
  four browsers and 1.927 MB/s at eight. Eight-client projection-average p95
  was 5.49 ms, sim-tick p95 3.98 ms, and exact-once reconnect 105 ms.
- HTTP remains the diagnostic oracle. Stream mode has zero request-per-input or
  snapshot/event polling hot path.
- Local automation does not prove WAN, TLS edge, relay, hosted capacity, Steam
  Deck behavior, or Greg's movement/art judgment.
- The 24/48/96 participant heavy-sim profiles remain separate forecasts and
  future benchmarks; Phase 2 must not silently raise the playable cap beyond 8.

## Questions To Answer

1. Which impairment facts belong in a deterministic in-process/frame-level
   scheduler, and which require a real TCP/WebSocket proxy or remote host?
2. How should the harness model asymmetric RTT, jitter distributions, random
   and burst loss, reorder windows, duplication, bandwidth caps, blackouts,
   slow readers, and synchronized reconnect without invalidating application
   ACK semantics?
3. What scenario matrix and pass/fail budgets should gate 4-player and 8-player
   play, including input ACK, snapshot age/cadence, reliable consequence time,
   queue bytes, rebase count, reconnect time, and authority overload mode?
4. How should failures be seeded, logged, packet-captured, and minimized so a
   failed run is reproducible rather than a flaky soak anecdote?
5. What is the smallest credible WAN/TLS follow-up after deterministic proof,
   and which cloud/edge topology should be deferred until hosted orchestration
   exists?
6. Which existing tests should be extended versus kept isolated, and what new
   lane names, files, fixtures, and cleanup contracts are warranted?

## Deliverable

Write `docs/project/reviews/2026-07-11-phase2-network-impairment-harness.md`
with:

- one recommended two-layer architecture and rejected alternatives;
- an exact seeded scenario matrix for 4p and 8p;
- metric definitions and numeric pass/fail targets;
- proposed file/module ownership and a sequence of atomic implementation slices;
- reproducibility, artifact, timeout, and process-cleanup requirements;
- a separate later WAN/TLS pilot plan;
- risks or decisions that require Greg rather than an agent.

Use primary sources for any external tooling claims and link them directly.

## Guardrails

- Do not edit runtime, client, tests, dependencies, or integrated docs.
- Do not weaken server rate limits, queue caps, membership fencing, privacy, or
  reliable action/event identity to make impaired cases pass.
- Do not introduce client gameplay authority, peer consensus, rollback, AOI,
  binary encoding, prediction, or 24/48/96 support in this lane.
- Do not treat a frame shim as WAN proof or a remote ping as gameplay proof.
- Preserve HTTP as oracle and the stream transport as the only gameplay hot path.
- Greg hands-on remains a separate acceptance gate.
