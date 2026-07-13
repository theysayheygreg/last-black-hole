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
