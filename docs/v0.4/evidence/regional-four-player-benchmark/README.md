# Regional Four-Player Benchmark Evidence Contract

This directory defines the provider-neutral Phase 6 evidence shape. It does
not contain a hosted result and does not reserve, deploy, or purchase cloud
capacity.

The future admission artifact must be a clean-build, zero-retry
`external-one-shot` capture of the admitted S20 path: one authority process,
one match, four isolated clients, at least five seconds of warmup, and at least
20 seconds of exactly paced capture. The longer product proof remains the
90-minute soak in the runbook.

Files:

- `raw.schema.json` describes the signed raw capture envelope.
- `analysis.schema.json` describes deterministic analyzer output.
- [`../../REGIONAL-FOUR-PLAYER-BENCHMARK-RUNBOOK.md`](../../REGIONAL-FOUR-PLAYER-BENCHMARK-RUNBOOK.md)
  defines capture and follow-on procedure.
- `scripts/v04-regional-four-player-benchmark.cjs` is the authoritative
  semantic validator. JSON Schema is structural; the analyzer also verifies
  signatures, chronology, evidence labels, privacy, and admission gates.

## Integrity

Raw evidence is canonicalized with recursively sorted object keys, hashed with
SHA-256, and signed with Ed25519. The trusted public key is supplied separately
to the analyzer. A public key embedded in evidence is never its own trust root.
The build artifact also has its own `metadata.artifactSha256`; this is distinct
from the raw evidence payload hash.

## Evidence labels

Every numeric observation is one of:

- `measured`: directly observed by the declared collector;
- `derived`: arithmetic over named measured inputs with the formula retained;
- `unavailable`: no value field, plus a reason.

`unavailable` is never zero. A local parser smoke intentionally leaves socket,
packet, loss, retransmission, reconnect, replacement, and invoice observations
unavailable and receives `LOCAL_NON_ADMISSION`. It cannot support a regional,
packing, cost, or product claim.

## Network layers

Application payload, socket bytes, and on-wire packet bytes are separate
measurements. The external artifact must provide all three for every client and
the match, plus packet rate, retransmits, loss, and reconciliation sources.
Application/WebSocket counters cannot be copied into on-wire fields. The local
runtime accounting ledger measures application behavior only.

The regional runner must use an independent host/TLS-edge collector such as a
packet capture plus OS socket/TCP counters. Captured connection tuples are
mapped to the four public aliases and reconciled against application totals.
Unexplained byte difference must be at most five percent.

## Admission boundary

The analyzer requires:

- exactly one authority and exactly four isolated clients;
- a rejected fifth seat;
- every client at least 9 Hz in `NORMAL`;
- projection p95 at most 50 ms and p99 at most 70 ms;
- application mean at most 64 KiB/s/client and p95 at most 80 KiB/s/client;
- bounded application, reliable, transport, debt, RSS, heap, retained-memory,
  and backpressure metrics under precommitted bounds;
- correctness, privacy, S20 fallback, cleanup, and no P1/P2/P3 findings.

`safeAuthoritiesPerHost` must remain `unavailable` in this evidence. It can be
set only by the later counterbalanced noisy-neighbor density experiment.
