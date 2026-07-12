# One-Match Authority Performance Model: 4 to 96 Human Clients

> Research memo for `codex/v0.4-multiplayer-architecture`, 2026-07-10.
> This models **one logical match authority for one group of players**. If the
> service has 1,000 concurrent matches, it has 1,000 independent authority
> units. It does not have one global gameplay server simulating every match.

## Decision

LBH should keep one single-writer gameplay authority per match at every size in
this memo. “Dedicated authority” means a run-scoped logical authority, not one
machine for the entire game and not necessarily one operating-system process
forever. At 4–24 clients it can comfortably be one Node process. At 48–96 it
should still have one ordered simulation writer, while socket I/O, recipient
projection, encoding, compression, persistence, and telemetry may move to
workers or adjacent processes.

The current v0.3 runtime is encouraging but does **not** prove a 96-player
product. A local M4 probe admitted and ticked 96 idle/low-input humans, but it
did so in the `DILATED` overload state, with full shared JSON snapshots and no
internet sockets. It proves that the data structures do not immediately fall
over; it does not prove gameplay quality, high-activity collision load,
backpressure safety, or affordable egress.

The practical product recommendation is:

- ship and operate the first internet architecture for 4–8;
- make 24 a supported “large crew” profile only after a 30 Hz movement/contact
  spike and recipient-projection soak pass;
- treat 48 as a separate capacity tier that needs a dedicated sim core plus a
  projection/network worker;
- treat 96 as an experimental fleet-event tier. Even a representative workload
  needs a deliberately engineered writer and worker layout. The heavy serial
  model is infeasible regardless of assigning 12 vCPU: writer work must fall or
  move behind deterministic barriers before this tier can exist;
- never solve 96 by allowing several gameplay writers to mutate one run.

## What is measured, what is modeled

Labels used below:

- **Measured**: observed from the current branch on the stated machine.
- **Derived**: arithmetic over measured bytes, configured clocks, or source
  counts.
- **Modeled**: an explicit planning assumption, not a benchmark result.
- **Target**: an engineering budget the implementation must prove.

### Current source facts

The current large/Deep Field profile is 10 Hz authority, 6 Hz snapshot, 4 Hz
world and field, 6 Hz scavengers, and 10 Hz waves. It uses a coarse field with
0.45-world-unit cells and per-player caps of 4 stars, 3 planetoids, 4 wrecks,
3 scavengers, 4 well influences, 4 wave influences, 2 pickup checks, and 2
portal checks (`src/content/session-profiles.data.json`). Deep Field authors 20
wells, 22 stars, 40 wrecks, and 14 planetoids; portals are wave-spawned
(`src/maps/deep-field-10x10.js`).

The default protocol maximum is still four players
(`scripts/sim-protocol.cjs`). Tests exercise `maxPlayers: 8`, but the session
start path accepts any finite configured value and admission compares the
human count with that value (`scripts/sim-runtime.cjs`). This is why a probe can
admit 96; it is not a published support contract.

The hot loop currently:

1. rebuilds a relevance union by querying once per alive player and category;
2. updates world, AI, field, waves, and threats on scheduled sub-clocks;
3. performs movement, forces, swept contacts, pickup, extraction, and signal
   once per player;
4. rebuilds the Ballpark mirror from runtime state every tick; and
5. advances overload from tick cost, counts, and force-pressure ratios.

The normal `/snapshot` is one shared JSON body containing the whole world and
every player's rich public and private runtime state. `SimClient` polls it at
the advertised snapshot rate. The snapshot ring retains 32 cloned JSON
snapshots, and the event journal retains 256 events. These are bounded, but
full-state cloning and full-response fanout are the wrong high-count wire
shape.

One subtle current behavior matters when reading the measurements: overload
uses

```text
forcePressure = max(
  wells / (alivePlayers * wellBudget),
  waves / (alivePlayers * waveBudget),
  wrecks / (alivePlayers * pickupBudget),
  portals / (alivePlayers * portalBudget)
)
```

With one Deep Field player, 20 wells divided by a four-well influence budget
already yields pressure 5. With four players it is still 1.25. The controller
therefore reaches `DILATED` even when CPU is cheap. That is an algorithmic
pressure-definition artifact, not evidence that the M4 needed time dilation.
High-count work must separate CPU/event-loop pressure from content-density or
relevance-quality pressure.

### Baseline measurement

Machine: Apple M4, 32 GiB, macOS arm64, Node 22.22.3 / V8 12.4. The existing
`node tests/authority-budget.cjs` result was:

| Metric | Measured result |
|---|---:|
| Observed authority cadence | 7.74 Hz |
| Effective target after overload | 8 Hz |
| `/snapshot` p95 response | 7.13 ms |
| Full snapshot p95 | 107.88 KiB |
| Test's one-stream snapshot estimate | 0.33 MB/s |
| Short-soak heap growth | 4.13 MiB |
| Ballpark rebuild p95 | 1.866 ms |

The authority-budget test is a one-player, loopback, low-activity test. Its
1 MB snapshot, 8 MB/s stream, 12 ms Ballpark, and 150 ms response thresholds
are protective ceilings, not expected operating values.

I also ran a read-only benchmark harness against the unmodified runtime. For
each population it started a fresh Deep Field run, joined the stated number of
humans, sent ten rounds of concurrent inputs at about 10 Hz, then sampled full
snapshots and health. It did not create gameplay contention or heavy event
bursts.

| Humans | Effective tick | State | Bodies | Snapshot p95 | Snapshot response p95 | Input HTTP p95 | Heap used | RSS | Last Ballpark rebuild |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 4 | 7.97 Hz | DILATED | 163 | 116.80 KiB | 6.05 ms | 5.68 ms | 11.64 MiB | 72.42 MiB | 1.659 ms |
| 8 | 8.74 Hz | DILATED | 169 | 125.82 KiB | 2.43 ms | 2.97 ms | 9.74 MiB | 76.17 MiB | 0.367 ms |
| 24 | 8.32 Hz | DILATED | 188 | 158.32 KiB | 6.91 ms | 9.81 ms | 11.34 MiB | 82.98 MiB | 1.571 ms |
| 48 | 8.09 Hz | DILATED | 212 | 194.23 KiB | 3.33 ms | 10.39 ms | 13.16 MiB | 87.28 MiB | 1.046 ms |
| 96 | 8.10 Hz | DILATED | 260 | 265.62 KiB | 7.75 ms | 13.49 ms | 17.10 MiB | 108.22 MiB | 1.173 ms |

Run-to-run heap and Ballpark numbers are noisy because each population used a
fresh process and the sample is short. The useful facts are that body count
grew nearly linearly, the 96-player low-activity process stayed small, and the
shared snapshot grew by roughly 1.6 KiB per added player. None is a p95 tick
cost measurement; the runtime currently records tick cost only inside the
overload controller and does not expose its average/worst values in health.

## Current network shape does not scale

If every recipient polls the measured full snapshot, server egress is:

```text
full_fanout_bits_per_second = snapshot_bytes * snapshot_hz * players * 8
```

Using the measured bytes and the large profile's base 6 Hz gives the following
payload-only result. TLS/TCP/IP framing and retransmission are not included.

| Humans | Measured full snapshot | Per-client at 6 Hz | Match egress at 6 Hz |
|---:|---:|---:|---:|
| 4 | 116.80 KiB | 5.74 Mbit/s | 23.0 Mbit/s |
| 8 | 125.82 KiB | 6.18 Mbit/s | 49.5 Mbit/s |
| 24 | 158.32 KiB | 7.78 Mbit/s | 186.8 Mbit/s |
| 48 | 194.23 KiB | 9.55 Mbit/s | 458.2 Mbit/s |
| 96 | 265.62 KiB | 13.06 Mbit/s | 1,253.9 Mbit/s |

The full-snapshot path is unacceptable well before 96. It also repeats private
state to non-owners and serializes the same mostly static world over and over.
Recipient projection, delta encoding, and a persistent push transport are
capacity and correctness gates, not polish.

### Target transport budgets

The product target is **64 KiB/s average downstream per connected player**, all
application payload classes included. It is a target, not an achieved codec
measurement. The old 144 KiB/s representative and 288 KiB/s heavy figures are
retained only as sensitivity and rejection envelopes; neither is a product
budget.

```text
client_downstream = delta_bytes * delta_hz
                  + keyframe_bytes * keyframe_hz
                  + event_bytes_per_second
                  + reconnect_bytes * reconnects_per_second

match_egress = sum(client_downstream) + shared_transport_overhead
```

Static manifests are outside the steady-state stream and are fetched once by
content hash. Framing, TLS, ACKs, retransmission, and reconnect bursts must be
measured separately rather than hidden in a frame-size constant.

| Envelope | Meaning | Per-client | Match payload: 4 / 8 / 24 / 48 / 96 |
|---|---|---:|---:|
| Product average | acceptance target to prove | 64 KiB/s | 2.1 / 4.2 / 12.6 / 25.2 / 50.3 Mbit/s |
| Representative sensitivity | planning stress, not achieved target | 144 KiB/s | 4.7 / 9.4 / 28.3 / 56.6 / 113.2 Mbit/s |
| Heavy rejection | adverse envelope; normal operation here fails | 288 KiB/s | 9.4 / 18.9 / 56.6 / 113.2 / 226.5 Mbit/s |

At the product target a 45-minute match carries about 0.66/1.32/3.96/7.91/
15.82 GiB of downstream application payload at 4/8/24/48/96 players. These are
**modeled** values. A useful delta might contain nearby transforms, compact
component changes, owner-private state, a field revision, and a small event
batch; its achieved size and rate remain benchmark outputs.

Input is much smaller. At a modeled 128 wire bytes per input frame and 30 Hz:

| Humans | Input messages/s | Match ingress |
|---:|---:|---:|
| 4 | 120 | 0.123 Mbit/s |
| 8 | 240 | 0.246 Mbit/s |
| 24 | 720 | 0.737 Mbit/s |
| 48 | 1,440 | 1.475 Mbit/s |
| 96 | 2,880 | 2.949 Mbit/s |

Discrete actions should be independently reliable and rare. A heavy test must
still inject synchronized pulse, pickup, death, extraction, inventory, and
ability bursts. A globally broadcast event family is an `O(N * events)` egress
term; if events themselves grow with players, it becomes `O(N^2)`. Visibility
and aggregation therefore apply to events as well as state deltas.

### Socket queue contract

Each recipient needs an independent byte-counted send queue. The currently
accepted constants are:

- latest movement/world delta replaces an older unsent delta with the same
  baseline;
- reliable semantic events never hide behind stale state;
- 512 KiB application queue cap, including a 256 KiB reliable-event subset;
- transport hysteresis at 256 KiB high-water and 64 KiB low-water;
- at high-water, stop producing dependent deltas and schedule a fresh baseline;
- disconnect after two seconds without baseline/reliable-event progress;
- a slow recipient must never delay the simulation writer or another socket;
- expose current bytes, high-water bytes, coalesced frames, forced rebases,
  reliable-event age, and disconnect count per recipient.

These are accepted v0.4 control constants, subject to later evidence-backed
revision. The invariant is bounded bytes plus newest-useful-state coalescing.
Unbounded socket buffering converts one poor connection into match memory
growth and minutes-late consequences.

## CPU model for one logical authority

### Workload definitions

Entity counts below count Ballpark bodies, not particles or client-rendered
ASCII cells. The visual fluid remains client-side; gameplay uses compact
analytic/coarse-field truth.

| Weight | Modeled world | Activity assumption | Intended use |
|---|---|---|---|
| Light/current-shaped | Current Deep Field anchors; 160 base bodies plus one player/body each; at most 7 scavengers; bounded waves | Normal movement, few shared contacts, low event rate | Current-code regression and cheapest hosted tier |
| Representative multiplayer | 300 static/dynamic base bodies + about 6 per human; AI up to `min(2N, 96)`; 12 relevant players and 80 world bodies per recipient | 25% thrusting, 10% ability-active, regular pickups/contacts, 15 Hz deltas | Capacity-planning target for a genuinely multiplayer LBH map |
| Heavy/high-activity | 800 base bodies + about 16 per human; AI/hazards up to 192; 24 relevant players and 160 world bodies per recipient | 75% thrusting, synchronized pulses, dense swept contacts, spawn/death/pickup bursts | Adversarial event/fleet benchmark, not ordinary play |

The representative and heavy entity counts are modeled. They must become
fixtures rather than being generated by multiplying the existing map arrays;
otherwise a benchmark can accidentally test allocation or spawn setup instead
of steady-state gameplay.

### Factorized simulation-size model

Player count alone is not a useful CPU predictor. Every forecast and benchmark
must publish the independent terms below:

```text
writer_p95_ms = base
              + player_cost(P)
              + body_cost(bodies_updated)
              + broadphase_cost(candidates)
              + narrowphase_cost(contacts)
              + consequence_cost(events)
              + ai_cost(AI_agents_due)
              + field_cost(field_tiles_due)
              + world_cost(world_jobs_due)
              + GC_pause_p95
```

This is the canonical model shape. Coefficients must come from per-system
histograms on a named fixture and machine; they must not be inferred from the
low-activity admission probe. Candidate and contact counts are explicit
because a dense pileup can make two runs with identical players and bodies
cost radically different amounts. AI, field, and world terms use the number
actually due on that multirate tick, not their match-wide totals.

For orientation only, the earlier synthetic envelopes imply the following
**modeled, not measured** writer critical paths:

| Players | Representative writer p95 | Heavy writer p95 | 20 Hz verdict |
|---:|---:|---:|---|
| 24 | about 10 ms | about 21 ms | plausible; measure p99 |
| 48 | about 15 ms | about 41 ms | engineered; heavy margin is poor |
| 96 | about 24 ms | about 95 ms | R&D; heavy serial curve is infeasible |

The 96-heavy result does not become feasible by reserving 8 or 12 vCPU. A
single writer still has a 50 ms frame at 20 Hz. The writer term must fall, or
pure work must move behind deterministic worker barriers while one writer
retains commit ownership. A 30 Hz movement/contact clock is stricter: its
33.3 ms frame requires a cheaper movement kernel and lower-rate AI/world/field
jobs rather than multiplying a whole-tick curve by 30.

Billable CPU and writer latency are separate forecasts:

```text
mean_billable_cores = sum(mean_lane_cpu_ms * lane_hz) / 1000
writer_gate         = p95/p99 wall time of the serial commit path
```

Mean CPU sizes a reservation and bill. It cannot prove the p95/p99 writer gate;
conversely, summing p95 subsystem times overstates ordinary billable CPU.
Publish both, plus worker utilization and synchronization wait. The remedies
for an over-budget writer, in order, are:

1. reduce avoidable `N^2` work with spatial queries and bounded neighbor sets;
2. stop rebuilding duplicate object graphs and full JSON snapshots;
3. move recipient projection/encoding/compression off the simulation writer;
4. schedule expensive AI/world systems at lower explicit clocks;
5. reduce the movement clock or activate run-wide time dilation honestly;
6. only then consider a faster native/WASM kernel for proven hotspots.

Node documents worker threads as useful for CPU-intensive JavaScript and notes
that they can share or transfer array buffers. That supports codec/projection
workers, but the one-writer rule still requires the authoritative state
transition to stay ordered
([Node worker threads](https://nodejs.org/api/worker_threads.html)).

### Recipient projection and serialization CPU

Projection has shared work and recipient work; treating all of it as a single
per-client constant either repeats shared scans or hides expensive privacy/AOI
selection:

```text
projection_cpu = shared_dirty_pack
               + P * (recipient_select + private_merge + delta_encode)
               + changed_bytes * compression_cpu_per_byte
               + keyframe_bytes * keyframe_compression_cpu_per_byte
```

Measure compression separately by codec, level, and payload class. Its ratio,
CPU, allocation, and latency are outputs, not a free multiplier. Shared dirty
packing may run once against the frozen committed frame; private merge and
baseline selection remain per recipient. Report mean worker CPU for placement
and p95/p99 completion time against the next writer barrier.

Projection must query from a frozen end-of-tick view or packed component
arrays. Ninety-six independent projections must not mutate Ballpark query
counters or shared gameplay state in a way that changes the next tick.

### Heap and state targets

The measured 96-player low-activity process used 17.1 MiB V8 heap and 108.2 MiB
RSS, but that does not include WebSocket objects, per-recipient baselines,
binary dictionaries, high event volume, or a long soak. Use these host-level
steady-state targets, with a separate 2x failure/GC margin in placement:

| Weight | State/heap planning formula | 4 / 8 / 24 / 48 / 96 target |
|---|---|---:|
| Light | `64 MiB + 0.35 MiB*N` | 65 / 67 / 72 / 81 / 98 MiB |
| Representative | `96 MiB + 1.0 MiB*N` | 100 / 104 / 120 / 144 / 192 MiB |
| Heavy | `192 MiB + 3.0 MiB*N` | 204 / 216 / 264 / 336 / 480 MiB |

Do not retain 32 full projected baselines for every recipient. At 96 clients,
32 copies of an 8 KiB projected frame is already 24 MiB of encoded payload,
before JavaScript object overhead; 32 copies of the measured 265.62 KiB shared
snapshot per recipient would be about 797 MiB of raw bytes. Retain one packed
canonical keyframe/delta history plus each client's baseline/event cursors and
the minimum owner-private recovery state.

## Safe host envelopes

These are conservative capacity-test starting points, not cloud SKU promises.
Network values are sustained usable egress for the match process, not a
provider's marketing link speed. Memory includes runtime margin, not an entire
host OS fleet.

| Population | Representative safe start | Heavy/high-activity safe start | Verdict |
|---:|---|---|---|
| 4 | 1 vCPU, 512 MiB, 100 Mbit/s | 1 vCPU, 1 GiB, 100 Mbit/s | Straightforward after transport conversion |
| 8 | 1 vCPU, 512 MiB, 100 Mbit/s | 2 vCPU, 1 GiB, 250 Mbit/s | First production target |
| 24 | 2 vCPU, 1 GiB, 250 Mbit/s | 2 vCPU, 2 GiB, 500 Mbit/s | Plausible large-crew tier |
| 48 | 2 vCPU, 1 GiB, 500 Mbit/s | 4 vCPU, 2 GiB, 1 Gbit/s | Needs dedicated sim core and projection worker |
| 96 | 4 vCPU, 2 GiB, 1 Gbit/s | 8–12 vCPU, 4 GiB, 2.5 Gbit/s **only after writer optimization** | R&D; heavy serial writer remains infeasible |

At 48–96, reserve one physical/core-equivalent lane for the simulation writer;
do not pack it according to average host CPU alone. Use other cores for gateway,
projection, encoding, compression, logging, and persistence. A logical match
authority may span those workers while retaining exactly one gameplay writer.

Host packing must take the minimum capacity across writer lanes, mean billable
CPU, memory, egress, and packets per second—not vCPU alone:

```text
matches_per_host = min(writer_lanes,
                       floor(cpu_budget / mean_match_cpu),
                       floor(memory_budget / reserved_match_memory),
                       floor(egress_budget / match_egress),
                       floor(pps_budget / match_pps))
```

At 64 KiB/s and an illustrative 1,200-byte payload per packet, downstream is
about 55 packets/client/s. Adding 30 input packets/client/s and 25% control/
ACK margin yields roughly 2.5k/5.1k/10.2k aggregate PPS for 24/48/96-player
matches before retransmission. These are **modeled sizing values**, not packet
captures. Validate them on production TLS and gateway paths. A 48-player match
gets a dedicated writer lane until noisy-neighbor evidence allows otherwise;
a 96-player experiment gets a dedicated writer lane plus explicit worker
capacity.

Cloudflare Durable Objects are conceptually attractive as one object per match,
but a 128 MiB object is a non-fit for the representative 96-player memory model:
the planning target is 192 MiB before the required failure/GC margin. Durable
Objects therefore remain a 4–8-player experiment, not a high-count placement
claim. Provider limits do not substitute for this benchmark. Current official
limits allow long active CPU windows per request/message and 32 MiB received
WebSocket messages; the relevant unanswered question is sustained per-object
CPU, timer regularity, egress cost, and isolation under the actual LBH loop
([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).
Run the same fixture on the intended platform before assigning a population.

## Nonlinear and burst terms

The following can turn an apparently linear match into a cliff:

- **All-player loops:** any contact or force loop over all other players is
  `O(N^2)` unless neighbor-bounded.
- **Player-created bodies:** decoys, eddies, pulses, wreck drops, projectiles,
  and wave rings make entity count proportional to players times ability rate.
- **Union relevance:** current relevance queries once per player/category,
  then deduplicates into one shared world union. Per-recipient projection also
  queries per player, but cannot reuse the union if privacy/AOI differs.
- **Global events:** event production proportional to N and broadcast to N is
  quadratic egress and serialization.
- **Dense swept contact:** broadphase is cheap only if spatial buckets remain
  sparse; a fleet stacked on one portal/wreck produces a large candidate set.
- **Ballpark rebuild/allocation:** the mirror collects desired bodies,
  synchronizes registry entries, lists/filter-counts bodies, and rebuilds or
  updates the index every tick. Allocation/GC can dominate before arithmetic.
- **Full snapshot clone/ring:** `JSON.stringify`/`parse` cloning turns state
  size, history depth, and request fanout into allocation pressure.
- **Compression:** compression ratio may improve with count while CPU and
  head-of-line delay worsen. Benchmark on the actual binary schema.
- **Slow recipients:** without bounded/coalescing queues, memory is
  `O(N * queued_history)` and has no useful upper bound.
- **Reconnect storms:** keyframe generation, authentication, and event replay
  can coincide after a gateway or regional network flap.
- **Persistence bursts:** 96 simultaneous deaths/extractions/profile commits
  must not block the gameplay writer.

## Benchmarks required before claiming support

### Instrumentation gate

Expose p50/p95/p99 and max for total tick and every scheduled system, plus:

- event-loop utilization and p95/p99 delay;
- Ballpark collect, synchronize, index, and query time separately;
- inbox depth/age and accepted/rejected/coalesced input counts;
- candidates and narrowphase contacts per player/body family;
- canonical state bytes, projected bytes, encode/compress time, and keyframe
  time;
- per-socket queue bytes/age, forced rebase, and disconnects;
- heap used, RSS, allocation rate, minor/major GC pause, and retained baseline
  bytes;
- outbound payload and wire bytes per message class;
- event production/fanout by visibility lane;
- effective clocks and overload reason components.

Use Node's event-loop utilization and delay measurement APIs rather than
inferring CPU health from request latency alone
([Node performance hooks](https://nodejs.org/download/release/latest-jod/docs/api/perf_hooks.html)).

### Fixture matrix

Run every weight at 4, 8, 24, 48, and 96 humans for at least 30 minutes, plus a
six-hour representative soak at the claimed maximum. Each run needs:

1. scripted 30 Hz input from every client with deterministic movement routes;
2. distributed and intentionally stacked fleet positions;
3. synchronized ability/pulse/decoy/wave bursts;
4. contested wreck pickup and portal contact in the same ticks;
5. mass death/extraction and durable-result settlement;
6. 1%, 3%, and 5% loss; 30/80/150 ms RTT; 10/30/80 ms jitter; and bandwidth
   clamps;
7. one deliberately slow recipient and a 25% reconnect storm;
8. compression on/off and JSON/binary codec comparison;
9. production TLS and the real gateway/provider path;
10. a failure injection proving a projection/codec worker crash cannot create
    a second gameplay writer.

### Acceptance thresholds

- p95 tick cost below 50% and p99 below 70% of the movement tick budget in
  representative play;
- no tick over 100% of budget for more than two consecutive ticks before an
  explicit overload transition;
- simulation event-loop p99 delay below one movement tick;
- no unbounded growth in heap, event journal, canonical history, or any socket
  queue;
- representative delta p95 at or below 8 KiB and heavy p95 at or below 16 KiB;
- keyframe p95 below 64 KiB for a normal recipient, unless static manifests
  are being transferred separately;
- input-to-authority p95 within one network RTT plus two simulation ticks;
- no recipient sees another player's private snapshot fields or events;
- heavy 96 either meets its 20 Hz budget after optimization or advertises and
  visibly enters a lower clock/time-dilation tier. It must not silently lag.

## Bottom line

One logical authority per match remains the right model from 4 through 96.
The number of concurrent matches scales the number of authorities; it does not
change the single-writer rule inside a match.

The current implementation's compute and memory are not the immediate blocker
in a low-activity 96-client loopback probe. Full JSON fanout is: the **measured**
shape would exceed 1.25 Gbit/s payload egress at the base Deep Field snapshot
rate. The product target is a **modeled** 64 KiB/s average per client, or about
50.3 Mbit/s of 96-player match payload before transport overhead. That target
still needs recipient-specific deltas, strict queue bounds, and evidence.

For simulation, the factorized planning envelope puts representative 96 near
24 ms p95 and heavy 96 near 95 ms against a 50 ms/20 Hz frame. These are
modeled orientations, not measurements. The honest boundary is unchanged:
24 is plausible, 48 is engineered, and 96 is R&D. Heavy 96 cannot be rescued
by assigning 12 vCPU while its writer remains serial; writer work must fall or
parallelize deterministically without creating a second gameplay writer.
