# S6 Prepared Replication Projection Evidence

S6 accepts the authority-internal prepared projection optimization measured at
commit `a243194b32294d750c810f92f5927c97b27868bc`, plus the independent-review
validation correction at `21ecef2`. It does **not** admit the
multiplayer product gate. The optimization materially reduces authority CPU,
but eight recipients still miss the 10 Hz publication clock and every measured
population still fails the structural JSON traffic target once healthy cadence
is considered.

The authority now validates, canonicalizes, freezes, hashes, and indexes each
recipient lane once per source projection. An opaque `WeakMap`-branded token
binds that value to schema, manifest, match, session, authority incarnation,
recipient, recipient incarnation, lane, state-pair cursor, snapshot cursor, and
tick. ACK history retains the exact prepared value that produced the wire
frame. Delta and keyframe choice can consume only those internally branded
current/base values; wire values and caller-shaped lookalikes are never trusted.

## Exact equivalence and isolation

`node tests/prepared-replication-projections.cjs` compares optimization off and
on through initial keyframe, ACK, mixed frames, a no-op entity beat, despawn,
reincarnation, ACK loss, retransmit, explicit rebase, retention pressure,
disconnect cleanup, and reconnect. Twelve encoded frames, canonical frame
objects, lane hashes, ACK outcomes, and client-materialized pairs were exact:

`sha256:8ef78dc4b375c65d01cd584cf10d1ee4fcae355b2a88c8ec1a39b2d082eff176`

The same suite rejects forged tokens; changed schema, manifest, match, session,
recipient, incarnation, lane, cursor, and tick contexts; negative zero;
prototype pollution; source mutation; and substitution of a same-cursor input
object. Public and owner preparations remain recipient-bound. Pending prepared
references use the existing two-lane pending-pair cap, ACKed references use the
existing two-lane recipient cap, and both fall to zero after disconnect.

The legacy state-pair-v1 and mixed capability paths use the same publisher and
remain covered by `AuthorityDeltaPublisher`, `ClientDeltaReceiver`, and the full
multiplayer-network lane. Dirty hints remain diagnostic only.

## Alternating A/B method

Three alternating legacy/prepared pairs measured 1 and 8 recipients. One
additional prepared/legacy pair measured 4 recipients. Every run used the same
clean commit, machine, seed, map, capability set, 5-second warm-up, and
15-second measured window. S5's perturbing per-stage profiler was disabled.
Projection timing came from the existing outer runtime projection-and-publish
wall timer. A guarded 20 ms event-loop-delay monitor supplied lag only; it did
not add nested operation timers. Replication accounting supplied exact accepted
bytes, and one-second process samples supplied RSS/heap observations.

All seven population pairs passed client hash agreement, owner privacy, atomic
observation, ACK convergence, and accounting conservation. `analysis.json`
contains every repeat and the extraction logic is
`tests/network/prepared-projection-analysis.cjs`.

| Recipients | Repeats | Projection mean legacy -> prepared | p95 legacy -> prepared | p99 legacy -> prepared | Observed publication legacy -> prepared |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 28.86 -> 16.47 ms (-42.9%) | 31.82 -> 19.35 ms (-39.2%) | 33.09 -> 20.57 ms (-37.8%) | 9.73 -> 9.73 Hz |
| 4 | 1 | 116.95 -> 60.19 ms (-48.5%) | 123.51 -> 66.97 ms (-45.8%) | 124.94 -> 74.59 ms (-40.3%) | 4.93 -> 9.73 Hz |
| 8 | 3 | 260.54 -> 132.42 ms (-49.2%) | 279.28 -> 141.85 ms (-49.1%) | 281.91 -> 145.77 ms (-48.1%) | 2.88 -> 4.56 Hz |

| Recipients | Sim tick p95 legacy -> prepared | Event-loop p95 legacy -> prepared | Mean downlink legacy -> prepared | RSS p95 legacy -> prepared | Heap p95 legacy -> prepared |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.64 -> 1.17 ms | 45.35 -> 32.74 ms | 149.1 -> 150.3 KB/s | 126.3 -> 127.1 MB | 37.9 -> 35.4 MB |
| 4 | 0.76 -> 0.76 ms | 140.77 -> 79.63 ms | 91.5 -> 215.3 KB/s | 130.2 -> 132.0 MB | 31.4 -> 30.2 MB |
| 8 | 1.03 -> 1.00 ms | 288.80 -> 156.85 ms | 63.1 -> 98.2 KB/s | 133.7 -> 131.0 MB | 31.4 -> 30.7 MB |

The 4- and 8-recipient byte rates are not wire-semantic regressions. Prepared
and legacy bytes are exact under the deterministic equivalence fixture. The
live rates rise because the faster authority publishes substantially more
beats. This exposes the underlying traffic failure that overload previously
masked. Short-run memory differences are observational noise; no heap slope or
long-run leak claim is made.

## Operation counts and cache bounds

At one recipient, where both sides held the same 9.73 Hz cadence, canonicalize
calls fell from 2,348 to 392 (-83.3%) and hash calls from 1,564 to 392 (-74.9%).
All 390 delta candidates used verified prepared bases/current values. Diff
candidate calls themselves remain one per active lane: S6 removes their
internal re-normalization and re-hashing rather than skipping correctness work.

At 4 and 8 recipients the optimized run performs many more publications, so
raw diff counts rise with recovered cadence. Even then, canonicalize/hash calls
fell 67.6%/51.2% at 4 recipients and 73.8%/60.6% at 8 recipients. Every prepared
diff count equals the total diff count. Across all runs, pending and ACKed token
references stayed within the existing caps; cleanup artifacts confirm zero
connections and dead authority processes after each scenario.

## Artifact binding

`analysis.json` SHA-256 is
`32f97d424f929b37a6da624a578fd379261ad030d3965db34d5cd0452219b1c6`.
It validates and binds these product-gate composite checksums:

| Artifact | Composite SHA-256 |
| --- | --- |
| `r1-legacy` | `7de8808915476614b0fd01cfb0590a91e1823d1d4cfb72d2c23e297fc25d0940` |
| `r1-prepared` | `97039cea6106aacc9c6c62e8af09ab0e37f3c8a414cf1f48fa6ebd18aa9468d9` |
| `r2-legacy` | `44e641551096953301812f93811f6bdb914bd02e204df1612f9d5aa2be3ba05b` |
| `r2-prepared` | `bc3ff05609b126cb6ca911110a92aa24a4b89bad6736b95f47fc2d3f3e22454d` |
| `r3-legacy` | `358760545b6d6ea2fb0f2a7885e3489766d3c96c8321facc5c4a03e420ebc311` |
| `r3-prepared` | `d8e14d6f0d27e684829d038c8fdd3115cd3b950c53e127264d563e4f1044fce3` |
| `r4-legacy` | `97284b9f771a649cb84833128ff80b57d0a85a57dbffb1440bb8ab32211072ad` |
| `r4-prepared` | `2494abf7fd633ebab959e3ee0e422bdd05a8d22ef23a4754d677da90396457e9` |

Reproduce a diagnostic artifact with:

```sh
LBH_S6_POPULATIONS=1,8 LBH_S6_PREPARED=0 \
  node tests/multiplayer-state-pair-product-gate.cjs --s6-benchmark
LBH_S6_POPULATIONS=1,8 LBH_S6_PREPARED=1 \
  node tests/multiplayer-state-pair-product-gate.cjs --s6-benchmark
```

## Decision and limitations

Accept `a243194` plus `21ecef2` as the bounded S6 optimization and its
fail-closed validation follow-up. The follow-up rejects negative-zero integer
lineage and preserves structured malformed-input errors in both A/B modes; it
does not alter the valid benchmark workload. Do not claim S6 product
admission. One and four recipients now meet the existing publication clock,
but one/four traffic remains far above target. Eight recipients improve from
2.88 to 4.56 Hz and remain overloaded, while full-cadence structural JSON would
also exceed the traffic budget.

The next gate should first re-profile the uninstrumented post-S6 path with a
minimal attribution pass, then select one bounded residual CPU slice only if it
can plausibly recover eight-player cadence. The already-proven public-core
reuse ceiling is only 6--8% and is insufficient alone. Traffic needs its own
evidence-led structural payload decision; binary transport, compression, AOI,
hosted WSS, and network target-policy changes remain out of scope.

This is short, single-machine macOS loopback evidence for one match. It is not
a WAN, hosted, fleet-capacity, long-run memory, or product-admission result.
