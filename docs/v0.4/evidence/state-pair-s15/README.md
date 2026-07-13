# S15 exact canonical lane reuse

S15 carries the canonical lane text and exact UTF-8 byte count already produced
by delta/keyframe comparison into the same synchronous four-way selection. A
private proof symbol plus exact payload identity prevents cross-tick,
cross-recipient, or structurally-similar substitution. Header equality,
canonical validation, expanded limits, positional choice, wire bytes, digest,
ACK, recovery, and fallback behavior are unchanged.

The order-counterbalanced selector benchmark preserves 1,000 representative
winner/wire/expanded-size/semantic comparisons plus S14's 320 adversarial UTF-8,
escaping, control, invalid-canonical, and boundary comparisons through S15's
same-operation proof-reuse oracle. Both representative transcripts are
identical, while a separate adversarial transcript binds all 320 expanded and
positional comparisons.
Across 1,100 measured selections per run, expanded lane serializations fall
from 4,400 to zero, 25,080,200 already-proven lane bytes are reused, and the
allocation proxy falls from 38,916,699 to 13,836,499 bytes. Mean publish time
improves 9.15% and selector p50 improves 15.99% across the two execution orders.
Every selector row binds its baseline/candidate commit, tree, tracked-clean
state, source hashes, declared order, and benchmark-script commit/hash.

## One-authority-per-match result

The immutable baseline is S14 candidate composite
`c5259ec1cbeb3de2d0683031af7c2e7ae2f54c26d34f647906d880158d38ecdd`.
The S15 candidate composite is
`c2df9114ce2cfd7ab29ff613b214498b214cebd7df71d1e0c74750b974f6e266`.
Each population uses one separate logical authority for one match, one process
per receiver, fixed seed, five-second warmup, and a complete 20-second window.

| Players | S14 -> S15 receiver Hz | S14 -> S15 projection p50/p95/p99 ms | S14 -> S15 authority CPU/core | S15 actual mean/p95 B/s | S15 normalized 10 Hz mean/p95 B/s | Verdict |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 9.85 -> 9.85 | 24.21/26.17/28.93 -> 23.74/26.26/26.68 | 27.50% -> 27.18% | 59,486 / 61,311 | 60,385 / 62,235 | pass |
| 4 | 5.25 -> 5.35 | 104.86/111.00/136.55 -> 100.56/103.43/103.77 | 60.03% -> 59.24% | 36,080 / 40,183 | 67,019 / 74,700 | fail |
| 8 | 3.05 -> 3.25 | 236.89/241.71/243.79 -> 220.53/224.80/227.02 | 78.35% -> 78.19% | 25,506 / 32,115 | 77,482 / 97,032 | fail |

All candidates converge with exact schedules, zero client errors, zero queue
or backpressure transitions, and clean teardown. Four and eight remain
`DILATED`, below 9 Hz, over the authority clock, and above the normalized
64 KiB/s mean guard. Their low actual traffic receives no bandwidth credit.
Canonical reuse is kept as a real but insufficient authority improvement.

The next bounded lane is a binary state-pair codec prototype against the exact
positional JSON oracle, with JSON fallback and unchanged authority, cadence,
ACK, recovery, privacy, and admission policy. Hosted costs and 24/48/96 remain
closed.

The top-level artifact composite is
`c84759a5de422ff5cddba4fb71095d133120cbcd034f5c8fe5c85c2907c356fe`.

## Validation

```sh
node tests/multiplayer-state-pair-canonical-reuse-evidence.cjs
node tests/multiplayer-state-pair-clock-attribution.cjs --validate-artifact \
  docs/v0.4/evidence/state-pair-s15/candidate-process
node tests/run-all.cjs --lane=multiplayer-network --no-retries
```
