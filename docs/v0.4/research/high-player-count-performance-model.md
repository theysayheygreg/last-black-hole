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
- treat 96 as an experimental fleet-event tier. A representative workload is
  plausible on a four-vCPU class host, but the heavy model does not fit one
  20 Hz simulation writer without optimization, reduced cadence, or honest
  time dilation;
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

The following are wire-shape planning targets, including a 20% allowance for
framing and ordinary overhead but not pathological loss. “Snapshot” means an
average relevant delta; a larger keyframe is sent around once per second or on
rebase.

| Sim weight | Modeled average delta | Delta Hz | Per-client downstream | Match egress: 4 / 8 / 24 / 48 / 96 |
|---|---:|---:|---:|---:|
| Light/current-shaped | 4 KiB | 10 | 0.393 Mbit/s | 1.6 / 3.1 / 9.4 / 18.9 / 37.7 Mbit/s |
| Representative multiplayer | 8 KiB | 15 | 1.180 Mbit/s | 4.7 / 9.4 / 28.3 / 56.6 / 113.2 Mbit/s |
| Heavy/high-activity | 16 KiB | 15 | 2.359 Mbit/s | 9.4 / 18.9 / 56.6 / 113.2 / 226.5 Mbit/s |

These are budgets, not claims that the codec already achieves them. A useful
8 KiB representative frame might contain 12 nearby players, 48–80 dynamic
bodies, compact component deltas, the recipient's exact private state, a field
revision, and a small event batch. Static map data should be sent once by
content hash. Exact cargo, equipment, consumables, hidden cooldowns, and exact
signal for other players should not be projected.

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

Each recipient needs an independent byte-counted send queue:

- latest movement/world delta replaces an older unsent delta with the same
  baseline;
- reliable semantic events never hide behind stale state;
- at 256 KiB queued, stop producing dependent deltas and schedule a fresh
  baseline;
- at 1 MiB queued or two seconds without baseline/event progress, disconnect
  the slow client with a resumable reason;
- a slow recipient must never delay the simulation writer or another socket;
- expose current bytes, high-water bytes, coalesced frames, forced rebases,
  reliable-event age, and disconnect count per recipient.

The exact 256 KiB/1 MiB thresholds are targets to tune under emulation. The
invariant is bounded bytes plus newest-useful-state coalescing. Unbounded
socket buffering converts one poor connection into match memory growth and
minutes-late consequences.

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

### Tick-cost formulas

Until the runtime exports per-system histograms, use these transparent p95
planning curves in milliseconds:

```text
Light:          T(N) = 2.0 + 0.060N + 0.0006N^2, at 15 Hz
Representative: T(N) = 3.5 + 0.160N + 0.0015N^2, at 20 Hz
Heavy:          T(N) = 8.0 + 0.350N + 0.0045N^2, at 20 Hz
```

The intercept covers world/field/AI schedules amortized onto a simulation
tick. The linear term covers inbox drain, per-player movement, forces,
contacts, private state, and Ballpark synchronization. The quadratic term is a
risk allowance for player-player or player-created-body contention and union
relevance work. These coefficients are **modeled targets**, not regression
fits to the short probe.

Tick headroom is `tick_budget_ms / projected_p95_tick_ms`. Core utilization is
`tick_ms * tick_hz / 10` percent of one core before networking/projection.

| Humans | Light p95 / headroom / core | Representative p95 / headroom / core | Heavy p95 / headroom / core |
|---:|---:|---:|---:|
| 4 | 2.25 ms / 29.63x / 3.4% | 4.16 ms / 12.01x / 8.3% | 9.47 ms / 5.28x / 18.9% |
| 8 | 2.52 ms / 26.47x / 3.8% | 4.88 ms / 10.25x / 9.8% | 11.09 ms / 4.51x / 22.2% |
| 24 | 3.79 ms / 17.61x / 5.7% | 8.20 ms / 6.09x / 16.4% | 18.99 ms / 2.63x / 38.0% |
| 48 | 6.26 ms / 10.65x / 9.4% | 14.64 ms / 3.42x / 29.3% | 35.17 ms / 1.42x / 70.3% |
| 96 | 13.29 ms / 5.02x / 19.9% | 32.68 ms / 1.53x / 65.4% | **83.07 ms / 0.60x / 166.1%** |

The companion architecture memo recommends falsifying a 30 Hz
movement/contact microtick. Holding these same p95 costs at 30 Hz produces the
following sensitivity result:

| Humans | Representative at 30 Hz | Heavy at 30 Hz |
|---:|---:|---:|
| 4 | 12.5% core / 8.01x headroom | 28.4% / 3.52x |
| 8 | 14.6% / 6.83x | 33.3% / 3.01x |
| 24 | 24.6% / 4.07x | 57.0% / 1.76x |
| 48 | 43.9% / 2.28x | **105.5% / 0.95x** |
| 96 | **98.0% / 1.02x** | **249.2% / 0.40x** |

Thus 30 Hz representative 96 is not a safe target on one writer using this
curve: average scheduling, garbage collection, or one burst would miss. A
30 Hz 96-player tier needs a cheaper movement-only kernel than the whole-tick
curve, explicit lower-rate world systems, and measured p99 margin. Heavy 48
also crosses the boundary at 30 Hz.

Representative 96 is possible on paper but has inadequate production margin
if the same event loop also encodes and writes 96 streams. Heavy 96 is
mathematically outside a 50 ms/20 Hz tick before transport work. More vCPUs do
not make one JavaScript writer execute faster. The remedies, in order, are:

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

Model uncompressed projection/encoding cost per recipient frame as:

```text
frame_cpu_ms = query_and_diff_ms + frame_bytes / 50 MiB_per_second * 1000
projection_cores = frame_cpu_ms * delta_hz * recipients / 1000
```

At query/diff assumptions of 0.08/0.12/0.20 ms for light/representative/heavy,
the 96-player results are approximately 0.15, 0.40, and 0.74 cores. This is a
planning floor. Generic JSON construction, garbage collection, compression,
TLS copies, and socket callbacks can multiply it. Measure binary encoding with
and without compression; do not enable per-frame compression by instinct.

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
| 96 | 4 vCPU, 2 GiB, 1 Gbit/s | 8 vCPU, 4 GiB, 2.5 Gbit/s **after optimization** | Representative plausible; heavy fails current 20 Hz curve |

At 48–96, reserve one physical/core-equivalent lane for the simulation writer;
do not pack it according to average host CPU alone. Use other cores for gateway,
projection, encoding, compression, logging, and persistence. A logical match
authority may span those workers while retaining exactly one gameplay writer.

Cloudflare Durable Objects are conceptually attractive as one object per match,
but provider limits do not substitute for this benchmark. Current official
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
in a low-activity 96-client loopback probe. Full JSON fanout is: the measured
shape would exceed 1.25 Gbit/s payload egress at the base Deep Field snapshot
rate. Recipient-specific binary deltas reduce the representative 96-player
planning case to about 113 Mbit/s plus keyframes/events, but they add projection
CPU and require strict queue bounds.

For simulation, the representative planning curve fits 96 at 20 Hz with only
1.53x p95 tick headroom before transport work; the heavy curve reaches 83 ms
against a 50 ms budget and fails. That is the honest boundary: 24 looks
comfortable, 48 is credible with isolation and offloaded projection, and 96 is
a distinct engineered tier whose heavy case still needs evidence and likely
optimization or time dilation.
