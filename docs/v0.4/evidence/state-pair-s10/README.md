# S10 bounded client base-ledger pre-gate

Status: **convergence accepted; product admission rejected**. S10 closes the
S9 multi-client base-convergence failure without changing the positional JSON
codec or enabling any capability by default. Product admission remains denied
because 4-player traffic exceeds the 64 KiB/s mean gate and the instrumented
8-player loopback does not sustain 9 Hz or the authority clock/overload gates.

## Immutable artifact

- Implementation commits: `2041608` through `e1e0ea9`
- Branch: `codex/v0.4-multiplayer-architecture`
- Clean command: `LBH_S10_OUTPUT_DIR=/tmp/lbh-s10-normal-final-e1e0ea9 node tests/multiplayer-state-pair-product-gate.cjs --s10-ledger --review --normal-only`
- Accepted artifact: [`pre-gate/`](pre-gate/)
- Aggregate SHA-256: `8f38e88f63bd753c8def9a100a2554d7e16acd29e0aa0077295c27233fb1a43d`
- Artifact validation: pass, including checksums, process/socket cleanup,
  accounting completeness, distinct-recipient ACK-base advancement, exact
  per-recipient cadence arithmetic, and zeroed receiver-ledger teardown
- Convergence-only verdict: pass at 1/4/8 recipients
- Product admission: rejected; only the 1-player scenario passes every product
  traffic, cadence, authority-clock, and NORMAL-overload guard
- Full regression: `npm run test:multiplayer-network` passed all 28 selected
  suites after one unrelated event-journal timing retry was isolated and then
  the complete lane reran green
- Independent red-team review: no remaining P1 or P2; see
  [`RED-TEAM.md`](RED-TEAM.md)

This is a 5-second warmup plus 20-second normal measurement at 1/4/8 local
recipients. `--normal-only` intentionally omits churn because S10's bounded
question is normal-window base convergence. It is review-profile local
loopback evidence, not canonical-duration, WAN, WSS, hosted, or fleet evidence.

## Receiver and ACK contract

The client retains immutable, fully materialized public+owner atomic bases.
Every entry is bound to match, session, authority incarnation, recipient
incarnation, manifest schema/hash, negotiated mode, and positional codec
manifest hash. Deltas select an exact `(snapshotId, semanticHash)` base per
lane; public and owner lanes must name the same atomic entry. Materialization,
hash validation, owner privacy, lifecycle continuity, and lineage validation
complete before one pair becomes visible.

The ledger is bounded to 64 entries, 8 MiB, and 60 seconds. Oldest-frame
eviction is deterministic, with the visible head pinned while another entry is
available. Reconnect, binding change, explicit rebase, and teardown clear the
ledger. Teardown diagnostics prove zero entries and zero bytes.

A genuine missing/evicted base opens one recovery episode and emits at most one
edge-triggered request until an atomic keyframe converges. Malformed, forged,
hash-mismatched, and cross-binding frames fail closed without recovery storms.
An outstanding recovery fences racing deltas and old retransmits.

The authority keeps a separate bounded 256-record retired-ACK proof ring. Each
proof contains only exact identity/schema/hash/lineage fields—never a
projection or raw wire frame. An ACK racing pending eviction or rebase can be
authenticated as a no-op but cannot restore or roll back an authority base.
Distinct recipient states increment `ackRecipientsWithBaseAdvance` only after
a real base advance; duplicates, stale ACKs, retired no-ops, and rejects cannot
inflate convergence.

## S9 to S10 convergence result

| Players | S9 min receiver Hz | S9 recoveries | S9 ACK rejects | S10 authority Hz per recipient | S10 receiver Hz per recipient | S10 recoveries / base misses / receiver rejects / ACK rejects | Result |
| ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 9.70 | 0 | 0 | 9.70 | 9.70 | 0 / 0 / 0 / 0 | convergence pass; product pass |
| 4 | 1.05 | 221 | 1 | 9.80 each | 9.80 each | 0 / 0 / 0 / 0 | convergence pass; product traffic fail |
| 8 | 4.85 | 1 | 0 | 4.90-4.95 | 4.60-4.90 | 0 / 0 / 0 / 0 | convergence pass; product cadence/clock/overload fail |

The convergence tolerance is explicit and independently revalidated for every
recipient: `max(1 Hz, 10% of that recipient's accepted authority cadence)`.
This diagnostic tolerance cannot admit a slow product run: product admission
separately requires every normal receiver to sustain at least 9 Hz.

All clients advanced a real authority ACK base independently: 1/1, 4/4, and
8/8 distinct recipient states. Normal-window public/owner hashes, privacy,
atomic observation, ledger bounds, accounting, and cleanup all pass.

## Bounded state, traffic, and local CPU

| Players | Max receiver-ledger high-water | Actual worst B/s | 10 Hz normalized mean gate | Min receiver Hz | Projection/publish p95 | Client apply p95 | Event-loop lag p95 |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 4,019,863 B | 55,593 | pass | 9.70 | 15.98 ms | 20.08 ms | 30.46 ms |
| 4 | 4,349,216 B | 75,594 | fail | 9.80 | 55.25 ms | 20.03 ms | 73.60 ms |
| 8 | 6,604,894 B | 46,928 | fail | 4.60 | 160.22 ms | 22.35 ms | 172.88 ms |

Every client stayed at or below 64 entries and 8 MiB, then tore down to zero
entries and bytes. The low observed 8-player B/s is not an efficiency win: the
instrumented process fell to roughly 4.9 Hz, exceeded its projection clock,
and left NORMAL overload. The 10 Hz normalized traffic guards therefore remain
failed and product admission remains denied.

## Preserved rejected evidence

- [`rejected-ack-proof-64/`](rejected-ack-proof-64/) preserves the clean
  `02c105c` run where a 64-record authority proof ring produced one late
  `unknown-frame` ACK rejection under prolonged 8-seat backpressure. That
  result justified the bounded 256-record proof ring.
- [`rejected-cadence-tolerance-0p5/`](rejected-cadence-tolerance-0p5/)
  preserves the clean `0a55a52` run with zero recovery/base/ACK correctness
  faults but one receiver 0.70 Hz behind its 4.75 Hz authority stream. That
  result exposed the inherited population-average/0.5 Hz diagnostic as the
  wrong convergence boundary; absolute product cadence remains >=9 Hz.

Earlier exploratory runs with a 12-entry client ledger also demonstrated
repeatable base eviction under instrumented 8-seat backpressure. They were not
promoted as immutable artifacts; the accepted run proves the resulting
64-entry/8 MiB/60-second bound directly.

## Decision

Accept S10 as the bounded client base-convergence slice. Do not call it product
admission, do not enable the positional capability by default, and do not
merge this v0.4 branch backward into v0.3 or `main`.

The next bounded decision is no longer recovery mechanics. It is whether to
reduce the positional payload/authority apply cost enough to satisfy the
existing 10 Hz, traffic, authority-clock, and NORMAL-overload product gates.
Binary, compression, AOI, hosted WSS, WAN, and fleet claims remain deferred
until one narrow measured slice earns them.
