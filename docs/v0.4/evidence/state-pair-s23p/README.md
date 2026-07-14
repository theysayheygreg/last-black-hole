# S23P Counterbalanced Product Evidence

All six artifacts bind clean commit
`b9c6825a769864e80711ee9e50a7ba86bfcdc2de`. Each treatment uses one match,
one dedicated logical authority, and one isolated Node process per recipient.
The authority profiler is off. Treatment order and each treatment's population
order reverse between rounds. The evidence analyzer verifies each declared
population order against both the checksum-bound run/aggregate manifests and
strictly increasing raw measurement-window start times.

| Round | Path | Population order | Composite SHA-256 |
| --- | --- | --- | --- |
| A | `control-s20` | 8, 4, 1 | `86d71107110e7dff1c8a0e823ff77042dfd1a817aff91a62902839413f28da82` |
| A | `control-s23` | 4, 1, 8 | `df2ff80d30161c0d89b708cfbbbc4f26a5d9833226aff952cb089076c22c0598` |
| A | `candidate-s23p` | 1, 8, 4 | `f40f63fbf73279c57e88f12e3fb2b0051584d4c6d4adfce0827bd23154265582` |
| B | `candidate-s23p` | 4, 8, 1 | `27f9ab1b13fe750ffa13a746077a9b27da31a87e353be650c20b8681d3540687` |
| B | `control-s23` | 8, 1, 4 | `daafafba43b1f9643f422c9d7c843416b45095cd4a4f094b2c4b0dab5b6a7675` |
| B | `control-s20` | 1, 4, 8 | `aff91ae56fea8959d8a2b3f696528f05b948d3d51d3d6e9a9980bc1aeb7d8e77` |

| Players | S23P p95 A/B | S23P p99 A/B | Mean B/s A/B | Verdict |
| ---: | ---: | ---: | ---: | --- |
| 1 | 28.50 / 28.20 ms | 28.73 / 28.82 ms | 39,795 / 39,765 | Absolute pass; S20 regression |
| 4 | 45.11 / 45.48 ms | 45.90 / 46.71 ms | 44,161 / 44,706 | Absolute pass; S20 traffic regression |
| 8 | 71.05 / 69.76 ms | 75.04 / 72.69 ms | 48,984 / 49,699 | Both tail gates fail |

The candidate is correct and clean in every scenario. Each issued proof beat
has exactly one public validation/canonicalization/hash and one body build/hash,
with zero rejected/revoked proofs and zero active proofs at cleanup. Focused
runtime coverage separately proves exact S23 keyframe/delta, ACK, divergent
cohort, retransmit, and recovery wires plus adversarial lifecycle behavior.

S23P is not promoted. `analysis.json` recomputes absolute gates, S23 recovery,
S20 non-regression, proof counters, raw artifact SHAs, and the decision. This is
machine-local raw WebSocket evidence, not WAN, hosted, fleet, AOI, or high-count
evidence.
