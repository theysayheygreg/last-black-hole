# S18 trusted authority state-pair proof

S18 keeps S15 positional JSON and S17 one-frame materialization, but removes
the repeated full semantic/hash validation and separate expanded-size pass for
lane payloads constructed inside the same authority publication operation.

The trust boundary is narrow. `authority-delta-publisher.cjs` normalizes the
public and owner projections, constructs the canonical keyframe/delta payloads,
and records each payload origin in a module-private `WeakMap`. It validates the
exact header, schema, lane, match, authority/connection/ballpark epoch,
manifest, state-pair/snapshot/base lineage, cursors, result hash provenance,
canonical text/bytes, immutability, and four-candidate tie order before issuing
one opaque proof. Issuer, consumer, token, ticket, and private `WeakMap` all
live inside that publisher instance's closure; the wire module receives only
the already validated immutable inputs and negotiated positional context. The
token is deleted before downstream size/positional work. No import order,
binder, public validator, or extra selector argument can capture or inject the
capability. General wire APIs and opt-in S16 binary retain full fail-closed
validation.

## Exactness and attribution

- The focused proof covers 160 exact wire/selection/semantic comparisons, 640
  expanded comparisons, exact max/max-minus-one fallback parity, hostile
  schemas/lineage/numbers, mutation attempts, clean-process import order,
  malicious binder absence, double consumption, cross-operation inputs, and
  downstream reject accounting with zero mismatch.
- The counterbalanced 2 x 800 benchmark has identical wire and selection
  transcripts. Mean publish improves 45.0%/39.8%; selection p95 improves
  91.3%/87.6%. The existing allocation proxy is unchanged because S18 removes
  validation CPU rather than serialized output.
- Every measured authority operation reports equal proof creates/consumes,
  zero rejects, four exact canonical and positional sizes, and one chosen frame.

## One-authority-per-match result

Candidate process composite:
`82a1e0eadea4ee6d6dee36f86b1d937fbd31f3a16e95eb9f24cfa3bb68d69b37`.
Top-level evidence composite:
`d06f94dd10d2409b0d2072f44dfe7dac990075ecaad56da56cc54e4cfb9d7df1`.

| Players | S17 -> S18 receiver Hz | S17 -> S18 projection p50/p95/p99 ms | S17 -> S18 authority CPU/core | S18 normalized 10 Hz mean/p95 B/s | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 9.80 -> 9.70 | 18.43/21.14/22.34 -> 13.49/15.13/15.87 | 22.32% -> 16.71% | 59,576 / 62,434 | pass |
| 4 | 5.60 -> 9.85 | 89.85/124.80/131.62 -> 51.65/53.96/54.89 | 57.13% -> 58.55% | 75,770 / 77,572 | fail: normalized mean |
| 8 | 3.80 -> 5.00 | 171.32/199.18/214.74 -> 113.62/117.97/119.93 | 72.87% -> 64.40% | 79,004 / 81,046 | fail: cadence/clock/overload/mean |

All populations retain exact schedules, client convergence, zero recovery/base
misses, zero queue/backpressure transitions, bounded ledgers, and clean
teardown. Four recovers a normal 9.85 Hz authority clock but is not product
admitted because normalized mean downlink remains above 64 KiB/s. Eight remains
`DILATED`; its low actual traffic receives no credit.

The next bounded lane shares immutable public projection/core/delta work once
per match tick across recipients while preserving recipient-specific owner
overlays, connection lineage, ACK bases, and one canonical writer. Compression,
cadence policy, hosted economics, heavy-sim work, and 24/48/96 remain closed.

## Final validation

The registered 37-suite `multiplayer-network` lane ran exactly once with
retries disabled. Thirty-six suites passed, including both S18 suites. The sole
failure was historical S17 evidence comparing its sealed manifest with current
S18 source. That validator now reads the sealed `e57bf53` Git tree and passes
focused validation; the full lane was not rerun.
