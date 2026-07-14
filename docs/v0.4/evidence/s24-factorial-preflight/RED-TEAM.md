# S24 Preflight Red Team

The read-only review ran before evidence sealing. All P1/P2 findings were
resolved before the committed artifact.

| Finding | Severity | Resolution |
|---|---|---|
| stale pre-fix JSON claimed `NORMAL` and an S24 pass | P1 | discarded; regenerated from clean `ccdeff8` with embedded commit/script/test provenance; final decision is `s24Gate=false` |
| H48/H96 player queries left the synthetic world | P1 | replaced the fixed 6x4 layout with population-derived in-bounds grids; focused tests cover every H24/H48/H96/X96 query/body coordinate |
| event egress did not consume scale-vector event counts | P2 | added 8/32-event replication factorial axis; H24/H48/H96/X96 projection and byte fits consume 32/64/128/256 events |
| goodness of fit was mislabeled as identifiability | P2 | added full-rank and standardized condition-number diagnostics; retained coefficient covariance; far forecasts are scenario sensitivities, not confidence claims |
| core fields resembled billable CPU claims | P2 | renamed them synthetic core demand and kept live process/billable CPU as an explicit capture gap |
| fit/sample evidence was not auditable | P2 | artifact now includes 512 writer rows, 256 replication rows, 600 representative beats, 300 dense beats, execution order, covariance, residuals, source commit, and file SHAs |
| queue/memory endpoints could be mistaken for capacity | P3 | labeled one-beat encoded bytes and controlled-GC endpoints as sensitivities only |
| privacy test checked only two substrings | P3 | added an exact public top-level allowlist, fixed-width numeric tuple checks, event cardinality, and forbidden identity/private/credential field checks |

Residual risks remain intentional claim boundaries: the synthetic fixture does
not prove live runtime semantics, on-wire privacy, paced event-loop behavior,
real socket backpressure, hosted placement, or 48/96 capacity.

