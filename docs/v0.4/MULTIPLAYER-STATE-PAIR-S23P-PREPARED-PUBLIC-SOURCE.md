# S23P Prepared Public-Source Proof

## Outcome

S23P is correct, bounded, and measurably faster than S23 at four and eight,
but it is **not promoted**. S20 remains the negotiated product path for one
through four players, S23/S23P remain default-off research capabilities, and
eight-player admission remains closed.

“One authority” still means one dedicated logical single-writer gameplay
authority **per live match/group**. Concurrent matches multiply independent
authorities horizontally across a fleet. S23P never creates a global gameplay
authority and never moves owner truth, ACK/base selection, queues, or socket
commit outside the match authority.

## Exact Prepared-Proof Contract

The default-off `state-pair-public-body-prepared-v1` capability requires the
complete S23 public-body and S20 compressed positional fallback chain. The
server enables it only with
`LBH_SIM_WS_STATE_PAIR_PREPARED_PUBLIC_SOURCE_V1=true`; the evidence client
requests it explicitly with `LBH_S23P_PREPARED_PUBLIC_SOURCE=1`.

For one authority beat:

1. The adapter prevalidates candidate bindings, performs the manifest-bound
   public projection once, recursively freezes it, then revalidates the cohort
   after the awaited projection and immediately before proof issuance.
2. The authority walks property descriptors before reading any field. It
   rejects accessors, symbols, non-data/non-enumerable properties, non-plain
   objects, cyclic graphs, sparse/non-index arrays, mutable descendants,
   cross-match manifests, and oversized sources.
3. The authority canonicalizes and hashes that exact frozen public source once.
   One monotonically increasing snapshot may issue at most one proof, including
   against a deeply equal cloned object.
4. The proof stores opaque HMAC admission tokens and exact contiguous scheduler
   ordinals. The HMAC binds match, session, authority, membership, connection
   incarnation, admitted player, manifest, and exact capabilities. Diagnostics
   expose counts only, never the tokens or raw recipient identifiers.
5. Each recipient first performs a non-mutating proof inspection. Owner
   identity, public/owner atomicity, and the combined 1 MiB source bound pass
   before the consumer slot, public revision tracker, body history, or shared
   cache can mutate.
6. The first valid consumer builds the public core/body once; later consumers
   reuse that exact body. Owner projection, recipient envelope, lineage, ACK
   base, delta/keyframe choice, retained bytes, retransmit, recovery,
   compression, queue, and send remain recipient-local authority work.
7. Any invalid proof use revokes it. The adapter explicitly finishes unused or
   partially consumed proofs. A proof that never reaches a valid consumer does
   not advance public tracker or body history.

The normal S20/S23 admission path uses stored player and ordered-capability
equality. It does not recompute the S23P HMAC on publish, ACK, retransmit, or
recovery, so the default-off proof does not add cryptographic work to controls.

## Correctness And Adversarial Proof

`tests/runtime-state-pair-integration.cjs` proves:

- byte-exact S23/S23P keyframe and ACKed-delta wires;
- divergent ACK cohorts, retransmit, recovery, and forced-keyframe parity;
- exact public body reuse with recipient-local owner privacy;
- swapped ordinals, duplicate consumers, stale/finished/forged proofs, equal
  cloned sources, altered-player bindings, shallow freezes, nested and
  top-level accessors, and duplicate authority beats fail closed;
- malformed owner input cannot consume a slot or advance body history;
- unused proofs preserve the next valid S23 `body-1` wire; and
- a mixed S23P/plain-S23 cohort performs one body build/hash and zero redundant
  body-cache validations.

The final independent red-team found no remaining P1/P2/P3. The relevant
implementation chain is `3b7ceeb` (proof path), `b3145fb` (adversarial and
stale-source hardening), and `b9c6825` (validate before body commit).

## Sealed Product Evidence

Both profiler-off rounds use commit
`b9c6825a769864e80711ee9e50a7ba86bfcdc2de`, one authority process, one
isolated Node process per recipient, 5 s warmup, and exact 20 s windows.
Treatment and population order reverse across S20, S23, and S23P.

| Players | S23P p95 A/B | S23P p99 A/B | Authority Hz A/B | Result |
| ---: | ---: | ---: | ---: | --- |
| 1 | 28.50 / 28.20 ms | 28.73 / 28.82 ms | 9.80 / 9.80 | Absolute pass; S20 non-regression fails |
| 4 | 45.11 / 45.48 ms | 45.90 / 46.71 ms | 9.85 / 9.85 | Absolute pass; S20 traffic non-regression fails |
| 8 | 71.05 / 69.76 ms | 75.04 / 72.69 ms | 9.75 / 9.70 | Fails both absolute tail gates |

At eight, S23P improves median S23 p95 by 18.1%, p99 by 20.8%, authority CPU
by 10.3%, and cadence by 5.1%. That is real, but below the precommitted 30% p95
and 25% p99 recovery thresholds and still far outside the 50/70 ms absolute
gates.

Against admitted S20, one-player median p95/CPU/mean-traffic ratios are
1.866/1.735/1.599. Four-player p95 and CPU improve to 0.841/0.779, but mean and
p95 traffic remain 1.527/1.522. The precommitted 10% one/four non-regression
envelope therefore fails.

Every candidate run is correct and clean. Each issued beat records exactly one
public validation, canonicalization, public hash, body build, and body hash;
there are zero proof rejects or revocations in product captures and no active
proof at cleanup. Recipient counts ramp during warmup, so lifetime consumption
is bounded between one and the final population per issued beat rather than
incorrectly assuming the full cohort existed at process start.

Raw checksummed evidence and recomputed ratios are in
`docs/v0.4/evidence/state-pair-s23p/analysis.json`.

The registered 41-suite `multiplayer-network` lane ran exactly once with
retries disabled after implementation and evidence closure; every selected
suite passed.

## Decision

- Do not enable or promote S23P.
- Keep S20 as the one-through-four product default.
- Keep eight closed; do not relax cadence or 50/70 ms tail gates.
- Keep S23/S23P only as bounded research scaffolding.
- Do not infer hosted, fleet-packing, heavier-sim, WAN, AOI, or 24/48/96
  capacity from this single-match local loopback result.
- Do not start another implementation lane from this result. `S24` remains the
  reserved name for the future 24-player scale track.
