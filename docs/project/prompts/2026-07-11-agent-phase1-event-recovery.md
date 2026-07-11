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
- `scripts/sim-protocol.cjs` player-local visibility/filtering
- `scripts/session-registry.cjs` reconnect-preserved membership authority
- `tests/multiplayer-ws-runtime.cjs`
- `tests/multiplayer-ws-adapter-core.cjs`
- `tests/protocol-journal.cjs`

## Owned Files

- `scripts/sim-runtime.cjs`
- `scripts/sim-ws-adapter.cjs` only for a minimal binding-aware reliable-event
  API or dedupe metadata that the existing API cannot express safely
- `scripts/multiplayer-wire-protocol.cjs` and its focused test for the required
  cursor run identity proved missing by red-team review
- `scripts/sim-protocol.cjs`, `scripts/session-registry.cjs`, and their focused
  tests for membership-scoped private visibility and reconnect floor lineage
- `scripts/sim-event-journal.cjs` only if the captured upper-bound read cannot
  be expressed safely by the runtime
- `tests/multiplayer-ws-runtime.cjs`
- `tests/multiplayer-ws-adapter-core.cjs` for any adapter API change

Do not edit SimClient/browser, manifest, package, or integrated docs in this
slice.

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
8. Any resume hello that supplies snapshot/event cursors must also supply the
   cursor's `lastRunId`. Numeric cursors restart each run and are not valid
   cross-run identity. A mismatch forces `run-changed`; resume without cursors
   may take a current full rebase.
9. Stamp owner events to membership lineage, not reusable caller-selected
   player id alone. A new membership reusing the same player id must never read
   the previous membership's private events through either WebSocket recovery
   or authenticated `/events`. Owner-sensitive publication without a current
   membership fails closed instead of becoming public.
10. Treat `since=0` as a gap when the journal has dropped earlier events. Do
    not exploit the generic journal reader's HTTP-style zero exception to send
    a partial retained tail as complete recovery.
11. Validate event ACK only through the highest eligible event actually issued
    to that binding. Public/owner state watermarks and delivery ACKs cannot
    advance playback truth. Account for private-event sequence holes with an
    explicit eligible-through cursor/checkpoint rather than trusting a generic
    contiguous sequence.
12. Capture one journal upper bound per projection and never send an event
    newer than the full public/owner baseline paired with that pass. Gap/run
    recovery must order `rebase -> matching full public -> matching owner`
    before later events, with final binding revalidation around awaited work.
13. Bound replay by frames and encoded bytes while reserving reliable queue
    headroom for action ACKs. Delivery ACK releases bytes only; event ACK
    advances playback and releases pending replay state. Keep all replay work
    inside measured serialized projection accounting.

## Verification

Add real-socket proof for:

- ordered public delivery to multiple players and owner-only isolation;
- delivery ACK versus event ACK semantics;
- disconnect before ACK, resume replay, and no skipped event sequence;
- duplicate/regressive ACK tolerance and future cursor rejection;
- retention overflow producing explicit rebase rather than partial replay;
- run reset producing run-changed recovery and no old-run event leakage;
- equal numeric cursors from another `lastRunId` forcing run-changed;
- reused player id under a new membership seeing no prior owner marker through
  WebSocket or `/events`;
- state watermark or delivery ACK unable to skip an unissued/unplayed event;
- exact ordered rebase plus matching public/owner full baseline;
- private sequence holes advancing only after every eligible event is issued;
- replay near byte/message caps retaining action-ACK headroom;
- an event published during delayed owner projection waiting for the next
  captured baseline;
- slow-reader bounds, reconnect fencing, and 1/4/8 cadence.

Run:

```sh
node tests/protocol-journal.cjs
node tests/multiplayer-wire-protocol.cjs
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
