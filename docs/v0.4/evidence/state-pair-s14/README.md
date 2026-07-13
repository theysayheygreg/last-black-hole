# S14 exact composed-size selection

S14 keeps S12's four safe public/owner keyframe/delta choices and deterministic
tie order, but does not serialize four complete positional state-pair wires.
It serializes one shared positional header and the four unique lane components,
computes each candidate's exact UTF-8 size including commas and brackets, then
composes and retains only the selected complete wire. The expanded semantic
limit is also checked by exact canonical component sizing. Authority, ACK,
recovery, privacy, cadence, and overload policy do not change.

## Exactness

- 320 adversarial candidate wires cover ASCII, NFC multibyte text, quotes,
  backslashes, control escapes, and 8,192-byte ASCII/Unicode boundaries.
- 1,000 representative 48-public-entity selector iterations compare S12's
  four complete-wire oracle with S14's component composer.
- All 320 adversarial candidate sizes and all 1,000 representative winning
  wires agree with the oracle; chosen bytes, digests, and decoded semantics
  agree and there are zero mismatches.
- The selector benchmark reduces complete candidate compositions from 4,000 to
  1,000, positional allocation proxy by 27.10%, and mean selector time from
  0.234 ms to 0.116 ms (2.01x) on this machine-local synthetic workload.

## One-authority-per-match process result

The immutable baseline is S13 round-B isolated, composite
`395df97d78fb9cbd8a6e07b13b56ba438b4d0be92d3a82514fe6a4be39870fd1`.
The S14 candidate at implementation commit `bce7e5d` has composite
`c5259ec1cbeb3de2d0683031af7c2e7ae2f54c26d34f647906d880158d38ecdd`.
Each run uses one separate logical authority process for one match, one process
per receiver, fixed seed, five seconds warmup, and a complete 20-second window.

| Players | Baseline -> S14 receiver Hz | Baseline -> S14 projection p50/p95/p99 ms | Baseline -> S14 authority CPU/core | S14 actual mean/p95 B/s | S14 normalized 10 Hz mean/p95 B/s | Verdict |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 9.80 -> 9.85 | 26.93/29.07/29.88 -> 24.21/26.17/28.93 | 29.72% -> 27.50% | 56,800 / 58,626 | 57,369 / 59,213 | pass |
| 4 | 5.00 -> 5.25 | 114.10/117.23/118.12 -> 104.86/111.00/136.55 | 61.72% -> 60.03% | 36,169 / 40,215 | 68,456 / 76,175 | fail |
| 8 | 2.90 -> 3.05 | 255.51/262.88/264.41 -> 236.89/241.71/243.79 | 80.45% -> 78.35% | 24,581 / 29,611 | 78,218 / 95,138 | fail |

All candidates converge correctly with exact input/action schedules and zero
queue, high-water, or backpressure-policy transitions. Four and eight remain
`DILATED` and below the >=9 Hz cadence admission threshold. Four and eight also
miss the 64 KiB/s normalized mean. Their low actual traffic is cadence collapse
and receives no bandwidth credit. Projection tails improve in this single short
window, but four and eight still miss the authority clock gate, so S14 is a
useful CPU improvement, not a product admission.

The next bounded lane is to reuse the exact canonical lane byte counts already
computed while constructing delta/keyframe candidates. S14 currently
canonical-serializes those four lane payloads again to enforce the unchanged
expanded-pair limit. Removing that duplicate component work can preserve every
candidate and wire byte; hosted costs and 24/48/96 remain closed.

## Validation

```sh
node tests/multiplayer-state-pair-single-serialization-evidence.cjs
node tests/run-all.cjs --lane=multiplayer-network --no-retries
```

The top-level artifact composite is
`055de7c637163bb25e50dd36993f1e16075d2fa4abeb4be7216aafd95a6bfc4f`.
