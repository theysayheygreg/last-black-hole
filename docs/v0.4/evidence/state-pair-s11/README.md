# S11 admission evidence

`rejected-seat-map/` preserves the first full-duration S11 attempt from clean
`7189a6f`. Its checksums and method validator pass, but it is not admissible
product evidence: concurrent hello completion made accounting recipient
ordinals nondeterministic while the harness still attributed ordinals by seat
index. The resulting normal-8 per-client table falsely assigned zero offered
traffic to two clients. Commit `8772003` replaces that setup with sequential
lightweight hello binding followed by cohort-wide first-pair readiness.

Do not use the rejected attempt for cadence, ACK convergence, traffic, or
product decisions. It is retained only as immutable method/fix evidence. The
accepted full-duration rerun belongs in `canonical/`.

`rejected-reset-ordinal/` preserves the next full-duration attempt from clean
`39140fb` (aggregate SHA
`8d0a4808a4cc7e93c1a4aa47e9344551edd2b0da2004034092e8192a95b6df80`).
Sequential hello binding fixed setup order, but the evidence reset correctly
cleared accounting identities after warmup, so seat-index attribution still
became invalid during the product window. Commit `8beb81e` removes ordinal
assumptions: normal scenarios now require a unique maximum-weight one-to-one
mapping over each client's accepted `(frameId, exact wire bytes)` tuples and
the accounting recipient tuples. Ambiguous or zero-proof mappings invalidate
the method.

`rejected-zero-cadence-map/` preserves the clean `e07e228` full-duration
attempt that completed normal-1, normal-4, and the full normal-8 window before
the mapper rejected normal-8 with `expected 8 ordinals, observed 6`. This was
not an accounting-capacity failure: two clients had no accepted state-pair
events inside the measured window, which is itself product-relevant cadence
collapse. Requiring an in-window accepted tuple therefore made the method
incapable of recording the zero it needed to reject. The follow-up maps client
identity from the full capture, including warmup, while all cadence, traffic,
and correctness statistics remain bounded to the canonical measurement
window. Missing measured events are retained as zero and receive no admission
credit.

`rejected-disconnect-denominator/` preserves the next clean `ed3ea22`
full-duration attempt (aggregate SHA
`d98cd43cf28d989d29ad390b4a94f03b96da78f8642e509a0b5228766be49cb7`).
It completed all five scenarios and validated, and it proved the prior
zero-cadence fix by mapping normal-8 seat 7 from warmup with zero measured
tuples. It is still not canonical: exact normal traffic means inherited the
generic active-interval denominator, so clients that disconnected under load
were divided by only their surviving interval and a fully silent recipient
serialized as `null`. Normal product evidence must instead divide every
intended client's accepted bytes by the full fixed window, retain explicit
zero rows in every fixed-window distribution, and mark 10 Hz normalization
unavailable (and therefore failed) when no measured pair-size sample exists.

`canonical/` is the accepted full-duration S11 admission artifact from clean
`4eee268`, composite SHA-256
`983eae7457b61e77c7477669c7f9e1116172261dc286cf08b840b183cd48a4ca`.
External validation exits `0`; admission exits `2` because the method-valid
artifact rejects product promotion. It contains normal 1/4/8 at 60-second
warmup plus 300-second measurement and churn 1/8 at 20 plus 90 seconds, with
the S5 stage profiler disabled. Every normal mean and fixed-window histogram
contains the full intended client set, including explicit zero rates; client
identity is proven from full-capture exact tuples while every scored byte,
cadence, correctness, CPU, and memory value remains measurement-window-only.
Use only this directory for the S11 product decision.
