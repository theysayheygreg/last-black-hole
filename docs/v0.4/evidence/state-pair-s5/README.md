# S5 Authority Replication Stage Profile

This evidence freezes the S5 diagnostic profile of the mixed public/owner
state-pair authority path at 1, 4, and 8 simultaneous recipients. The method
and artifact checks pass; the existing S4 product admission gate still fails.
S5 is attribution evidence, not a new admission result and not an optimization.

All captured runs use commit
`eec36ee52235b4f5ef7a4467458a9ce570beff6d` on
`codex/v0.4-multiplayer-architecture`. The canonical instrumented artifact is
`multiplayer-state-pair-s5-2026-07-13T090358402Z-eec36ee`, with composite
SHA-256
`f5564bedf94c1459c041cd45861714ec77565ede85c0bc47863573f2334a566a`.
`analysis.json` binds that artifact and all paired control artifacts by their
recorded composite checksums.

## Canonical 1/4/8 result

Each population ran for a 10-second warm-up and a 30-second measured window on
one local macOS loopback authority. Correctness passed and exact ACK rejects
were zero at every population.

| Recipients | Publication | Projection mean / p95 | Sim tick p95 | Mean / 1 s p95 downlink | Event-loop p95 / p99 | Overload normal |
| ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 1 | 9.70 Hz | 38.08 / 41.44 ms | 0.550 ms | 145,960 / 155,638 B/s | 55.51 / 57.97 ms | yes |
| 4 | 4.03 Hz | 162.00 / 171.05 ms | 0.796 ms | 71,877 / 83,328 B/s | 187.43 / 192.15 ms | no |
| 8 | 2.17 Hz | 375.28 / 388.29 ms | 1.201 ms | 47,341 / 61,231 B/s | 403.18 / 407.63 ms | no |

The declining bytes per second at 4 and 8 recipients are a consequence of
publication-cadence collapse, not a networking improvement. The underlying S4
product verdict remains FAIL: 1 recipient exceeds the traffic limits, while 4
and 8 recipients miss the existing authority-clock/overload requirements.

## Ranked operation evidence

The largest synchronous or awaited operations in the instrumented path are
shown below. Percentages are each operation's observed total divided by the
end-to-end projection wall total. They are useful for ranking, but they are
**not additive CPU percentages**: the opaque delta operation performs internal
normalization, canonicalization, and hashing; candidate/full-frame phases may
repeat; metric sizing and shareability hashes are outside these timers. The
socket-send callback is overlapping asynchronous settlement latency and is
explicitly excluded from CPU attribution.

| Recipients | Public delta | Public canonical hash | JSON serialization | Public-core construction | Recipient public shell |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7.40 ms/call, 19.42% | 2.50 ms/call, 13.12% | 0.47 ms/call, 9.88% | 3.06 ms/call, 8.03% | 1.82 ms/call, 4.79% |
| 4 | 8.41 ms/call, 20.76% | 2.80 ms/call, 13.85% | 0.48 ms/call, 9.45% | 3.47 ms/call, 8.56% | 2.03 ms/call, 5.00% |
| 8 | 9.88 ms/call, 21.05% | 3.29 ms/call, 14.04% | 0.55 ms/call, 9.31% | 4.17 ms/call, 8.89% | 2.37 ms/call, 5.04% |

`analysis.json` contains all stage totals, means, p50/p95/p99/max samples,
serialized byte proxies, entity/component counts, and the exact timing
contract. `serializedAllocationProxyBytes` is serialized output size, not a
measured heap-allocation count.

## Profiler overhead

Three paired control/instrumented repeats alternated execution order. Each
repeat used the same clean commit and exercised 1 and 8 recipients for a
5-second warm-up plus a 15-second measured window.

| Recipients | Publication change | Projection mean change | Projection p95 change | Sim tick p95 change |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.00% to +0.69% (mean +0.23%) | +21.06% to +34.60% (mean +25.93%) | +21.66% to +34.21% (mean +25.93%) | -9.86% to +2.34% (mean -2.28%) |
| 8 | -25.88% to -24.27% (mean -24.86%) | +41.86% to +46.30% (mean +43.41%) | +38.74% to +69.78% (mean +50.12%) | +6.82% to +23.80% (mean +17.18%) |

The profiler materially perturbs the saturated path. Absolute stage timings
must therefore be treated as diagnostic ranking evidence, not as the product
benchmark. The paired controls place the uninstrumented 8-recipient projection
mean near 263--266 ms; the instrumented paired runs are near 374--389 ms. At 1
recipient, paired controls are near 29--32 ms and instrumented runs near 39 ms.
All six paired runs passed correctness and recorded exact zero ACK rejects.

The paired composite hashes are:

| Pair order | Control SHA-256 | Instrumented SHA-256 |
| --- | --- | --- |
| control then instrumented | `38cf45b44e0ae4363d9e1a5b06c9e146233a54b42b294eb5a5e359dc13e4ff47` | `fc9c63a8f76ba738667e854425d66524d190e912ddad75b5a038ab332296ad37` |
| instrumented then control | `38c3d3076f449f3b564ff54c5ffb1b6d0cf564a0a0a8931013fc25346cef87c4` | `a899c6dac293f6486d0cd1935e64b44b764148313d8258561c726c33a8891e5c` |
| control then instrumented | `a58c283a1819a9f7f34e436e900dedf8d81aa5776faebaf07e34546f7b1a9a6d` | `13854eaed70ae820636c20353e2ec78a8ed5e55bfdca03ed00d6d4557da9b786` |

## Shareability boundary

Within each match authority beat, every observed recipient public core was
byte-identical: 121 beats produced all expected 363 comparisons at 4
recipients, and 65 beats produced all expected 455 comparisons at 8
recipients, with zero mismatches. Coverage is complete for the captured beats.

Only that public core is safely shareable. The whole canonical public view is
not reusable because `connectionEpoch` and `statePairId` are recipient-specific.
ACK bases, public deltas, owner projection/hash/delta, pair choice and envelope,
adapter queueing, and socket sending must also remain per recipient.

The measured theoretical upper bound for sharing only public-core construction
was 10.41 ms per 4-recipient beat (6.42% of end-to-end projection wall) and
29.18 ms per 8-recipient beat (7.78%). That is real but insufficient on its own
to restore the publication clock.

The next bounded optimization experiment should target the dominant
per-recipient public-delta candidate and repeated public canonical
hash/canonical work, while preserving recipient lineage and ACK bases. Public
core sharing can be included only as the proven narrow reuse boundary; it
should not be presented as the primary answer. No optimization is implemented
in this slice.

## Correctness and guardrails

The default runtime remains uninstrumented. Stage profiling requires the exact
test-only combination `LBH_SIM_WS_STAGE_PROFILE=1`, `NODE_ENV=test`,
`LBH_REPLICATION_BASELINE_CAPTURE=1`, and
`LBH_SIM_WS_REPLICATION_ACCOUNTING=1`. Samples and recipient slots are bounded,
and reset generation-fences outstanding async callbacks.

The focused equivalence test compares profile-off and profile-on publisher
hashes and encoded adapter wire bytes through an initial keyframe, ACK, changed
beats, and mixed public-delta/owner-keyframe output. It also verifies bounded
readback, privacy, guard behavior, and exact reset.

## Reproduction and validation

```sh
node tests/multiplayer-state-pair-product-gate.cjs --s5-profile
node tests/multiplayer-state-pair-product-gate.cjs --s5-profile --micro --profile-control
node tests/multiplayer-state-pair-product-gate.cjs --s5-profile --micro
node tests/multiplayer-state-pair-product-gate.cjs --validate-artifact \
  docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090358402Z-eec36ee
node tests/network/state-pair-stage-profile-analysis.cjs \
  --canonical docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090358402Z-eec36ee \
  --pair docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090628304Z-eec36ee::docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090712370Z-eec36ee \
  --pair docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090842638Z-eec36ee::docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090757487Z-eec36ee \
  --pair docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T090926952Z-eec36ee::docs/v0.4/evidence/state-pair-s5/multiplayer-state-pair-s5-2026-07-13T091011107Z-eec36ee \
  --output docs/v0.4/evidence/state-pair-s5/analysis.regenerated.json
```

`--validate-artifact` checks artifact structure and checksums independently of
the product result. `--admission-artifact` is expected to exit nonzero for the
canonical artifact because its product verdict is FAIL.

## Claim boundary

This is a short, single-machine macOS loopback observation of one authoritative
match with simultaneous recipients. It is not WAN/WSS, hosted, fleet-capacity,
concurrent-match, AOI, compression, or binary-protocol evidence. It does not
measure heap allocation. The high profiler overhead further limits absolute
timing claims. These artifacts support only the ranked operation attribution,
the narrow within-beat public-core identity result, correctness invariance, and
the next bounded experiment above.
