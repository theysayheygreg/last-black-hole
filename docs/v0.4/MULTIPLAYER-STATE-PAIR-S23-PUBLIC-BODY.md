# S23 Shared Public Body And Recipient Lineage Envelope

Status: implemented and retained default-off, but rejected for product
admission. S20 negotiated Brotli remains the product path for one through four
players. Eight remains closed.

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

`state-pair-public-body-v1` plus the distinct
`state-pair-public-body-brotli-v1` envelope are additive capabilities above the
complete S20 chain (`state-pair-v1`, mixed, sparse runtime components,
positional fallback, and Brotli). The S23 envelope binds canonical
`lbh-authority-state-pair-body-v1` bytes rather than claiming S20 positional
inner framing. Ticket, welcome, manifest, client receiver, and server framing
pin one schema/profile for the whole connection. A body session never mixes
body and legacy state-pair frames. A fresh session without both S23
capabilities uses the unchanged S20 compressed positional path.

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

- 16 retained body revisions and 8 MiB combined canonical body, active encoded
  body, and cohort-delta material per match authority;
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

## Implemented result

The corrected prototype proves the representation works without weakening the
authority boundary. The codec allowlists body/world/entity/component shape,
the adapter deep-freezes one authority-projected source object per beat, the
authority independently hashes each new body, and the client verifies content,
base, lineage, and result hashes before publishing visible state. Keyframe body
bytes are serialized once and shared while inside the combined material cap;
delta cohorts share one immutable payload object. Recipient envelopes,
owner-private projections, ACK/base ledgers, retained exact compressed wires,
recovery, queues, and send commit remain per-recipient and authority-owned.

Focused proof covers 49 public-body assertions, S20/S23 visible-state and ACK
parity, privacy, malformed body/hash/base rejection, divergent cohorts,
eviction, reconnect cleanup, exact retransmit, distinct compression profiles,
and capability dependency chains. The final red-team pass found no remaining
blocker.

Two profiler-off rounds reverse both treatment and population order. At four,
S23 sustains 9.80/9.85 Hz in NORMAL with 50.88/49.17 ms projection p95; round A
misses the 50 ms gate. At eight it recovers 9.00/9.10 Hz and NORMAL overload,
but projection p95 is 88.58/88.33 ms and p99 is 95.05/94.63 ms, failing both
tail gates. One passes absolute gates but doubles median projection p95 and
raises median authority CPU 81.5% versus S20. Real cohort reuse is present at
four (724/704 hits) and eight (1,722/1,748 hits), and all correctness, cleanup,
and combined-material bounds pass.

Decision: keep the bounded capability and proof harness default-off because it
is useful architecture research; do not replace S20, do not admit S23 at any
population, and do not admit eight. Evidence and recomputed gates are under
`docs/v0.4/evidence/state-pair-s23/`.
