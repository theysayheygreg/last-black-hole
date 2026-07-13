# S9 schema-bound positional JSON pre-gate

Status: **rejected for admission**. The manifest-bound positional codec is a
useful size result, but it does not satisfy the 4/8-player correctness,
cadence, and authority-clock gates. It remains default-off. Binary transport,
compression, AOI, hosted WSS, WAN, and fleet claims remain out of scope.

## Immutable artifact

- Implementation commit: `56ae049` (`L0: prototype manifest-bound positional state pairs`)
- Branch: `codex/v0.4-multiplayer-architecture`
- Clean local command: `LBH_S9_OUTPUT_DIR=/tmp/lbh-s9-final-56ae049 node tests/multiplayer-state-pair-product-gate.cjs --s9-positional --review`
- Artifact: [`pre-gate/`](pre-gate/)
- Aggregate SHA-256: `34a0de4e4a611bfe5ce298f0a4fc0d6a4d3011c7e08173dbcba35c14dee40d1b`
- Artifact validation: pass, including exact checksums, cleanup, manifest binding,
  accounting completeness, and recorded product-correctness outcome
- Product admission: rejected; the admission command exits `2`
- Full regression: `node tests/run-all.cjs --lane=multiplayer-network --renderer=three --no-retries`
  passed all 27 selected suites

The review profile uses 5 seconds of warmup, 20-second normal windows at
1/4/8 simultaneous recipients, and 30-second churn windows at 1/8 recipients.

## Codec contract

`state-pair-positional-json-v1` is negotiated only with the complete static
manifest + state-pair + mixed-pair + runtime-component dependency chain. The
content-addressed session manifest carries the exact immutable codec manifest,
including array layouts, category/component/field dictionaries, tags, and
bounds. Changing a dictionary changes the codec-manifest hash.

The transaction remains canonical compact JSON text. State pairs, mixed ACKs,
and recovery requests use fixed positional arrays. No mutable or session-local
dictionary exists. The decoder rejects noncanonical JSON spellings, wrong
lengths/tags, sparse arrays, unknown fields, invalid numbers, malformed UTF-8,
wrong codec versions, and cross-context replay. Decoding reconstructs the exact
canonical object frame; semantic projection hashes and atomic public/owner ACK
bases remain unchanged.

Queue pressure, publisher retention choice, send accounting, and retransmit
accounting use encoded positional byte counts. Flush fails closed if a queued
encoded size differs from the actual re-encoded wire. Object JSON remains the
default rollback path.

## Normal-window result

The ~6,504-byte target is the S7 target derived from the 64 KiB/s envelope at
10 Hz. “Sample mean” is the representative captured mixed-pair sample. “All
accepted mean” also includes recovery keyframes.

| Players | S8 sample mean | S9 sample mean | Change vs S8 | S9 all accepted mean | All-mean excess vs 6,504 B | 10 Hz normalized worst B/s | Actual worst B/s | Min receiver Hz | Window recoveries | ACK rejects | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 11,973 B | 5,884 B | -50.9% | 5,884 B | -620 B (-9.5%) | 59,322 | 57,557 | 9.70 | 0 | 0 | pass |
| 4 | 13,831 B | 6,661 B | -51.8% | 7,563 B | +1,059 B (+16.3%) | 91,224 | 89,409 | 1.05 | 221 | 1 | fail |
| 8 | 15,949 B | 7,356 B | -53.9% | 7,458 B | +954 B (+14.7%) | 80,059 | 39,874 | 4.85 | 1 | 0 | fail |

The 4-player sample itself is only 157 bytes (2.4%) above the pair target, but
the recovery loop adds 51 keyframes and raises the accepted mean to 7,563
bytes. The 8-player sample remains 852 bytes (13.1%) above target before any
recovery inflation. Its deceptively low actual B/s is caused by cadence
collapse, not admission-worthy efficiency.

Normal-4 records 221 recovery requests inside the measured window (30
`base-mismatch`, 191 `missing-base`) and 287 serialized requests across the
scenario lifetime. One recovery-race ACK was rejected as `unknown-frame`; this
is an explicit gate failure, not normalized away. Normal-8 records one
`base-mismatch`. Churn correctness converges at 1/8, but churn-8 still fails the
authority clock and overload gates.

## Why multi-client admission still fails

The queue is not dropping or coalescing accepted state-pair traffic in these
normal windows: offered and accepted positional counts/bytes are identical,
and observed queued bytes stay at 0/0/163 B for 1/4/8 players.

The decisive fault is the existing single-base receiver protocol. The
authority chooses a delta from the latest ACKed base. Under load, an ACK can
arrive one publication beat late while the client has already materialized a
newer base. The next delta then references the older ACKed snapshot. Because
the receiver retains only its latest base, it rejects `base-mismatch`, clears
both lanes, and rejects every later delta as `missing-base` until a recovery
keyframe wins the race. Repeated recovery requests add uplink and keyframe
work, creating positive feedback.

This behavior predates S9: the clean S8 4-player artifact recorded 272 window
recoveries and 2.85 Hz minimum receiver cadence; this S9 run records the same
failure class. Zero ACK rejects in most scenarios only proves each processed
ACK is individually valid; it does not prove base convergence.

## CPU and bounded-state observations

| Players | Publisher candidate encode mean | Adapter positional encode mean | Client wire-decode p95 | Client decode/apply p95 | Projection/publish p95 | Event-loop lag p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.150 ms | 0.538 ms | 0.788 ms | 17.55 ms | 18.07 ms | 33.59 ms |
| 4 | 0.139 ms | 0.902 ms | 5.974 ms | 17.29 ms | 63.78 ms | 74.12 ms |
| 8 | 0.145 ms | 0.556 ms | 0.615 ms | 18.63 ms | 123.60 ms | 138.15 ms |

Publisher candidate timing is authority-lifetime scoped and includes warmup;
adapter counters reset with the measured evidence window. The separate labels
avoid presenting either counter as total codec cost. Aggregate
projection/publish timing contains all publisher and adapter work.

The static codec retains no mutable dictionaries. Publisher pending-pair and
retained-byte limits, adapter queues, accounting ledgers, manifest caches, and
receiver state all clean up in the artifact. No private owner values are
retained in the evidence sample.

## Decision and next bounded slice

Do not enable S9 and do not spend the next slice on a binary rewrite,
compression, or a larger dictionary. The codec has already isolated the more
important blocker: multi-client base convergence.

The next decision-ready prototype should be a bounded ACK/base convergence
slice: retain a small, explicitly capped client base ledger keyed by snapshot
ID + semantic hash, collapse recovery requests to one edge-triggered request,
and prove 1/4/8 normal traffic with zero base mismatches, zero recovery
requests, zero ACK rejects, and receiver cadence at or above 9 Hz. Only after
that protocol proof should the team decide whether the remaining 8-player
7.36 KB sampled pair justifies another text-codec slice or a bounded binary
experiment.
