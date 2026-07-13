# S16 Binary State-Pair Codec Decision

Status: **prototype complete; reject as the release default**.

S16 tests one bounded transport change inside the existing multiplayer
boundary. One logical authority process remains the sole gameplay writer for
one match/group. Production would run many such authorities for many concurrent
matches; S16 does not create a global gameplay authority or imply one VM per
match.

## Contract

`state-pair-binary-v1` carries the exact S15 positional state-pair semantic
array in a WebSocket binary message. It uses a 42-byte versioned header with a
magic value, positional-manifest digest, frame tag, and payload length. The
payload is a deterministic typed tree with bounded arrays, strings, nesting,
nodes, varints, and total bytes. Integers use canonical unsigned magnitudes;
other finite numbers use big-endian IEEE-754. Negative zero and non-finite
numbers fail closed.

There is no base64 layer. The authority builds an immutable `Buffer`, the send
queue retains that exact byte sequence, accounting uses its exact length, and
retransmit/flush reuses it without reserialization. ACK and recovery frames use
the same negotiated binary codec. A peer must also negotiate
`state-pair-positional-v1`; positional JSON remains the complete renegotiated
fallback and the semantic oracle. There is deliberately no per-frame downgrade:
an already-bound binary session fails closed and must reconnect/renegotiate
without binary. Cross-codec state-pair traffic is rejected, so failure cannot
create mixed framing or alter manifest/capability/ACK lineage.

The prototype does not change authority, selected S15 keyframe/delta kind,
privacy, ACK lineage, recovery, limits, cadence, overload, or admission policy.

## Correctness and malformed-input proof

The focused codec suite passes 9/9. It proves 24 exact binary/positional
transactions with accepted ACK lineage, 519 string/number/property cases,
28 crafted malformed frames, and 1,000 deterministic mutated frames. Any fuzz
mutation that is accepted must decode to the exact original semantics; at least
950 mutations must be rejected. JSON fallback, explicit negotiation,
cross-codec rejection, deterministic output, and queue byte immutability are
also covered.

## Measured result

The fixed-window bakeoff uses the sealed S15 process artifact as baseline and a
clean S16 implementation at `5161899`. Each population is one separate
authority process for one match/group plus 1, 4, or 8 isolated client processes
for five seconds of warmup and a fixed twenty-second measurement window.

| Players | S15 receiver Hz | S16 receiver Hz | S15 / S16 projection p95 ms | S15 / S16 authority CPU | S15 / S16 actual worst mean B/s | S15 / S16 normalized 10 Hz mean B/s |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 9.85 | 9.85 | 26.26 / 27.26 | 27.18% / 28.41% | 59,486 / 41,313 | 60,385 / 41,934 |
| 4 | 5.35 | 5.20 | 103.43 / 123.54 | 59.24% / 60.47% | 36,080 / 24,739 | 67,019 / 47,130 |
| 8 | 3.25 | 3.10 | 224.80 / 241.39 | 78.19% / 79.27% | 25,506 / 16,658 | 77,482 / 52,666 |

Binary reduces actual worst-recipient mean traffic by 30.6%, 31.4%, and 34.7%
at 1/4/8. It also brings the counterfactual normalized 10 Hz mean and p95 below
the 64/80 KiB/s gates at all three populations. That traffic result receives no
admission credit where cadence collapsed.

The authority trade is negative: projection/publish p95 regresses 3.8%, 19.4%,
and 7.4%; authority CPU rises 4.5%, 2.1%, and 1.4%; and receiver cadence does
not improve. Four and eight remain `DILATED` and fail cadence/clock.
Only one player passes the unchanged product gate.

The codec-only benchmark reinforces the decision boundary. On 120
representative public-delta plus owner-keyframe frames over 20 measured
iterations, the generic binary tree is 3.5% larger than positional JSON and
3.3x slower to encode on this machine. Product frames still save bytes because
their shapes and repeated lexical content differ from this synthetic fixture,
but the generic encoder does not earn an authority-side release win.

## Decision

Keep S15 positional JSON as the release default. Retain S16 as an opt-in,
versioned prototype and evidence source; do not promote it to negotiated release
capabilities. The next single lane is authority-side profiling and removal of
repeated candidate construction/materialization while preserving S15 selection
and positional wire truth. Another codec attempt must wait for evidence that it
does not worsen the already-dominant projection/publish clock.

Evidence: `docs/v0.4/evidence/state-pair-s16/`, top-level composite SHA-256
`f077681ad3aad674494c44bf1d8f7b3701c5261089c9fda027863a6977081179`.

Limitations: machine-local loopback; one twenty-second candidate window per
population; synthetic machine-local codec microbenchmark; no WAN, TLS, hosted,
fleet, 24/48/96, or heavy-sim claim.
