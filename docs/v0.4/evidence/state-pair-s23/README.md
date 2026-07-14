# S23 Counterbalanced Product Evidence

All four artifacts bind clean commit `0120926f35e09c10db2e75dd0e53187ee068a981`.
Each treatment uses one match, one dedicated logical authority, and one isolated
Node process per recipient. The authority profiler is off. Round A runs S20
then S23; round B runs S23 then S20. Population order is also reversed between
treatments and rounds.

| Round | Path | Population order | Composite SHA-256 |
| --- | --- | --- | --- |
| A | `control-s20` | 8, 4, 1 | `98606afd187f9575497faa0add0ead18270a5a11305dd42a111c4d4fbc412eb6` |
| A | `candidate-s23` | 1, 4, 8 | `10aa48320a4579d213475722e3b11f9236e6f20c9dcc58d188abced4be4f9dcc` |
| B | `candidate-s23` | 8, 4, 1 | `c1c764e91c83ab849158d51235d7f57d8296c7961aa037c85e8930f963a8826b` |
| B | `control-s20` | 1, 4, 8 | `aab940a9eaadc7dd875da530b528dcc71df620aaba325a71b69e66b05b49dc45` |

## Candidate result

| Players | Authority Hz A/B | Projection p95 A/B | Projection p99 A/B | Mean B/s A/B | Overload A/B | Verdict |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 9.85 / 9.80 | 28.22 / 28.31 ms | 28.65 / 28.67 ms | 40,018 / 38,895 | NORMAL / NORMAL | Absolute gates pass, but S20 non-regression fails |
| 4 | 9.80 / 9.85 | 50.88 / 49.17 ms | 52.84 / 50.03 ms | 44,482 / 45,711 | NORMAL / NORMAL | Round A misses the 50 ms p95 gate |
| 8 | 9.00 / 9.10 | 88.58 / 88.33 ms | 95.05 / 94.63 ms | 45,801 / 44,864 | NORMAL / NORMAL | Both tail gates fail; eight remains closed |

S23 produces one body build and one body hash per body revision in every run.
Real cohort reuse is present: 724/704 hits at four players and 1,722/1,748 at
eight. Every client/correctness/cleanup check passes, and retained canonical
body, encoded-body, and cohort material stays below the combined 8 MiB cap.

S23 is not promoted. It doubles one-player projection p95 and increases
one-player authority CPU by a median 81.5%; four-player traffic rises by a
median 49.5%; and eight recovers cadence but remains far outside the absolute
50/70 ms tail gates. S20 remains the product path for one through four players,
S23 remains default-off research scaffolding, and eight remains unadmitted.

`analysis.json` contains the recomputed gates, paired ratios, proof flags, and
decision. Raw scenario JSON retains the exact accounting events, process
metrics, client diagnostics, pressure counters, body/cohort diagnostics, and
cleanup proof. This is machine-local raw WebSocket evidence, not WAN, hosted,
fleet, AOI, or high-count evidence.
