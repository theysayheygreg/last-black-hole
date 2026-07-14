# S19 shared-public cohort experiment — rejected and reverted

S19 tested one private, bounded mechanism inside each dedicated match authority:
immutable public source/core work was scoped to one authority tick, while public
keyframe/delta work was keyed by exact target hash and exact acknowledged base
hash. Owner state, connection envelope, ACK mutation, recovery, ledgers, and the
single gameplay writer remained per recipient. No cache crossed a match,
authority instance, tick, epoch, manifest, or schema boundary.

The mechanism is **not** the release default. It was implemented at `5074e42`
and reverted at `5f4d3c3`. Real staggered admission gives recipients different
public component revision histories even when their current world values match.
Preserving S18 bytes therefore creates distinct result hashes and ACK-base
cohorts. More concretely, the experimental publisher key included each
recipient's `connectionEpoch` and `statePairId`; a delta key also included the
exact acknowledged-base hash. The runtime transition cohort used the exact
recipient revision-tracker snapshot identity. Staggered scheduling, joins, and
ACK advancement made those values diverge before publication even when current
world values matched. Product evidence consequently observed zero public
keyframe and zero public delta reuse at 1/4/8 players. Manufacturing hits would
require deleting or redefining isolation and lineage inputs, which this
experiment explicitly refused to do.

S6 remains a separate accepted optimization: its prepared public
projection/core path avoids repeated validation, canonicalization, and hashing
inside each recipient lane. S19 layered cross-recipient source/transition and
publisher-cohort caches on top. Reverting S19 removes only that new layer; it
does not remove or relitigate S6.

## Exactness and synthetic ceiling

The focused oracle compared 22 shared/unshared publications across synchronized
recipients, mixed ACK bases, ACK withholding, reconnection, connection-epoch
rotation, owner-private markers, and a same-tick public mutation. Wire objects,
positional bytes, selection, digest, and semantics had zero mismatch.

A counterbalanced 2 x 160-beat, eight-recipient synthetic benchmark deliberately
started every revision tracker together. It also had zero transcript mismatch.
Under that artificial cohort, shared mean publish time was 10.74/10.90 ms versus
16.94/16.83 ms, with 1,330 core and 1,323 delta reuses per candidate round.
This is a useful ceiling, not product evidence: normal admission never formed
those cohorts.

## One-authority-per-match product evidence

Each row uses one isolated authority process for one match, one isolated client
process per player, a five-second warmup, and a fixed 20-second profiler-off
window. The baseline and candidate ran from the same clean experiment commit;
the baseline disabled sharing. Collapsed cadence receives no bandwidth credit.

| Players | Receiver Hz baseline -> candidate | Projection p95 ms baseline -> candidate | Authority CPU/core baseline -> candidate | Candidate actual mean B/s | Candidate normalized 10 Hz mean/p95 B/s | Product verdict |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 9.70 -> 9.75 | 15.95 -> 18.72 | 17.19% -> 20.34% | 58,817 | 60,313 / 62,739 | pass |
| 4 | 9.80 -> 9.80 | 53.65 -> 58.77 | 58.93% -> 62.25% | 71,346 | 72,425 / 76,987 | fail: normalized mean |
| 8 | 4.95 -> 4.80 | 122.03 -> 125.66 | 64.32% -> 64.69% | 39,623 | 81,187 / 83,915 | fail: cadence, clock, normalized mean/p95 |

All three candidate rows retain exact schedules, convergence, applicable bases,
zero client errors, zero queue/backpressure-policy transitions, bounded ledgers,
and clean authority/client teardown. Sharing changes no wire-size gate; four
still exceeds 64 KiB/s normalized mean. Eight remains dilated and its low
actual rate is not credited.

These isolated product rows used one fixed baseline-then-candidate order and one
20-second window per side. The table preserves the observations, but it is not
a counterbalanced estimate of regression magnitude. Zero publisher reuse is
the efficacy failure and is independently sufficient for rejection.

The baseline composite is
`df2441176514833357645959815053be53adaa23c8b434ec7548bf4cc52169f7`.
The candidate composite is
`79765292714530595321902fb5bf3a5cfa502b02d5c4c46c9c6cca95739c4a23`.
The top-level evidence composite is
`0d29aa0d7fe51f49c553f50160e1347beffd7c8075d4f62474fdd4a2fa831140`.

`rejected-co-located/` preserves an earlier attempt that failed during the
eight-seat manifest-admission phase. It is not used for performance or product
admission and was not silently rerun.

## Independent red-team disposition

An independent read-only review found no P1 privacy, ACK/base, or authority
boundary defect in the exercised paths, and no remaining P1/P2 after the
revert. It required rejection because real admissions recorded zero publisher
keyframe/delta reuse while CPU and tail latency were higher in the fixed-order
window. It also confirmed
that the synchronized test and microbenchmark manufacture cohorts that normal
staggered admission does not form, so they remain diagnostic ceilings only.

The sealed isolated-process artifacts export publisher cohort counters but not
runtime source/core reuse counters. Accordingly this record makes no claim that
upstream core work reused in the product run. The reverted diagnostics also had
non-causal miss labels, a tautological identity counter, and incomplete reused-
byte accounting; none remains in the release code.

The registered `multiplayer-network` lane ran exactly once after the revert
with retries disabled. All 38 selected suites passed, including the sealed S19
negative-evidence validator. The synthetic benchmark is intentionally not
registered because it requires the detached `5074e42` experiment tree.

## Decision

Reject and revert S19. Keep S15 + S17 + S18 positional JSON as the release
default and keep S16 binary opt-in. The next bounded lane is a compression pilot
against S18 with a strict four-player bandwidth win and strict eight-player
authority CPU/p95 non-regression gate. It must not change authority cadence.
Hosted economics, heavy-sim forecasting, and 24/48/96 remain outside S19.
