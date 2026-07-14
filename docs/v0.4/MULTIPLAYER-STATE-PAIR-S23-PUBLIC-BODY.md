# S23 Shared Public Body And Recipient Lineage Envelope

Status: design gate approved for one default-off prototype. Product admission
remains S20: negotiated Brotli admits one through four players; eight remains
closed until profiler-off evidence passes every gate below.

## Authority boundary

Every live match/group owns one dedicated logical single-writer authority.
Concurrent matches multiply that authority horizontally. S23 may share
immutable replication work only inside one match authority; it does not share
gameplay state across matches, add workers, or give a client any authority.

The match authority remains the only owner of body generation, body history,
base-cohort selection, recipient envelopes, owner overlays, pair selection,
compression, ACK/base and retained-wire ledgers, queue/send, and gameplay
consequences.

## Version and negotiation

`state-pair-public-body-v1` is an additive capability above the complete S20
chain (`state-pair-v1`, mixed, sparse runtime components, positional fallback,
and Brotli). Ticket, welcome, client receiver, and server framing pin one
schema for the whole connection. A body session never mixes body and legacy
state-pair frames. A fresh session without the capability uses the unchanged
S20 compressed positional path.

## Body-global versus envelope-local fields

The immutable `lbh-public-body-v1` record contains only:

- match, authority-incarnation, Ballpark epoch, and manifest binding;
- a match-local monotonic `bodyRevision` and derived `bodyId`;
- canonical public world facts;
- canonical public entities/components and their global revisions;
- a canonical SHA-256 body hash.

It contains no transport session/connection id, recipient membership id,
recipient-scoped identity/incarnation, authenticated account/profile id, rig,
cargo, equipped/consumable state, private progression, input/action cursors,
state-pair/frame/snapshot id, ACK state, recovery reason, queue state, or
retained-wire metadata. Match-public gameplay handles currently named
`clientId`/`sourceId` are allowed because public entities and targets already
refer to them; they are match-visible simulation handles, not command
credentials, membership ids, profiles, or durable account identities. If that
runtime contract changes, S23 must first pseudonymize those handles per match.
The body privacy scanner rejects recipient/private names recursively and
rejects owner-only component families.

The `lbh-authority-state-pair-body-v1` recipient envelope owns:

- match/session/authority/recipient identity and recipient incarnation;
- frame, state-pair, and snapshot ids;
- tick, sim time, event watermark, field revision, overload mode, Ballpark
  epoch, and manifest hash;
- target body id/revision/hash and optional exact base body id/revision/hash;
- public keyframe/delta kind and owner keyframe/delta lineage;
- owner-private projection/payload and every ACK/recovery/retransmit fence.

Tick/time/event/overload remain envelope-local because they are publication
and consequence watermarks, not world/entity body content. The target body
binding proves which immutable world revision that envelope presents.

## Body history and cohorts

The authority constructs, canonicalizes, hashes, and deep-freezes one body per
authoritative source tick. Synchronized recipients reference the same body
object and keyframe bytes. Public deltas are computed once per exact cohort
`baseBodyId/baseBodyHash/baseBodyRevision -> targetBodyId/targetBodyHash` and
reused as immutable data. Divergent, missing, evicted, or invalid bases get a
keyframe; the authority never advances or delays a recipient to manufacture a
cohort.

Hard limits for the prototype:

- 16 retained body revisions and 8 MiB of canonical body/delta material per
  match authority;
- 16 exact public base cohorts per target tick;
- existing 12 pending pairs and 2 MiB retained wire per recipient;
- existing 256 retired ACK proofs per recipient;
- no cross-match, cross-authority, cross-Ballpark, cross-manifest, or
  cross-schema references.

Eviction is deterministic oldest-revision first after live pending/ACK
references are inspected. A recipient whose base was evicted is forced to a
body keyframe and has its public base reset without changing its owner base.
No client can retain more history than the global caps, create more than one
cohort for its exact base in a tick, or prevent eviction. Disconnect,
recipient-epoch rotation, authority/Ballpark/manifest rotation, and match
shutdown release recipient references; unreferenced bodies/deltas then retire
oldest-first.

## Correctness and admission gate

The prototype must prove semantic parity with S20 for public keyframes/deltas,
owner changes, mixed bases, missed frames, retransmit, reconnect/recovery,
epoch/manifest rotation, slow clients, eviction, wrap/limits, and adversarial
input. Decoded client-visible state, canonical semantic hashes, ACK transcript
consequences, privacy, and cleanup must match; S23 wire bytes intentionally do
not match S20.

It must also prove one body build/hash per tick, real cohort reuse in
synchronized four/eight-player product runs, safe cohort misses for divergent
bases, immutable alias safety, bounded history/references, exact compressed
retransmit, and no cross-match leakage.

Counterbalanced profiler-off 1/4/8 runs use separate client processes and no
cadence-collapse bandwidth credit. One/four must not regress. Eight is admitted
only at every recipient >=9 Hz in `NORMAL`, projection/publish p95 <=50 ms and
p99 <=70 ms, normalized 10 Hz mean <=64 KiB/s and p95 <=80 KiB/s, with exact
correctness, privacy, memory bounds, and cleanup. A failure is preserved as
evidence and reverted unless a feature-off seam has clear maintenance value
and leaves the default path byte-for-byte untouched.
