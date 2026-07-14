# S24 live 24-client loopback capture

This directory records the pre-run eligibility decision for a proposed warmed,
paced live capture of one logical single-writer authority serving 24 isolated
client processes. The decision is separately provenance-bound to the sealed
synthetic S24 preflight at commit `eaaa811`; it does not replace or rewrite that
evidence.

## Decision: stop before the live run

The session model accepts `maxPlayers: 24`, but the sole live match WebSocket
adapter is instantiated with `maxConnections: 16`. A 24-player session record
therefore does not mean that 24 simultaneous isolated clients can connect. The
17th live connection would be rejected. Raising or parameterizing that cap is a
production/runtime change, which this capture authorization explicitly forbids.

The full H24 load vector is independently unavailable. The largest existing
Deep Field profile caps scavengers at 7 rather than 48, and no authorized
production-free control instantiates exactly 400 dynamic bodies. These factors
must not be filled with synthetic work inside a document labeled live.

No raw artifact exists. The orchestrator reports that it stopped at static
inspection before launching an authority or client process, so the authorized
run was not knowingly consumed. Repository state alone cannot prove historical
non-execution; the evidence keeps those two claims separate.

The static eligibility result can be regenerated without starting the runtime:

```sh
node scripts/s24-live-loopback-eligibility.cjs
node tests/s24-live-loopback-eligibility.cjs
```

The blocked capture must not be reauthorized until the adapter cap and exact
live load-vector controls have an explicitly approved implementation and their
correctness/admission effects have been reviewed. There is still exactly one
logical gameplay writer per match; raising the socket cap would not create a
second authority. Concurrent matches would each own a separate writer.
