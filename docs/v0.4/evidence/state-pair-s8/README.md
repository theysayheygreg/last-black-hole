# S8 Sparse Runtime-Public Prototype

S8 rejects `runtime-public-components-v1` for product admission at clean commit
`1065d1de443b6124cc0425189e8abec3d4e3713f`. The artifact method passes and
the capability remains ticket-bound, explicit, and default-off. Exact client
reconstruction, privacy, cleanup, ACK accounting, and the focused recovery
contracts pass, but the split alone does not approach the S7 10 Hz payload
envelope. Loaded four-player recovery and eight-player clock/overload results
also reject the prototype.

## Prototype contract

The public entity source inventory is fail-closed and divided into
`runtimeMotion`, `runtimeGameplay`, `runtimeIdentity`, and
`runtimePresentation`. Motion keeps the configured 10 Hz target. The other
groups use on-change revisions; this prototype adds no lower-cadence timer, so
its configured publication lag is zero beats. The runtime gate records actual
receiver cadence separately and does not treat that configured target as
observed timing.

The receiver reconstructs the full legacy public-state shape before publishing
an atomic pair: root/session facts, players, every world array, and inhibitor.
Focused tests compare that reconstruction directly with the pre-split source
on every beat and cover orbit, figure-eight, transit, despawn/reincarnation,
recovery, admission churn, recipient scheduling skew, and an undelivered
change-return sequence. Split recipient histories are bounded by admissions
and removed on disconnect.

ACK rejection diagnostics are also explicit and default-off. They persist only
bounded reason/relation histograms and global arrival-order transitions—never
recipient identity, frame payload, or owner-private values. All five clean S8
scenarios record exactly zero publisher ACK rejects.

## Clean result

The review profile uses a five-second warmup, 20-second normal windows, and
30-second deterministic churn windows. Application traffic is exact compact
JSON accepted by WebSocket send callbacks. Receiver-accepted cadence is a
separate admission signal.

| Recipients | Actual mean | 10 Hz mean | Receiver cadence | Sampled mean pair | Projection p95 | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 117,222 B/s | 120,215 B/s | 9.70 Hz | 11,973 B | 18.90 ms | fail: actual and normalized byte guards |
| 4 | 195,046 B/s | 201,063 B/s | 2.85 Hz worst | 13,831 B | 71.19 ms | fail: bytes, 272 unexpected recoveries, receiver cadence, correctness |
| 8 | 74,818 B/s | 160,344 B/s | 4.60 Hz worst | 15,949 B | 137.12 ms | fail: bytes, receiver cadence, clock, overload |

The lower eight-player actual rate is not a win: the runtime downshifted to a
6 Hz publication target and receivers accepted only about 4.6 pairs/s. The
normalized 10 Hz load remains 160,344 B/s.

Normal four-player load exposes the strongest correctness result. The adapter
accepted about 9.7 pairs/s, but two receivers accepted only 2.95 and 2.85
pairs/s. The measured window contains 272 recovery requests: 38
`base-mismatch` and 234 `missing-base`. Publisher attribution records 52
client-recovery rebases and 52 missing-ACK-base keyframes. S8 now fails normal
correctness on any spontaneous recovery instead of treating socket-send
acceptance as receiver health.

One-player churn passes the bounded correctness, clock, and `NORMAL` checks.
Eight-player churn preserves the injected-fault correctness contracts but
fails clock and overload. Every cleanup artifact records zero connections and
a dead authority process.

## S7 to S8 reduction

The apples-to-apples privacy-safe samples show a real but insufficient
reduction:

| Recipients | S7 mean pair | S8 mean pair | S8 reduction | Additional reduction to ~6,504 B |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 15,222 B | 11,973 B | 21.3% | 5,469 B (45.7%) |
| 4 | 16,215 B | 13,831 B | 14.7% | 7,327 B (53.0%) |
| 8 | 18,999 B | 15,949 B | 16.1% | 9,445 B (59.2%) |

At one recipient, motion component updates still consume 3,073 B per sampled
pair, repeated entity envelopes 2,888 B, presentation 1,474 B, and gameplay
881 B. At four recipients those values are 3,914 / 3,300 / 1,474 / 1,131 B;
at eight, 5,181 / 3,971 / 1,469 / 1,115 B. Splitting revisions removes some
unchanged payload but leaves repeated JSON entity/component structure as a
first-order cost.

## Decision

Do not admit or default-enable `runtime-public-components-v1`. Preserve it as
a bounded negative prototype and keep the legacy rollback path available.

The next bounded decision is a schema-bound positional JSON codec for public
entity operations: replace repeated category/source/component/key envelopes
with versioned manifest indices and fixed tuple layouts while retaining JSON,
the same ticket capability boundary, exact reconstruction, privacy scanning,
and recovery tests. This directly tests the measured entity-envelope and key
cost without yet taking on binary framing or compression. Rerun the identical
1/4/8 gate before deciding whether compact binary is justified.

Do not change the 10 Hz product contract, add AOI, or claim WAN/WSS/hosted/fleet
readiness from S8. Presentation cadence is a second choice only if the compact
envelope result misses narrowly and can specify a measured non-zero field-age
contract.

## Evidence and reproduction

`final/` is the complete clean artifact. Its composite aggregate SHA-256 is:

`c13db936bebd443ca5befa7906c5226a282d153f3969555f1659a5c47dc86707`

Method validation exits `0`; product admission exits `2`. The final
`multiplayer-network` regression passes all 26 selected suites. The independent
review is in `RED-TEAM.md`.

`interrupted-313804a/` preserves the earlier clean-head diagnostic that was
stopped after normal 1/4 when red-team blockers and the recovery storm became
visible. It is intentionally incomplete, has no aggregate/checksum, and is not
valid admission evidence.

Reproduce the review artifact from a clean head with:

```sh
npm run test:multiplayer-state-pair-s8-prototype
```

This is local macOS loopback evidence for one match authority. It excludes
WebSocket framing, TLS, TCP/IP, WAN, hosted ingress/egress, compression, AOI,
binary encoding, fleet packing, and 24--96-client claims.
