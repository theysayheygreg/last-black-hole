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
