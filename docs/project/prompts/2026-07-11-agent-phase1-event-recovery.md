# Agent Prompt: Phase 1 Event Journal Recovery

> Sequential implementation packet for `codex/v0.4-multiplayer-architecture`.
> Start only after the reliable-action commit is integrated and reviewed.

## Purpose

Deliver authoritative event-journal consequences over the existing reliable
WebSocket lane, resume from honest client cursors, and force a full rebase when
the requested event history is no longer retained.

Public-state `lastEventSeq` is a latest-authority watermark, not proof that a
client received or played every consequence. This slice must stop treating a
state projection as event delivery while keeping snapshots replaceable and
events reliable.

## Read First

- the committed result of
  `docs/project/prompts/2026-07-11-agent-phase1-reliable-actions.md`
- `scripts/sim-event-journal.cjs`
- `scripts/sim-runtime.cjs` around `publishEvent`, `/events`, hello redemption,
  cursor acknowledgement, and public/owner projection
- `scripts/sim-ws-adapter.cjs` around reliable enqueue, broadcast, delivery
  ACK, queue reset, and run rotation
- `scripts/multiplayer-send-queue.cjs`
- `scripts/multiplayer-wire-protocol.cjs` event/rebase/ACK contracts
- `tests/multiplayer-ws-runtime.cjs`
- `tests/multiplayer-ws-adapter-core.cjs`
- `tests/sim-event-journal.cjs`

## Owned Files

- `scripts/sim-runtime.cjs`
- `scripts/sim-ws-adapter.cjs` only for a minimal binding-aware reliable-event
  API or dedupe metadata that the existing API cannot express safely
- `tests/multiplayer-ws-runtime.cjs`
- `tests/multiplayer-ws-adapter-core.cjs` for any adapter API change

Do not edit SimClient/browser, wire schema unless current frames are provably
insufficient, manifest, package, or integrated docs in this slice.

## Required Changes

1. On admission/resume, distinguish the client's acknowledged event cursor
   from the authority's latest event watermark. Do not advance delivery truth
   merely because a public or owner state was projected.
2. Read the authoritative journal from the requested cursor. Deliver retained
   public events to every eligible binding and owner/private events only to the
   matching membership/player using the same filter semantics as `/events`.
3. Enqueue event frames on the adapter's reliable consequence lane with a
   bounded per-binding replay window. Never enqueue the same event repeatedly
   while its delivery/playback state is already pending.
4. Keep transport delivery ACK and event playback ACK distinct. Delivery ACK
   releases reliable bytes; monotonic event ACK advances the replay cursor.
   Regressive ACKs are ignored, future ACKs are rejected, and reconnect resumes
   from the client-provided acknowledged event sequence.
5. If the cursor predates retained history, belongs to another run, or cannot
   be served without a gap, clear incompatible reliable state and send an
   explicit `event-gap` or `run-changed` rebase with a current full baseline.
   Never silently skip missing consequences or replay a partial tail as whole.
6. Bound work per projection/tick and expose secret-free diagnostics for
   replayed events, pending event frames, event ACKs, and forced rebases.
7. Preserve final binding revalidation after awaits, reset/shutdown ordering,
   exact-once replication accounting, and 1/4/8 cadence.

## Verification

Add real-socket proof for:

- ordered public delivery to multiple players and owner-only isolation;
- delivery ACK versus event ACK semantics;
- disconnect before ACK, resume replay, and no skipped event sequence;
- duplicate/regressive ACK tolerance and future cursor rejection;
- retention overflow producing explicit rebase rather than partial replay;
- run reset producing run-changed recovery and no old-run event leakage;
- slow-reader bounds, reconnect fencing, and 1/4/8 cadence.

Run:

```sh
node tests/sim-event-journal.cjs
node tests/multiplayer-ws-adapter-core.cjs
node tests/multiplayer-ws-runtime.cjs
npm run test:multiplayer-network
npm run test:authority
git diff --check
```

Commit atomically with an `L0:` or `Fix:` message. Report replay-window bounds,
gap/rebase semantics, privacy proof, resume results, cadence, tests, and hash.

## Guardrails

- Events carry consequences already decided by the one match authority. They
  do not authorize gameplay and clients never manufacture journal entries.
- Do not make full snapshots reliable or block the authority tick awaiting
  slow clients.
- Do not begin SimClient/browser cutover, prediction, binary encoding, AOI, or
  hosted deployment in this slice.
