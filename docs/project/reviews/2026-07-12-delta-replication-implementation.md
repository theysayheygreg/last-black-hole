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
steady authority->client accepted bytes/player/second =
  accepted delta bytes/beat * actual beats/second
  + accepted keyframe bytes / keyframe interval seconds
  + accepted reliable events + downstream control
  + cold-manifest and reconnect amortization
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

The product gate counts only exact UTF-8 authority-to-client application bytes
accepted by `ws.send`: deltas, keyframes, events, and downstream control.
Offered-but-coalesced, rejected, and failed sends do not enter the numerator.
Client-to-authority input, action, ACK, and control bytes are reported in a
separate upstream row and do not dilute or inflate the <=64 KiB/s downlink
gate. Transport/TLS bytes are also separate and cannot replace this
denominator. This direction-correct definition supersedes the combined
direction denominator used to describe the preserved negative artifact.

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
**direction**, wire version, frame class, and projection beat:

- offered bytes/frames, accepted-by-`ws.send` bytes/frames, coalesced bytes,
  policy-dropped bytes, retransmitted bytes, and ACK-retired frames;
- public keyframe, public delta, owner keyframe, owner delta, reliable event,
  control, input, action, and ACK as distinct classes, with no aggregation
  across direction;
- actual projection beats/s and keyframes/s, never configured cadence alone;
- per-frame encoded bytes plus delta entity/component/despawn counts; and
- manifest transfer bytes separately from match-stream bytes.

The counter is advanced exactly once at the causal boundary it names. A
failed send is not accepted traffic. Observer output contains no payload,
credential, raw membership/player/connection id, private value, or IP address;
use run-local salted identities and bounded aggregates. Default production
cost with diagnostics disabled must remain zero per-frame object allocation.

S0 reproduces the negative artifact's 1/4/8 full-state baseline and minute-9
class accounting within 1% while also splitting it by direction; the report
must reconcile the old combined total to the sum of the new upstream and
downstream totals. No payload change lands until these counters are
independently tested.

### S1 — content-addressed static session manifest

Create one immutable, public, content-addressed manifest per run/map content
selection. Canonical JSON means: recursively order object keys by Unicode code
point; preserve schema-defined array order (and explicitly sort sets before
encoding); require schema strings to be NFC-normalized; accept only finite JSON
numbers; normalize `-0` to `0`; encode
numbers with ECMAScript `JSON.stringify`'s shortest round-trippable form; use
UTF-8 without BOM or trailing whitespace; and hash the exact served bytes,
not a reparsed object. The control path advertises `{manifestSchema,
manifestHash, manifestBytes, fetchPath}`. `manifestBytes` is capped at 1 MiB.
The client fetches exactly those advertised bytes from an authenticated
same-origin path, verifies byte count and SHA-256, and caches one accepted copy
by `(manifestSchema, manifestHash)`; the bounded retry rule below governs a
failed first attempt.

Ticket redemption enters `MANIFEST_REQUIRED`: heartbeats and sanitized errors
may flow, but no rebase, keyframe, delta, owner projection, or reliable event
may be sent. The fetch uses a registry-bound, 128-bit-or-stronger random
one-use capability in an authorization header, never a URL/query/log field.
Allow one in-flight fetch, a 10-second monotonic timeout, one retry with the
same immutable hash and a freshly issued bound one-use capability, and a 1 MiB
response cap. After verification the client
sends `manifestAck {manifestSchema, manifestHash, manifestBytes}` on its bound
connection epoch. Only an exact current-epoch ACK advances to
`MANIFEST_VERIFIED` and permits rebase. Timeout, oversized bytes, wrong origin,
wrong count/hash, stale ACK, or capability mismatch closes admission without
emitting private or gameplay state.

The manifest may contain immutable public definitions: map bounds, static
anchor definitions, public content type/config references, visual descriptors,
and stable source ids. It must not contain run secrets, tickets, credentials,
private inventory/loadout/effect values, hidden spawns, owner-only state, or
mutable transforms/lifecycle. A well's immutable definition may be static;
its changing radius/state remains authoritative replication.

Hash mismatch, unknown schema, fetch failure, or manifest hash change within a
run is fatal to admission and requires a fresh authorized fetch. A new `runId`
may select a different manifest. The manifest is not a reliable-event lane and
does not count as repeated steady stream egress; report cold-fetch bytes
separately and amortize them using the exact product formula below.

### S2 — acknowledged public/owner JSON deltas

On **every projection beat**, the authority first builds canonical, complete
current public and owner projections from committed sim truth. It then
structurally diffs each recipient's current projection against that
recipient's materialized, ACKed public/owner base. Dirty markers and component
revisions may skip comparison candidates only as hints; they are not the
source of truth until a later coverage proof demonstrates no bypassing
mutation. Initial S2 must remain correct if every dirty hint is disabled.

For each recipient, maintain separate public and owner projection cursors.
Every delta names the exact acknowledged base it depends on. A client applies
a delta only when run, authority epoch, connection epoch, manifest hash,
projection lane, and `baseSnapshotId` all match its installed base.

Public entity identity is:

```text
(runId, ballparkEpoch, publicEntityId, incarnation)
```

`publicEntityId` is a deterministic length-prefixed namespace of authoritative
`(category, sourceId)` (`<categoryByteLength>:<category><sourceIdByteLength>:<sourceId>`
over NFC-normalized UTF-8). Dynamic sources must receive a stable authority-issued
`sourceId` before first projection. Duplicate namespace keys among live or
retained identities reject the projection and fail closed; they are never
silently suffixed. `incarnation` increases whenever a retired id is created
again. `ballparkEpoch` increments before exposure on every registry/lifecycle
reset. Ballpark's private `(epoch, slot, generation)`
handle stays server-side; slot/generation is never a public identity. A
Ballpark reset changes `ballparkEpoch` and forces a keyframe/rebase. Component
updates carry monotonically increasing per-entity component revisions. The
coarse-field lineage remains the independent `(runId, fieldRevision)` fact;
field revision changes only when that authoritative field is replaced or
invalidated.

A public delta contains only:

- frame/run/authority/connection lineage, lane, `baseSnapshotId`, new
  `snapshotId`, tick, sim time, event watermark, field revision, overload mode,
  manifest hash, and a canonical SHA-256 public `resultProjectionHash`;
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
after a schema-declared owner-empty frame. Each lane carries a hash only of its
own exact canonical reconstructed projection: the public hash is identical for
the same public truth and never incorporates owner bytes; the owner hash is
recipient-private. After assembling both lanes the client recomputes both
hashes, then publishes atomically. Either mismatch discards the candidate view,
retains the last complete base, and enters fail-closed rebase; it never
publishes partial state or exposes a private-derived hash in the public lane.

The authority may build one canonical public current view per beat, but every
recipient has its own ACK cursor and recovery state. It must not advance a
recipient base because another recipient ACKed. Until a newer state ACK is
validated, new deltas are generated from that recipient's last ACKed base.
Every snapshot has one `statePairId` and exactly one public plus one owner
frame. The adapter reserves application-queue capacity for both frames
atomically and keeps at most one **queued, unsent** pair per recipient; a newer
beat atomically replaces that whole pair. The two frames send contiguously as
one state work item. If only one lane is transport-accepted before a socket
failure, the client holds it as unpublished and the next epoch rebases; it can
never ACK a half-pair. Already accepted complete pairs may be in flight and
retained, each independently based on the last validated ACK.
There is at most one pending recovery/keyframe generation. Reliable events may
not coalesce behind either rule.

### S3 — keyframes, loss, reconnect, and bounded recovery

Send an aligned public+owner projected keyframe approximately once per second,
on late join, after a detected base gap, after bounded retention loss, after
Ballpark epoch/field lineage incompatibility, and on authenticated reconnect.
Keyframes include dynamic state only; immutable manifest content remains by
hash.

Add one cumulative client-to-authority state ACK naming `{snapshotId,
publicResultHash, ownerResultHash, lastEventSeq}` only after both public and
owner lanes for that snapshot are installed atomically. There are no
independent public-only or owner-only ACKs. ACKs are valid only for a complete
pair issued to that exact current
run/membership/connection epoch. Future, unknown, cross-run, cross-membership,
old-epoch, half-pair, hash-mismatched, duplicate-current, and regressive ACKs
are classified separately; only an exact newer complete-pair ACK advances the
base. Duplicate-current ACK is an idempotent no-op, while the other stale or
invalid classes reject and cannot retire a base. The event watermark
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

Bound retention per recipient to the lesser of **25 complete projected base
pairs**, **2 MiB of canonical encoded public bytes plus canonical encoded
owner bytes plus the canonical encoded retention metadata envelope**, or
**2.5 seconds of base age**. The artifact reports those three byte components
separately and their exact sum; heap/RSS remain separately measured because JS
object overhead is not approximated as wire bytes. A pair is admitted atomically
only if both lanes and metadata fit all three bounds. An individually oversized pair fails the recipient with
`projection-too-large` before send; it is not partially retained or split to
evade the cap. Never evict the sole ACKed base silently: schedule an aligned
keyframe/rebase, then discard older bases after its validated ACK. Bound gap
requests, pending keyframe, coalesced delta, and component dirty journals to
one current recovery generation. Existing 512 KiB application and 256 KiB
reliable sub-cap plus 256/64 KiB transport hysteresis remain unchanged.

## Wire evolution and backward compatibility

Do not add fields to exact-key v1 frames. Introduce
`lbh-multiplayer-json-v2` with explicit negotiation during ticket issuance and
hello. Ticket issuance receives the client's supported-version set and the
server selects the highest mutually supported allowed version. The ticket is
a cryptographically random, single-use, expiring registry record bound to
`runId`, reserved seat/membership, selected wire version, capability set,
manifest hash, and admission or resume purpose. Hello must echo that selected
version and capabilities exactly; it cannot request v1 with a v2-bound ticket,
remove a required capability, or substitute another manifest. Any mismatch is
a sanitized admission rejection, preventing on-path or caller-driven downgrade.
The server returns the same chosen version in `welcome`. Unknown versions close
with the existing sanitized unsupported-version behavior.

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
Rollback issues a newly registry-bound v1 ticket under explicit operator
configuration; a v2 ticket is never reinterpreted as v1.

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
current-epoch complete-pair state ACK advances it. One pending keyframe
generation blocks another keyframe offer; newer canonical truth coalesces into
the single queued replacement pair until the pending keyframe ACKs or times
out into a new rebase generation. A stale ACK cannot clear `KEYFRAME_SENT`,
free retention, or unblock a generation. State transition observers are default
off, immutable, bounded, and payload-free. Illegal transitions close or
rebase deterministically and increment a named reason counter.

## Exact acceptance tests

### Structural and codec tests

- Canonical JSON encoding exercises key insertion permutations, UTF-8 and
  escaping, schema-defined array/set order, integer and fractional number
  spellings, exponent boundaries, `-0`, and rejection of NaN/Infinity; the
  SHA-256 is over exact served/encoded bytes and exact byte counters equal
  `Buffer.byteLength(encoded, "utf8")`.
- Every beat builds canonical complete public/owner current views and
  structurally diffs them against each recipient's materialized ACK base.
  Dirty hints disabled and deliberately wrong dirty hints produce the same
  deltas. At 1/4/8, applying every delta reconstructs a full-view canonical
  hash exactly equal to the authority's canonical current-view hash on every
  beat. A seeded mismatch publishes no partial view and takes fail-closed
  rebase.
- Structural diff emits only changed components in stable entity/component
  order; create/update/despawn and explicit-null behavior round-trip exactly.
- Entity id reuse increments incarnation; stale updates/despawns and a stale
  Ballpark epoch cannot mutate the replacement.
- Field revision mismatch, unknown base, skipped delta, reorder, duplicate,
  future ACK, and retention eviction each take the specified recovery path.
- Manifest canonical byte/hash/cache success, `-0`, malformed UTF-8,
  corruption, unknown schema, wrong-origin/auth, timeout, retry, oversize,
  mid-run mismatch, manifest-ACK epoch, admission pause, and private-marker
  scan are exact.
- Public/owner pair application is atomic; every seeded owner secret appears
  only in its owner's lane and never in public, another owner, logs, metrics,
  manifest, close reason, or artifact.
- Reliable consequences remain FIFO/exactly once across delta loss, keyframe,
  reconnect, and rebase; state ACK never retires delivery/event work.
- V1/V2 registry-bound ticket negotiation, attempted downgrade/capability
  stripping, mixed cohort, unsupported version, default-off rollout, explicit
  rollback with fresh ticket, and old-epoch fencing pass.
- Retention proves <=25 complete pairs, <=2 MiB exact canonical lane bytes,
  <=2.5 seconds, atomic oversize rejection, one queued unsent pair, one pending
  keyframe generation, complete-pair-only ACK, duplicate-current no-op, and no
  stale-ACK retirement.

### Cohort matrix

Run deterministic 1-, 4-, and 8-client cohorts at the current configured 10
Hz projection cadence. Use a 60-second warm-up followed by one exact
300-second measurement window. Each includes steady movement, creates/updates/
despawns, owner mutations, reliable actions, one intentionally lost delta,
one reordered delta, keyframe recovery, late join, and authenticated reconnect.

For each cohort require:

- one stable authority for the match and identical final public fact hashes;
- per-recipient ACK bases advance independently and never cross identity;
- no privacy, duplicate, unknown-base, stale-incarnation, or old-epoch apply;
- actual cadence >=90% of configured 10 Hz outside declared recovery;
- public+owner delta <=3 KiB p50 and <=6 KiB p95;
- aligned public+owner keyframe <=32 KiB p95;
- steady authority-to-client accepted encoded traffic <=64 KiB/s/player, with
  <=80 KiB/s/player
  reported as sensitivity only; and
- exact per-class bytes, cadence, coalesce, recovery, retransmit, manifest,
  and reliable ledgers with no evidence overflow.

Size samples are complete public+owner pairs accepted during the 300-second
window. Sort ascending and use nearest-rank `value[ceil(p*N)-1]` for p50/p95/
p99; `N=0` fails. Cadence is complete accepted pairs divided by eligible live
seconds. Its denominator excludes only monotonic intervals from the first
seeded loss/reconnect action through the exact complete-pair recovery ACK, and
those excluded intervals/bytes are reported as recovery, never silently
discarded. Warm-up bytes are reported but not used for steady percentiles.

The primary all-in traffic numerator is every authority-to-client frame
accepted by `ws.send` during the complete 300-second window; recovery bytes
remain included. Divide each recipient's accepted bytes by its exact connected
seconds, and require every recipient plus aggregate recipient-byte /
recipient-second ratio to pass. Report upstream independently.

For product-frequency normalization, also calculate a recovery-free baseline
from the same workload by subtracting the explicitly bounded reconnect window's
accepted bytes and connected seconds. The removed bytes and denominator remain
visible in the artifact. Product amortization then adds that reconnect's
**excess over the recovery-free baseline exactly once**, using an explicit
45-minute run model:

```text
recovery_free_downlink_Bps =
  non_recovery_accepted_downlink_bytes / non_recovery_connected_seconds

reconnect_excess_bytes = max(0,
  measured_reconnect_60s_bytes
  - recovery_free_downlink_Bps * reconnect_connected_seconds)

amortized_downlink_Bps = recovery_free_downlink_Bps
  + cold_manifest_served_bytes / 2700
  + reconnect_excess_bytes / 2700
```

This models one cold manifest fetch and one reconnect per player per 45-minute
run. Also report the unamortized cold-admission window from fetch start through
baseline ACK and the reconnect window from fence through new-epoch baseline
ACK. Both the strict 300-second all-in value and the separately normalized
45-minute amortized value must pass <=64 KiB/s/player; 80 KiB/s/player remains
sensitivity only. The all-in row proves the deliberately high test recovery
frequency, while the normalized row models one reconnect without counting the
seeded reconnect twice. No cohort average may hide a hot recipient.

### Authority and client performance gates

Run full-state v1 and delta v2 against the identical deterministic seed,
action schedule, entity population, 1/4/8 topology, machine identity, warm-up,
and 300-second window. Preserve the soak authority gates: sim tick p95 <=10
ms, p99 <=20 ms, max <=100 ms; completed projection p95 <=20 ms, p99 <=40 ms,
max <=150 ms; event-loop p99 <=50 ms, max <=250 ms; and GC duty/pause/heap
bounds from the accepted soak contract. V2 must also stay within 10% of v1 for
process CPU seconds per sim minute, ELU active ms/minute, sim tick p95/p99,
projection p95/p99, and post-GC heap median. Any larger regression requires an
explicit accepted performance decision; bandwidth success cannot waive it.

Record non-overlapping authority spans for canonical public build, per-owner
build, per-recipient structural diff, canonical encode/hash, and send offer /
acceptance. Record client spans for parse, validation, structural apply/hash,
atomic publish, and render-frame interval. On the GregBot browser reference
lane require parse+validate+apply+hash p95 <=4 ms and p99 <=8 ms, total
replication main-thread span p95 <=6 ms and p99 <=12 ms, zero replication
long tasks >=50 ms, mean presented rate >=58 fps, frame-interval p95 <=20 ms,
and p99 <=33.4 ms over the post-warm-up window. Use the same nearest-rank rule,
report max and sample count, and keep presentation/render workload identical.

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
   component canonical structural diff, per-recipient public/owner cursors,
   dirty revisions as hints only,
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
  marking causes silent divergence. Initial S2 therefore builds and
  structurally diffs canonical current views, then compares reconstructed
  client view hashes against authority full-view hashes on every beat at
  1/4/8. Dirty hints cannot become authoritative until a separate coverage
  proof is accepted.
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

## S0 status — accepted, capture pending

Directional accounting landed at `69b835f` and independent fix-forward
`5d1e36f`. The default-off ledger now attributes reconnect traffic to stable
recipients, bounds every retained set/interval/event collection, recognizes
reliable retransmission across connection epochs, separates projection kind,
records every offered terminal outcome and identity-bearing ACK retirement,
and fences callbacks by run, connection, and outbound epoch. Focused accounting
passes 17/17, adapter core 28/28, and the full multiplayer-network lane 15/15.
Two pre-fix capture artifacts are preserved as non-credit failures; fresh
clean 1/4/8 v1 full-JSON capture is required before S1 and cannot claim delta
or 64 KiB/s acceptance.

The first post-fix capture
`multiplayer-replication-s0-2026-07-13T011131689Z-5d1e36f` remains rejected as
complete S0 evidence: frame-shape accounting read `state.bodies`, but real v1
public entities live in `state.players` and `state.world.*`, so its entity,
component, and despawn zeroes are false. The directional subset is valid and
preserved. At 1/4/8, authority-to-client downlink measured
273,998/260,997/246,312 B/s/player, uplink 1,722/1,765/1,822 B/s/player, and
public state 92.5–92.6% of downlink. Pair cadence was about 9.72 Hz; projection
p95 context was 4.67/7.65/12.24 ms; reliable retirement and cleanup were exact.
Add schema-aware nonzero v1 shape goldens and run once from zero before calling
S0 capture complete.
