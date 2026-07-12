# v0.4 Delta Replication Implementation Packet

> Status: implementation-ready packet for the supported 4–8-player match
> envelope on `codex/v0.4-multiplayer-architecture`. It closes neither hosted
> WSS nor 24/48/96-player capacity. One logical single-writer authority still
> owns each active match; a fleet may run many such authorities.

## Decision and measured starting point

Build recipient-specific **JSON delta replication** as the next traffic gate.
Keep reliable semantic events independent, move immutable public definitions
to a content-addressed session manifest, and send an acknowledged projected
keyframe about once per second. Do not adopt binary encoding, compression, or
area-of-interest (AOI) filtering until this JSON shape is measured and fails a
named gate.

The preserved negative normal-soak artifact is
`tests/screenshots/multiplayer-soak-2026-07-12T210956086Z-normal-45m-08A04E45-e35556818d18`.
Minute 9 measured 2,526,338 B/s across eight recipients, or **315,792 B/s =
308.4 KiB/s/player**. Its frame ledger recorded 1,070 accepted state frames per
recipient over 55 seconds: public plus owner pairs at about **9.73 projection
beats/s**, consistent with the current configured **10 Hz** projection rate.
This packet must not relabel the modeled 15 Hz future candidate as current.

Measured minute-9 composition attributes **95.4% of application bytes to the
shared public-state lane**. Owner state, reliable events, ACKs, inputs, and
actions are not the main lever. The product gate is <=64 KiB/s/player steady;
80 KiB/s/player is an explicit sensitivity ceiling, not a new target. Current
full JSON is therefore about 4.8x the target and 3.9x the sensitivity ceiling.

### Can initial JSON pass?

Probably, at 10 Hz, but the margin is deliberately narrow:

```text
steady application bytes/player/second =
  delta bytes/beat * actual beats/second
  + keyframe bytes / keyframe interval seconds
  + reliable events + control + reconnect amortization
```

At current 10 Hz, a 3 KiB median delta contributes 30 KiB/s. A 32 KiB
keyframe every second would leave only about 2 KiB/s for events and control,
so the p95 size gates are necessary but not sufficient: the measured total
must pass <=64 KiB/s/player. A typical keyframe materially below its 32 KiB
p95 ceiling makes JSON credible. At a possible future 15 Hz, the same 3 KiB
median plus a 32 KiB/s keyframe is already 77 KiB/s before events. Fifteen Hz
therefore requires a separate experiment and likely <=2 KiB average deltas,
smaller/amortized keyframes, or a later codec step. It is not part of initial
acceptance.

All byte gates below use exact UTF-8 application bytes from the encoded frame
before `ws.send`, matching the existing soak accounting. Transport/TLS bytes
may be recorded separately but cannot replace this denominator.

## Authority boundary

The EVE-inspired ownership model does not change:

- the match sim is the only writer of movement, Ballpark lifecycle, contacts,
  field revision, loot, signal, abilities, death, extraction, and event facts;
- the replication layer reads committed sim projections, tracks each
  recipient's acknowledged base, and chooses keyframe/delta/rebase output; it
  never mutates gameplay to make a packet smaller;
- the client applies public and owner projections, predicts only reversible
  local movement, and presents/interpolates them; and
- reliable consequences remain authority-issued, recipient-filtered, FIFO,
  exactly-once at application level, and ACK-retired independently of state.

There is one authority **per match**, not one authority for all matches. Delta
work may reduce per-match egress and encode CPU, but it is not evidence for
safe authorities-per-host or high-count participant density.

## S0–S3 delivery slices

### S0 — exact accounting and frozen truth

Add default-off replication diagnostics before changing payload shape.

For every encoded frame, record counters keyed by run, anonymized recipient,
wire version, frame class, and projection beat:

- offered bytes/frames, accepted-by-`ws.send` bytes/frames, coalesced bytes,
  policy-dropped bytes, retransmitted bytes, and ACK-retired frames;
- public keyframe, public delta, owner keyframe, owner delta, reliable event,
  control, input, action, and ACK as distinct classes;
- actual projection beats/s and keyframes/s, never configured cadence alone;
- per-frame encoded bytes plus delta entity/component/despawn counts; and
- manifest transfer bytes separately from match-stream bytes.

The counter is advanced exactly once at the causal boundary it names. A
failed send is not accepted traffic. Observer output contains no payload,
credential, raw membership/player/connection id, private value, or IP address;
use run-local salted identities and bounded aggregates. Default production
cost with diagnostics disabled must remain zero per-frame object allocation.

S0 reproduces the negative artifact's 1/4/8 full-state baseline and minute-9
class accounting within 1% or explains the denominator difference. No payload
change lands until these counters are independently tested.

### S1 — content-addressed static session manifest

Create one immutable, public, content-addressed manifest per run/map content
selection. The control path advertises `{manifestSchema, manifestHash,
manifestBytes, fetchPath}`; the client fetches it once, verifies SHA-256 over
canonical bytes, and caches by `(manifestSchema, manifestHash)`. Admission is
not stream-ready until verification succeeds.

The manifest may contain immutable public definitions: map bounds, static
anchor definitions, public content type/config references, visual descriptors,
and stable source ids. It must not contain run secrets, tickets, credentials,
private inventory/loadout/effect values, hidden spawns, owner-only state, or
mutable transforms/lifecycle. A well's immutable definition may be static;
its changing radius/state remains authoritative replication.

Hash mismatch, unknown schema, fetch failure, or manifest hash change within a
run is fatal to admission and requires a fresh authorized fetch. A new `runId`
may select a different manifest. The manifest is not a reliable-event lane and
does not count as repeated steady egress; report cold-fetch bytes separately
and amortize them explicitly in reconnect/product analysis.

### S2 — acknowledged public/owner JSON deltas

For each recipient, maintain separate public and owner projection cursors.
Every delta names the exact acknowledged base it depends on. A client applies
a delta only when run, authority epoch, connection epoch, manifest hash,
projection lane, and `baseSnapshotId` all match its installed base.

Public entity identity is:

```text
(runId, ballparkEpoch, publicEntityId, incarnation)
```

`publicEntityId` is the stable runtime id. `incarnation` increases whenever a
retired id is created again. Ballpark's private `(epoch, slot, generation)`
handle stays server-side; slot/generation is never a public identity. A
Ballpark reset changes `ballparkEpoch` and forces a keyframe/rebase. Component
updates carry monotonically increasing per-entity component revisions. The
coarse-field lineage remains the independent `(runId, fieldRevision)` fact;
field revision changes only when that authoritative field is replaced or
invalidated.

A public delta contains only:

- frame/run/authority/connection lineage, lane, `baseSnapshotId`, new
  `snapshotId`, tick, sim time, event watermark, field revision, overload mode,
  and manifest hash;
- `creates`: complete public dynamic components for new entity incarnations;
- `updates`: entity identity plus changed components, each with its revision;
  absent components mean unchanged, while explicit `null` is a schema-defined
  value/removal only where allowed; and
- `despawns`: exact entity identity, lifecycle revision, and public reason.

Initial S2 has no AOI. Thus `despawn` means authoritative removal, never
"left interest." A later AOI protocol must add distinct `leaveInterest` and
`reenter` operations and earn its own lifecycle/privacy tests. Unknown-update,
duplicate-create, revision regression, wrong-incarnation despawn, or reuse of a
retired incarnation triggers gap recovery, never best-effort mutation.

The owner lane uses the same base discipline but contains only that bound
membership's private projection and owner component revisions. Public deltas
never contain exact cargo, loadout, consumables, delta-v, hidden cooldowns,
private signal, portal confirmation, command credentials, or another owner's
marker. Public and owner frames for one beat share `snapshotId`; the client
publishes the beat to gameplay/presentation only after both lanes apply, or
after a schema-declared owner-empty frame.

The authority may build one canonical public current view per beat, but every
recipient has its own ACK cursor and recovery state. It must not advance a
recipient base because another recipient ACKed. Until a newer state ACK is
validated, new deltas are generated from that recipient's last ACKed base.
Replaceable unsent deltas may coalesce; reliable events may not.

### S3 — keyframes, loss, reconnect, and bounded recovery

Send an aligned public+owner projected keyframe approximately once per second,
on late join, after a detected base gap, after bounded retention loss, after
Ballpark epoch/field lineage incompatibility, and on authenticated reconnect.
Keyframes include dynamic state only; immutable manifest content remains by
hash.

Add a cumulative client-to-authority state ACK naming `{snapshotId,
lastEventSeq}` after both public and owner lanes for that snapshot are
installed. ACKs are valid only for a snapshot issued to that exact current
run/membership/connection epoch. Future, unknown, cross-run, cross-membership,
and old-epoch ACKs are rejected and cannot retire a base. The event watermark
is a consistency cursor, not event delivery; `delivery` and `event` ACKs keep
their existing independent retirement semantics.

On a missing/out-of-order base the client does not partially apply the delta.
It retains its last complete view, emits one bounded `baseline-missed` request,
and waits for `rebase -> public keyframe -> owner keyframe -> baseline ACK`.
Further dependent deltas coalesce/drop until recovery. Repeated requests are
rate-limited. A rebase never crosses a reliable event ahead of the declared
event cursor; entitled retained events replay FIFO after the aligned baseline.

Late join and reconnect order is exact:

```text
ticket redemption / epoch fence
-> welcome with negotiated wire + manifest hash
-> verified manifest available
-> rebase
-> aligned public keyframe
-> aligned owner keyframe
-> client baseline/state ACK
-> dependent deltas and entitled reliable replay
```

Reconnect rotates connection identity/epoch and immediately fences the old
socket. Resume may use a retained ACKed base only if run, membership,
manifest, Ballpark epoch, field revision compatibility, snapshot retention,
and event cursor all validate; otherwise it takes the full ordered rebase
path. A new run always starts from a new baseline. No old epoch may apply,
ACK, retire, or observe new-epoch state.

Bound retention per recipient to the lesser of 32 materialized projected
bases, 2 MiB encoded/materialized accounting, or 2.5 seconds at the configured
projection rate. Never evict the sole ACKed base silently: schedule an aligned
keyframe/rebase, then discard older bases after its validated ACK. Bound gap
requests, pending keyframe, coalesced delta, and component dirty journals to
one current recovery generation. Existing 512 KiB application and 256 KiB
reliable sub-cap plus 256/64 KiB transport hysteresis remain unchanged.

## Wire evolution and backward compatibility

Do not add fields to exact-key v1 frames. Introduce
`lbh-multiplayer-json-v2` with explicit negotiation during ticket issuance and
hello. A ticket authorizes one supported wire version; the server returns the
chosen version in `welcome`. Unknown versions close with the existing sanitized
unsupported-version behavior.

V2 adds distinct `publicKeyframe`, `ownerKeyframe`, `publicDelta`, and
`ownerDelta` frames plus client `ackKind: "state"` and a bounded
`baselineMissed` control. Define exact keys and byte limits for every frame.
Do not use a `full` boolean to make one ambiguous state schema carry both
meanings. Reliable `event` frames and delivery/event ACKs retain their v1
semantics.

During canary rollout, one authority process may accept v1 or v2 sockets, but
each socket is permanently one version and receives only that version's
frames. V1 continues full-state projection behind an explicit compatibility
flag and separate byte metrics; it cannot share or advance a v2 base cursor.
Mixed-version clients must still observe identical public gameplay facts.
Default remains v1 until all S0–S3 gates pass. Then make v2 default for local
4–8 play while preserving a time-bounded v1 rollback flag. Remove v1 only
after reconnect, old-client rejection, and rollback evidence is archived.

Schema evolution within v2 is additive only through negotiated named
capabilities or a new schema version; exact-key validation remains strict.
Required component semantics may not be silently ignored. Manifest schema,
wire version, and component schema are separate identifiers.

## Replication state machine

```text
UNBOUND
  -> NEGOTIATED
  -> MANIFEST_REQUIRED -> MANIFEST_VERIFIED
  -> REBASING
  -> KEYFRAME_SENT
  -> LIVE_ACKED

LIVE_ACKED --projection--> DELTA_OFFERED --send/coalesce--> LIVE_ACKED
LIVE_ACKED --~1 Hz--> KEYFRAME_SENT --valid state ACK--> LIVE_ACKED
LIVE_ACKED --gap/retention/lineage change--> REBASING
any bound state --new connection epoch--> FENCED
any state --run end/close--> CLOSED
```

`KEYFRAME_SENT` does not become `LIVE_ACKED` on `ws.send`; only the exact
current-epoch state ACK advances it. State transition observers are default
off, immutable, bounded, and payload-free. Illegal transitions close or
rebase deterministically and increment a named reason counter.

## Exact acceptance tests

### Structural and codec tests

- Canonical JSON encoding is deterministic for equivalent projections;
  exact byte counters equal `Buffer.byteLength(encoded, "utf8")`.
- Component dirtying emits only changed components, in stable entity/component
  order; create/update/despawn and explicit-null behavior round-trip exactly.
- Entity id reuse increments incarnation; stale updates/despawns and a stale
  Ballpark epoch cannot mutate the replacement.
- Field revision mismatch, unknown base, skipped delta, reorder, duplicate,
  future ACK, and retention eviction each take the specified recovery path.
- Manifest hash/cache success, corruption, unknown schema, mid-run mismatch,
  and private-marker scan are exact.
- Public/owner pair application is atomic; every seeded owner secret appears
  only in its owner's lane and never in public, another owner, logs, metrics,
  manifest, close reason, or artifact.
- Reliable consequences remain FIFO/exactly once across delta loss, keyframe,
  reconnect, and rebase; state ACK never retires delivery/event work.
- V1/V2 negotiation, mixed cohort, unsupported version, default-off rollout,
  rollback, and old-epoch fencing pass.

### Cohort matrix

Run deterministic 1-, 4-, and 8-client cohorts at the current configured 10
Hz projection cadence. Each includes steady movement, creates/updates/
despawns, owner mutations, reliable actions, one intentionally lost delta,
one reordered delta, keyframe recovery, late join, and authenticated reconnect.

For each cohort require:

- one stable authority for the match and identical final public fact hashes;
- per-recipient ACK bases advance independently and never cross identity;
- no privacy, duplicate, unknown-base, stale-incarnation, or old-epoch apply;
- actual cadence >=90% of configured 10 Hz outside declared recovery;
- public+owner delta <=3 KiB p50 and <=6 KiB p95;
- aligned public+owner keyframe <=32 KiB p95;
- steady application traffic <=64 KiB/s/player, with <=80 KiB/s/player
  reported as sensitivity only; and
- exact per-class bytes, cadence, coalesce, recovery, retransmit, manifest,
  and reliable ledgers with no evidence overflow.

Size percentiles are per recipient over post-warm-up encoded frames. The
traffic gate includes deltas, amortized keyframes, reliable events, control,
ACKs, and reconnect/late-join amortization over the named window; it does not
divide aggregate egress by players after excluding a hot recipient. Report
cohort p50/p95/max and each recipient separately.

Then rerun the accepted F5 browser reconnect lane, T2a drainable pressure, T2b
hard-pressure fence/replay, the full multiplayer-network suite, and the
deterministic eight-player PR soak twice. The delta queue must retain the
existing state-coalescing and reliable-subqueue invariants. Finally rerun a
fresh normal soak only after the separate authored-lifecycle decision; the
preserved failed 45-minute artifact is never overwritten or converted.

A future 15 Hz experiment repeats the entire size/traffic/cadence matrix and
must still pass 64 KiB/s/player. Passing 10 Hz does not waive that gate.

## Atomic implementation order and owned files

Keep commits independently revertible and do not mix gameplay changes:

1. **`Tests: attribute exact replication bytes`** — add default-off S0
   accounting and 1/4/8 full-state reproductions. Own
   `scripts/sim-ws-adapter.cjs`, one new
   `scripts/replication-accounting.cjs`, focused adapter tests, and one new
   replication budget test. No wire shape change.
2. **`L0: serve content-addressed session manifests`** — add one canonical
   manifest builder/cache and cold control fetch, hash verification in client,
   privacy tests, and bounded metrics. Own one new
   `scripts/session-replication-manifest.cjs`, narrow control/runtime hooks,
   `src/sim/sim-stream-transport.js`, and focused tests. Do not move mutable
   state into the manifest.
3. **`L0: encode acknowledged JSON state deltas`** — add v2 codecs, entity /
   component projection, per-recipient public/owner cursors, dirty revisions,
   despawns, bounded bases, and client atomic application. Own
   `scripts/multiplayer-wire-protocol.cjs`, one new
   `scripts/multiplayer-delta-projection.cjs`, narrow adapter/runtime projection
   hooks, `src/sim/sim-stream-transport.js`, and focused codec/client tests.
4. **`L0: recover delta streams through keyframes`** — add ~1 Hz aligned
   keyframes, state ACK, gap/rebase, late join, reconnect, epoch fence, and
   reliable replay integration. Own the same replication modules plus focused
   recovery tests; do not change authority consequence semantics.
5. **`Tests: prove 1-4-8 delta replication budgets`** — add deterministic
   cohort fixtures/wrappers, exact class artifacts, loss/reorder scenarios,
   and F5/T2/soak regression entries. No threshold tuning after a run.
6. **`Docs: accept JSON delta replication`** — independent artifact audit and
   canonical docs update only if every 10 Hz gate passes. Otherwise preserve
   the negative evidence and choose exactly one measured next gate: binary
   encoding first if syntax dominates, compression if redundancy dominates,
   or AOI only if entity relevance dominates and lifecycle semantics are
   implemented.

Before each slice, recheck branch/status and assign exclusive file ownership.
After each commit, run focused tests and `npm run test:multiplayer-network`.

## Risks and stop conditions

- **Dirty-source ambiguity:** object mutation that bypasses component revision
  marking causes silent divergence. Until instrumentation proves coverage,
  compare reconstructed delta views against full projected truth every beat in
  tests and sampled diagnostics.
- **Base amplification:** slow ACKs make deltas against an old base larger.
  Measure ACK age and rebase rather than retaining unbounded history.
- **Keyframe budget dominance:** 1 Hz at the 32 KiB p95 ceiling consumes half
  the product budget. If observed keyframes stay near that ceiling, reduce
  their dynamic content or cadence with measured recovery tradeoffs before
  claiming success.
- **Identity aliasing:** `id` without incarnation, or public exposure of
  slot/generation handles, is a correctness/security failure.
- **Privacy regression:** delta caches are recipient projections, not shared
  full-state objects with fields deleted afterward.
- **Reliable coupling:** a state loss must never block, duplicate, reorder, or
  retire semantic consequences.
- **Mixed-version fleet drift:** v1 and v2 final fact hashes must match; version
  selection cannot change sim truth.
- **CPU trade:** bytes may fall while per-recipient diff/serialization cost
  rises. Record projection CPU by public-build, recipient-diff, encode, and
  send class; do not infer authorities-per-host from one match.

Stop and preserve evidence if JSON misses <=64 KiB/s/player or the size gates.
The 80 KiB/s sensitivity result may justify further codec work but is not
acceptance. Binary, compression, and AOI remain ordered, measured follow-ups;
none is pre-authorized by this packet. No local loopback result supports WAN,
WSS/TLS edge, hosted cost, Linux packet behavior, concurrent-match packing, or
24/48/96-client claims.
