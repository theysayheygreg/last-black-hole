# Agent Prompt: Phase 1 Reliable Gameplay Actions

> Sequential implementation packet for `codex/v0.4-multiplayer-architecture`.
> Complete this before the event-recovery packet.

## Purpose

Replace the WebSocket runtime's reliable `action-not-enabled` response with
authoritative, idempotent execution for every action kind already admitted by
`lbh-multiplayer-json-v1`: `slingshotEdge`, `pulse`, `extractConfirm`,
`consume`, and `inventory`.

The adapter already rate-limits action frames, revalidates bindings after
awaits, retains action ACKs behind delivery ids, and releases them only after a
delivery ACK. This slice must use that lane without creating another writer,
timer, action authority, or client-owned consequence.

## Read First

- `scripts/multiplayer-wire-protocol.cjs`
- `scripts/sim-ws-adapter.cjs` around action handling and reliable enqueue
- `scripts/sim-runtime.cjs` around `rejectStreamAction`, HTTP input/inventory
  executors, player one-shot latches, and `publishEvent`
- `scripts/session-registry.cjs`
- `tests/multiplayer-ws-runtime.cjs`
- `tests/multiplayer-executor-parity.cjs`
- `docs/v0.4/research/phase1-ws-runtime-baseline.md`

## Owned Files

- `scripts/sim-runtime.cjs`
- `scripts/session-registry.cjs` only if reconnect receipt lineage requires it
- one new bounded action-receipt helper under `scripts/` if that keeps the
  runtime from accumulating another embedded subsystem
- `tests/multiplayer-ws-runtime.cjs`
- one focused helper test matching any new helper

Do not edit the adapter, wire schema, SimClient/browser, manifest, package, or
integrated docs in this slice.

## Required Changes

1. Replace `rejectStreamAction` with one authoritative executor. Revalidate
   `(runId, membershipId, connectionId, connectionEpoch)` before mutation.
2. Require contiguous `actionSeq` and `commandSeq` for a new action. Reject
   gaps and stale unknown actions without mutating gameplay.
3. Treat `actionId` as the idempotency key. An exact retry of a previously
   accepted or rejected action returns its cached semantic ACK without
   re-executing, including after connection-epoch rotation. Reuse of an id or
   sequence with different kind/payload/command identity is a conflict.
4. Keep a bounded server-owned receipt window per membership/run. Cache ACK
   semantics without `deliveryId`; each connection retry may receive a fresh
   transport delivery id from the adapter. Never trust a client result.
5. Map every admitted action kind to existing authoritative behavior:
   `slingshotEdge` queues a unique edge, `pulse` and `extractConfirm` preserve
   one-shot latches, `consume` queues a validated consumable slot without
   overwriting an unconsumed request, and `inventory` reuses the existing
   inventory normalization/application path. Do not duplicate gameplay rules.
6. Advance action/command cursors exactly once for a newly adjudicated action,
   including deterministic gameplay rejection. Transport retry must not
   advance them again.
7. Return sanitized accepted/rejected action ACKs with action id, action seq,
   command seq, and bounded JSON result. Owner/welcome state must expose the
   authoritative last action cursor after reconnect.
8. Preserve the current public/private projection boundary and measured
   1/4/8 `NORMAL` cadence.

## Verification

Add direct real-socket proof for:

- each action kind reaching its existing authoritative behavior;
- same-socket exact retry and reconnect exact retry with one consequence;
- action-id, action-seq, and payload conflicts;
- stale, gap, future, and fenced-epoch rejection;
- accepted and rejected ACK retention until delivery ACK;
- reset clearing the old run's receipt lineage;
- no rival owner-state leakage and no cadence regression.

Run:

```sh
node tests/multiplayer-ws-runtime.cjs
node tests/multiplayer-executor-parity.cjs
node tests/multiplayer-ws-adapter-core.cjs
npm run test:multiplayer-network
npm run test:authority
git diff --check
```

Commit atomically with an `L0:` or `Fix:` message. Report action semantics,
receipt bounds, replay/conflict results, 1/4/8 cadence, tests, and hash.

## Guardrails

- One logical single-writer authority per match remains the only gameplay
  writer; concurrent matches each have their own authority instance.
- Continuous movement remains latest-wins input. Do not turn every input frame
  into a reliable action.
- Do not implement event replay, browser cutover, prediction, AOI, binary
  encoding, or hosted control-plane work here.
