# S4 mixed state-pair product gate evidence

This directory preserves the canonical post-optimization S4 product-gate run
and the independent short review run. The canonical run used the same
five-minute normal and deterministic churn profiles as S3 at populations 1,
4, and 8, while negotiating `state-pair-mixed-v1` for independent
public-delta and owner-keyframe lanes.

Canonical artifact:

- `multiplayer-state-pair-s4-2026-07-13T074927227Z-a052787`
- clean commit at run start: `a052787`
- aggregate composite SHA-256:
  `50f7e0f59bd6368ee7f8b1e84e30129eb948e422ee0d619bfea186a9386b3a92`
- artifact validation: pass
- product verdict: fail

Independent review artifact:

- `multiplayer-state-pair-s4-2026-07-13T081606972Z-bbce795`
- clean commit at run start: `bbce795`
- aggregate composite SHA-256:
  `5e32e4c208a0ab52a60c3aa2b93953d3faf00a7109cdc1a8363a41e585ba9954`
- artifact validation: pass
- product verdict: fail

Nothing in either preserved artifact should be edited in place.

## Decision

S4 is a real optimization proof but does not pass the product gate. Mixed
atomic lanes eliminated the full-keyframe alignment pathology and preserved
correctness. Normal traffic and authority results were:

| Population | Mean B/s | 1 s p95 | 1 s p99 | Pairs/s/recipient | Projection p95 | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 133,665.707 | 158,208 | 165,814 | 9.7600 | 44.124 ms | traffic fail |
| 4 | 73,664.483 | 89,049 | 100,446 | 4.3192 | 170.111 ms | traffic, CPU, overload fail |
| 8 | 52,175.863 | 63,654 | 67,741 | 2.6579 | 337.519 ms | CPU and overload fail |

The 8-player mean and p95 traffic checks pass only while publication cadence
has collapsed 73.4% from the declared 10 Hz and projection p95 consumes 3.38
times the 100 ms snapshot interval. It is not healthy scaling and is not a
product pass.

Against immutable canonical S3 evidence
`55ff1666b4c8efdabb58bdc77a024a0df33edee2b5681558f62ac8e9fad7cf90`,
S4 reduced normal mean traffic by 70.30%, 52.62%, and 41.11% at 1, 4, and 8
players. It reduced 1-second p95 by 68.51%, 53.99%, and 42.03%, and pair p50
by 71.97%, 63.14%, and 59.68%. Correctness remained true.

## Correctness and churn

All six canonical scenarios negotiated the mixed capability, matched client
hashes, preserved owner routing and atomic observation, converged ACK bases,
completed accounting/fault/lifecycle checks, and cleaned up ports, processes,
connections, pending pairs, and retained bytes. ACK rejects and retransmits
were zero. Normal product pairs were 2,925 / 5,183 / 6,379 mixed pairs at
1 / 4 / 8 players, with only three full keyframes in the 1-player product
window. No `atomic-kind-alignment` cause occurred. Remaining keyframes were
attributed to initial or missing bases and explicit recovery.

Churn correctness passed at every population. Churn 1-player passed the whole
admission gate; 4-player and 8-player failed only the authority CPU/overload
checks. The deterministic pause, drop, ACK disruption, reconnect, leave, and
mutation schedule converged at all populations.

## Remaining byte contributors

Exact accepted downstream classification puts mixed state pairs at 99.29% of
bytes at 1 player and 99.30% at 4 players (99.00% at 8 players). Applying the
scenario-lifetime candidate payload averages to exact product-window cadence
gives this decision-order estimate:

| Population | Public delta | Owner keyframe | Pair envelope residual | Authority ACK + control | Rare full pair | Reduction still needed |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | ~106,428 B/s | ~23,373 B/s | ~2,912 B/s | ~498 B/s | ~454 B/s | 68,130 B/s |
| 4 | ~59,310 B/s | ~9,382 B/s | ~1,974 B/s | ~497 B/s | 0 | 8,128 B/s |

Public delta is the dominant residual, owner keyframe is second, and envelope
plus control traffic is distant. The lane payload averages include warmup,
while accepted frame totals and cadence are exact product-window observations.
The artifact does not expose per-lane p95 or per-recipient frame-class splits;
at 4 players, the aggregate class estimate is below the worst-recipient mean,
so it must not be presented as an exact decomposition of that verdict.

## Authority cost finding

The adapter builds the raw public match snapshot once per publication beat,
then performs recipient-specific manifest projection, owner construction, and
state-pair publication for every recipient. State-pair publication recollects,
normalizes, hashes, diffs, and canonical-serializes the public source against
each recipient's ACK base. The immutable public-source projection is therefore
recomputed per recipient even though lineage and ACK-base delta selection must
remain recipient-specific.

Current telemetry wraps the whole `projectNow()` path. It cannot separately
attribute raw public build, public projection/hash, structural diff, canonical
serialization/validation, queueing, or `ws.send`; callback settlement occurs
outside the awaited timer. The next narrow measurement slice should add those
stage timers before deciding what public projection work to share once per
match tick. Then rerun this same gate without weakening atomicity, privacy, or
ACK-base ownership.

## Review and verification

An independent read-only review returned **method pass / product fail** and
reproduced the 1-player traffic failure plus the 8-player traffic-only pass
under CPU overload. After preserving both artifacts,
`npm run test:multiplayer-network` passed all 22 selected suites.

Method limitations to carry forward:

- `--review` intentionally omits 4 players; the canonical run is authoritative.
- Process exit success follows artifact validation, not product admission; CI
  consumers must inspect `aggregate.verdict`.
- The churn `unexpectedAckRejects` boolean is permissive even though actual
  canonical and review reject counters were zero.
- Privacy proof covers recipient/match/entity routing and receiver lineage/hash,
  not exhaustive field-level noninterference.
- Canonical RSS/heap slopes remained positive at 18,303/46,448, 78,889/68,525,
  and 164,113/137,619 B/s for 1/4/8 players; no leak threshold or attribution
  exists, so these are diagnostics rather than leak verdicts.
