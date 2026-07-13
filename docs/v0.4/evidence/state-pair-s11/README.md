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
