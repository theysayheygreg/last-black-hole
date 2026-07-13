# S7 Canonical Product Gate and Residual Attribution

S7 denies multiplayer product admission at commit
`ac8c90daa7ba279a9e330a34f2a83094bfd91be2`. The canonical evidence method
passes independently, but every normal population fails the actual and
target-cadence application-byte guards. Four and eight recipients also miss
the healthy 9 Hz publication floor and leave `NORMAL` overload; eight
recipients miss the existing authority clock budget. The one-recipient normal
run records one rejected ACK and therefore fails exact-zero-ACK correctness.

This gate keeps the accepted S6 prepared-projection path enabled, keeps the S5
stage profiler disabled, and enables only the bounded event-loop-delay monitor.
It measures exact compact-JSON application bytes accepted by raw WebSocket send
callbacks. WebSocket framing, TLS 1.3, and IPv4/TCP are separate modeled
sensitivity views and do not affect admission.

## Canonical result

Normal scenarios use a one-minute warmup followed by a five-minute measured
window. Churn scenarios use the existing bounded deterministic fault method at
one and eight recipients.

| Recipients | Actual mean | Actual 1 s p95 / p99 | Observed cadence | 10 Hz mean | 10 Hz p95 / p99 | Projection p95 | Event-loop p95 | Product result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 141,755 B/s | 160,972 / 172,833 B/s | 9.79 Hz | 144,785 B/s | 164,413 / 176,530 B/s | 24.36 ms | 30.88 ms | fail: bytes and one ACK reject |
| 4 | 132,648 B/s | 192,816 / 221,937 B/s | 7.24 Hz | 183,030 B/s | 266,159 / 306,329 B/s | 86.79 ms | 88.34 ms | fail: bytes, cadence, overload |
| 8 | 80,499 B/s | 97,943 / 108,054 B/s | 4.22 Hz | 189,924 B/s | 231,253 / 255,406 B/s | 167.08 ms | 181.40 ms | fail: bytes, cadence, clock, overload |

The lower observed eight-player rate is not a traffic success. Its publication
clock collapsed to 4.22 Hz. Holding the observed pair-size mix constant at the
configured 10 Hz exposes the 189,924 B/s mean application load.

One-player churn passes correctness, clock, and overload. Eight-player churn
passes loss/recovery, ACK convergence, reincarnation, lifecycle, privacy, and
cleanup correctness, but fails the authority clock and `NORMAL` overload
guards. All five scenario cleanup artifacts confirm zero connections and dead
authority processes.

## Exact 10 Hz payload envelope

After subtracting measured non-state application traffic, the 64 KiB/s mean
guard allows about 6.50 KB per accepted state pair at 10 Hz:

| Recipients | Non-pair traffic | Observed mean pair | Maximum mean pair at 10 Hz | Required reduction |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 498.0 B/s | 14,428.7 B | 6,503.8 B | 7,924.9 B (54.9%) |
| 4 | 486.5 B/s | 18,254.4 B | 6,504.9 B | 11,749.4 B (64.4%) |
| 8 | 497.6 B/s | 18,942.6 B | 6,503.8 B | 12,438.8 B (65.7%) |

This is the decision-ready payload target. A cadence cap would need roughly
4.51, 3.56, and 3.43 Hz respectively under a hold-size assumption, which
conflicts with the configured 10 Hz contract and can enlarge deltas.

## Privacy-safe residual attribution

Each normal population reduces at most 512 accepted encoded product frames in
memory, then discards the raw strings before writing evidence. Persisted output
contains additive byte counts, allowlisted public category/component names,
allowlisted owner component names, aggregate token classes, and a safe-summary
hash. It contains no raw frames, entity IDs, recipient IDs from the sample,
owner values, or unapproved owner component names.

All lane totals reconcile exactly:

`encoded pair = public lane + owner lane + outer pair envelope`

Public operation totals also reconcile exactly, as do owner keyframe classes
and the update lexical split. At 1/4/8 recipients, sampled public deltas average
11,912 / 13,206 / 16,182 B per pair; owner keyframes average 2,719 / 2,416 /
2,225 B; the outer envelope remains about 592 B.

`runtimePublic` updates dominate public component payload at 8,051 / 8,825 /
11,034 B per sampled pair. In the one-player sample, update component payloads
contain 1,752,549 identifier/key bytes, 609,037 string bytes, 1,221,831 numeric
bytes, and 432,044 delimiter bytes. Update entity envelopes add another 799,340
identifier/key bytes, 292,403 string bytes, 43,017 numeric bytes, and 139,060
delimiter bytes. The exact lexical split is evidence for codec potential, not a
prediction that all such bytes disappear.

## Architecture decision

Prototype one bounded schema-cleanup and explicit field-cadence slice first,
starting with high-frequency `runtimePublic` fields while preserving server
authority and exact client materialization. Prove equivalence, stale-field
semantics, and recovery behavior, then rerun this same gate.

Do not change the 10 Hz product contract to make the byte rate pass. Do not
select compact binary encoding yet: its identifier/string/delimiter total is an
upper-bound proxy and carries protocol/versioning/debuggability cost. Do not
select AOI first: player, sentry, fauna, and inhibitor updates recur on every
sampled pair in this representative Shallows workload, while the gate contains
no distance or visibility evidence proving safe exclusion. AOI may become
valuable on larger maps, but that requires a dedicated interest-set workload.

The canonical result also says payload work alone may not be sufficient. The
four- and eight-recipient five-minute runs expose sustained scheduling and
overload margin that the shorter S6 paired diagnostic did not settle. Preserve
the prepared optimization, but require the next payload prototype to rerun the
same clock and overload gates rather than assuming CPU is solved.

## Binding and reproduction

The immutable canonical artifact is `canonical/`. Its composite SHA-256 is:

`e4f16209f70791c8b15dc6b913b99c6fc170c2a4f4491c9da654ab814ef4d068`

`--validate-artifact` exits `0`; `--admission-artifact` exits `2`. Method
validation proves checksums, cleanup, complete accounting, required scenarios,
prepared/profiler boundaries, raw ACK-counter consistency, target normalization,
privacy-safe reconciliation, and S4/S6 evidence bindings. It intentionally does
not turn a measured product correctness failure into an invalid method.

Reproduce from a clean commit with:

```sh
npm run test:multiplayer-state-pair-s7-gate
```

The product-fail exit is `2`. The gate is local macOS loopback evidence for one
match. It is not WAN, WSS, hosted, fleet-capacity, packet-loss, compression,
long-soak, or 24--96-client evidence.
