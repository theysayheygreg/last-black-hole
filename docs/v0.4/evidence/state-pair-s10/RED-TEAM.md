# S10 independent red-team review

Final verdict: **no P1 or P2 remains**.

The reviewer independently inspected the receiver ledger, authority ACK path,
runtime evidence gate, adversarial fixtures, and cleanup semantics. Focused
publisher, receiver, base-ledger, runtime-integration, and artifact-boundary
suites passed. The complete multiplayer-network lane subsequently passed all
28 selected suites.

## Closed findings

1. Product admission and convergence-only evidence are separate. Product
   admission retains traffic, >=9 Hz receiver cadence, authority clock, and
   NORMAL-overload requirements. A slow authority/receiver pair can pass only
   the explicitly labeled convergence diagnostic.
2. Closed sockets still capture receiver diagnostics and call teardown.
   Artifact validation requires `closed=true`, zero ledger entries, and zero
   ledger bytes for every client.
3. Public and owner deltas naming different retained atomic bases reject before
   application. A stale despawn/reincarnation branch and a future old-base
   lifecycle-regression bridge cannot poison or replace the visible head.
4. Exact ACKs racing pending eviction or rebase are validated against bounded
   retired hash/lineage proofs and become no-ops. They cannot restore an old
   base, while forged ACKs still fail closed.
5. ACK convergence uses distinct recipient states with at least one real base
   advance. Duplicate, stale, retired, and rejected ACKs cannot increment the
   proof.
6. Cadence is compared per recipient rather than against a misleading
   population average. Per-recipient authority rate, receiver rate, and
   tolerance are persisted and arithmetically revalidated.
7. Client base retention and authority retired-proof retention are explicit
   bounds, not unbounded histories: 64 entries / 8 MiB / 60 seconds on the
   client, and 256 proof-only records per authority recipient.

## Adversarial coverage

- ACK lag from one through eight beats
- out-of-order retained-base branches and stale visibility fencing
- mixed public/owner atomic-base splice
- duplicate frame mutation and cursor reuse
- forged base hashes, malformed JSON, and negative zero
- count and age eviction with one edge-triggered recovery episode
- racing deltas and retransmits during recovery
- reconnect, manifest/schema/incarnation changes, explicit rebase, and teardown
- despawn/reincarnation continuity across stale branches and a newer visible
  lifecycle head
- exact late ACKs across pending eviction and rebase, plus distinct-recipient
  base-advance accounting

## Remaining boundary

This review accepts the correctness and convergence slice only. It does not
approve default capability enablement, product traffic/CPU admission, binary
or compressed transport, AOI, hosted WSS, WAN behavior, or fleet scale.
