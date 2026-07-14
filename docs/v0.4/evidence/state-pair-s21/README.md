# S21 authority clock attribution — diagnostic capture

This directory contains the first S21 diagnostic-only 1/4/8 capture on commit
`995d003`. It enables the normally-off bounded authority stage profiler while
keeping one match in one dedicated authority process and every simulated
receiver in its own process.

`attribution/` validates with aggregate SHA-256
`0c469ac5f12c1295e9d2a8514ec357c5e3dd61b159f25da3797c5a953394e281`.
Its instrumentation materially changes cadence and wall time, so it is not
product or admission evidence. The sealed profiler-off S20 runs remain product
truth. A same-source profiler-off control and a factorized overhead analysis
will be added before S21 makes a next-lane decision.

The profile already confirms that the eight-seat critical path is synchronous
per-recipient public work. Compression, queueing, send calls, and ACK ingestion
are individually small. Async send-callback latency overlaps the serial loop
and must not be summed into authority CPU.
