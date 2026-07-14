# Regional Four-Player Benchmark Runbook

This is the provider-neutral capture procedure for Phase 6 Milestone 4. It
prepares the external measurement; it is not evidence that any provider has
passed. The first planned target is Fly performance CPU, followed by the same
artifact and schedule in a second region and on Hetzner CCX.

## Frozen claim

One live match owns one authority process and one fenced writer lease. Four
isolated clients use the admitted S20 JSON state-pair path with negotiated
Brotli quality 1. The fifth seat is rejected. No S23, S23P, split-fragment, or
high-count code may enter the run.

The short external capture proves the instrumentation and the immediate
four-client envelope. Product/runtime selection still requires the same seed,
artifact, client schedule, Deep Field profile, and 90-minute soak in at least
two regions. `safeAuthoritiesPerHost` remains unknown until Milestone 5.

## Inputs that must be supplied before deployment

- immutable authority artifact digest and clean 40-character Git commit;
- protocol/manifest version and deterministic Deep Field seed;
- provider, region, host class, runtime, image/Node version, and declared CPU/
  memory limits;
- separately provisioned Ed25519 capture signer and trusted public key;
- invoice/rate-card identifiers, compute rate, egress rate, currency, discounts,
  and whether an invoice line was actually observed;
- four client origins with public aliases `client-1` through `client-4`;
- host/TLS-edge permission for packet and socket/TCP counters;
- precommitted RSS, heap, retained-memory, tick-debt, and backpressure limits.

If the external collectors cannot separate four connection tuples, the run is
ineligible. Do not substitute application bytes.

## Preflight

1. Confirm `codex/v0.4-multiplayer-architecture`, clean HEAD, S20 source hash,
   build digest, Node/runtime version, and identical artifact on authority and
   clients.
2. Reserve one authority process only. Record process/incarnation, lease epoch,
   cgroup/container identity, and monotonic/UTC clock offsets without writing
   private IDs into public evidence.
3. Configure four isolated clients and a fifth-seat rejection probe. Use only
   run-public aliases in artifacts.
4. Enable existing application replication accounting. It remains the
   application layer, not socket or packet truth.
5. Start independent collectors:
   - process user/system CPU from process/cgroup counters;
   - RSS/heap, GC pause, event-loop delay, queue/retention, sim/writer/
     projection timing from declared runtime probes;
   - socket bytes and TCP state from OS/cgroup/edge connection counters;
   - on-wire byte length, packet count, retransmits, and loss from a filtered
     packet/eBPF capture or equivalent provider telemetry.
6. Map collector connection tuples to `client-1..4` outside the public raw
   artifact. Keep IP addresses and credentials out of evidence.
7. Run all schema/analyzer adversarial tests. Confirm no final-run directory or
   retry counter already exists.

## One-shot short external capture

There are no retries. A failed capture is retained as failed evidence and a new
attempt needs explicit authorization and a new run ID.

1. Start the authority and record process-start, readiness, and route/lease
   chronology.
2. Admit four clients, reject the fifth, and confirm S20 negotiation/fallback.
3. Warm the exact schedule for at least five seconds.
4. Capture at an exactly paced schedule for at least 20 seconds. Do not begin
   early or extend selectively after observing a bad tail.
5. Exercise the declared reconnect/rebase step and record socket-open to
   truthful completed state. A reconnect is part of the scenario, not a retry.
6. Fence/drain/replace as declared, record readiness and replacement time, and
   verify no second writer becomes active.
7. Close all sockets, authority, collectors, queues, and outbox. Record cleanup
   truth rather than assuming process exit freed everything.
8. Seal raw evidence: canonical SHA-256, Ed25519 signature, detached trusted
   public key, build digest, and collector manifests.

Analyze without rewriting raw evidence:

```sh
node scripts/v04-regional-four-player-benchmark.cjs \
  --input /absolute/path/raw.json \
  --trusted-public-key /absolute/path/capture-public.pem \
  --output /absolute/path/analysis.json
```

The analyzer exits nonzero for malformed evidence and for a valid external
artifact that misses a gate. Preserve both.

## Required measurements

- authority, sim, writer, and projection p50/p95/p99;
- each client's completed-state Hz and match `NORMAL`/TiDi/debt status;
- measured process user/system CPU and derived core fraction;
- RSS, heap, GC pause, event-loop delay, tick debt, retained memory;
- application, socket, and on-wire bytes/s plus PPS per client and match;
- retransmitted bytes/packets, loss, collector sources, and <=5% unexplained
  reconciliation difference;
- application/reliable/transport queue high-water, backpressure, and retained
  client memory;
- reconnect, startup, readiness, drain, and replacement timing;
- correctness, privacy, S20 fallback, cleanup, red-team findings;
- provider/region/host/runtime/artifact/protocol/invoice metadata.

Zero and unavailable are different. Derived values name inputs and formula.
Any unmeasured required external observation blocks admission.

## Admission gates

- one authority, four clients, fifth rejected;
- all clients >=9 Hz, `NORMAL`;
- projection p95 <=50 ms and p99 <=70 ms;
- application mean <=64 KiB/s/client and p95 <=80 KiB/s/client;
- application queue <=512 KiB/client, reliable queue <=256 KiB/client, and
  transport high-water <=256 KiB/client;
- precommitted debt/RSS/heap/retention/backpressure limits hold;
- no cross-recipient private field, fork, duplicate consequence/settlement,
  cleanup failure, or P1/P2/P3.

## Red-team method

Before accepting a run, a reviewer who did not operate the capture attempts to
invalidate the claim from raw artifacts first. At minimum they mutate or remove
metadata, chronology, signature/SHA, commit and artifact bindings, retry count,
client set, fifth-seat result, evidence labels, network collector provenance,
privacy fields, and packing status. They also check that a gate miss remains a
signed `FAIL` rather than being discarded. The automated adversarial suite
covers these cases; the reviewer records any additional P1/P2/P3 against the
sealed raw hash. No run passes while one remains open.

## Follow-on: 90-minute soak

Use the same immutable artifact, seed, schedule, content, four clients, and
collectors. Warm for five minutes, capture for 90 minutes, and retain fixed
windows rather than sampling only favorable intervals. Include reconnect/rebase
bursts, route/lease transitions, drain/replacement, result outbox timing, and
80/120/160 ms WAN cases. Compare regions without changing gates.

The soak schema reuses the raw contract with `followOn.soak90m.status = run`,
`requiredDurationSeconds = 5400`, fixed-window summaries, memory slopes, and
collector continuity. A short run cannot set this status.

## Follow-on: noisy-neighbor packing

After Milestone 4 passes, run 1/2/4/8 independent four-player matches per host.
Each match has a unique authority process, lease, journal, queues, outbox, and
public aliases. Counterbalance schedule order:

- round A: candidate density ascending, control descending;
- round B: candidate density descending, control ascending;
- align heaviest windows across all authorities, then stagger them;
- kill/drain one authority and one host while observing every neighbor.

Record per-match gates and host aggregate CPU, RSS, egress, PPS, encode work,
socket/process limits, queues, failure blast radius, and uncertainty. Only this
evidence may compute:

```text
safeAuthoritiesPerHost = floor(largestPassingDensity * safetyFactor)
```

Copies sold, CCU forecasts, local synthetic fixtures, vCPU count, or a single
authority run must never populate that value.

## Local parser smoke

This checks code and schema only:

```sh
node tests/v04-regional-four-player-benchmark.cjs
node scripts/v04-regional-four-player-benchmark.cjs --smoke
```

It generates an ephemeral signer and `LOCAL_NON_ADMISSION` output. Socket and
on-wire fields remain unavailable. It consumes no external one-shot run and
makes no cloud, regional, packing, invoice, or product claim.
