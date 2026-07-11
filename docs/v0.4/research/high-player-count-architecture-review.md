# High-Player-Count Match Authority Review

> Research memo for `codex/v0.4-multiplayer-architecture`, 2026-07-10.
> This pressure-tests one match at 24, 48, and 96 simultaneous clients. It
> extends the 4–8-player v0.4 target; it is not a product promise or an
> implementation claim.

## Decision

Preserve **one logical authority per match** at 24, 48, and 96 players.
Concurrent matches get independent authorities. At 96, that logical authority
should normally be one isolated, multi-threaded service: one canonical writer
owns the run clock and commits state, while a bounded worker pool performs
pure or read-only jobs against an immutable tick input. It should not be 96
clients sharing several independently writable region servers.

The recommended staircase is:

- **4–8 players:** one Node process, one writer thread, complete public-world
  deltas if measurement permits, and owner-private projection.
- **24 players:** one isolated match process remains the default. Owner/public
  projection and delta encoding are mandatory. Build AOI and replication
  prioritization now, although a deliberately global player lane may remain.
- **48 players:** one logical authority, normally one dedicated match process
  or container. Spatial AOI, per-lane rates, dirty-state replication, bounded
  per-client queues, and process isolation are mandatory. Projection/encoding
  may move to workers; gameplay still commits on one writer.
- **96 players:** one logical authority in one isolated multi-threaded service,
  normally with the host or CPU allocation dedicated to the match. The writer
  owns tick admission, ordering, conflict resolution, state commit, event
  stamping, and result settlement. Workers may calculate field tiles, AI
  sensing, broad-phase candidates, recipient projections, quantization, and
  packet assembly. They return results tagged with tick and input revision;
  only the writer applies them at a deterministic barrier.

Do not split write authority merely because the participant count reaches 96.
Reopen multi-authority region sharding only if an optimized worker-backed
authority cannot meet the chosen clock on the intended largest simulation, or
if the product becomes a persistent world whose distant regions are genuinely
independent. Player count alone is not evidence that distributed writes are
worth cross-region contact, migration, rollback, and split-brain complexity.

## What “one authority” means

One logical authority is an ownership and ordering contract, not necessarily
one operating-system thread:

1. One run has one `run_id`, authority epoch, canonical clock, input order, and
   state revision.
2. Exactly one writer commits each tick. It is the only component allowed to
   change movement, contact, death, loot, signal, extraction, inventory,
   outcomes, or the event journal.
3. Internal workers consume an immutable tick snapshot or narrowly declared
   job input. Their output is a proposal, candidate set, encoded projection, or
   deterministic reduction—not committed game state.
4. The writer rejects late, wrong-revision, or duplicate worker results. A
   worker crash can shed/defer its lane or abort the run; it cannot promote
   itself into a second authority.
5. The control plane places, fences, drains, and replaces match services, but
   does not participate in the hot gameplay tick.

This retains the useful EVE/Ballpark idea: a coarse authority unit with honest
overload behavior. CCP's public Time Dilation description says overload should
keep the task queue near zero and slow the shared clock instead of allowing
unfair, arbitrarily delayed work. CCP also emphasized that multithreading
increases capacity by less than intuition suggests and does not remove the
need to bound load
([Introducing Time Dilation](https://www.eveonline.com/news/view/introducing-time-dilation-tidi)).
The follow-up reported more than 1,300 players remaining responsive under TiDi
on both reinforced and normal nodes
([Time Dilation – How's That Going?](https://www.eveonline.com/news/view/time-dilation-hows-that-going)).
That is evidence for a stable authority plus graceful degradation, not evidence
that LBH needs EVE's scale or runtime.

## Current LBH baseline and its implications

The v0.3 Deep Field baseline is already multirate:

- 10 Hz main tick, 6 Hz snapshots;
- 4 Hz world/portal/field, 2 Hz growth, 6 Hz scavengers;
- coarse field enabled;
- 20 wells, 22 stars, 40 wrecks, 14 planetoids before dynamic bodies;
- 107.88 KiB p95 full JSON snapshot in the latest roadmap evidence;
- 7.74 observed ticks/s against the then-current 8 Hz evidence target;
- 5.72 ms p95 snapshot request latency and 1.555 ms p95 Ballpark sync.

The existing code also contains several operations whose cost rises with
players: per-player force/contact work, player-to-player pulse scans, AI
competition scans, sentry/fauna target scans, and recipient relevance. Some
are direct all-player loops and become quadratic when nested under players or
AI. Ballpark provides the right spatial primitive, but it does not make every
current hot path spatial automatically.

Therefore none of the tables below should be read as a capacity claim. The
current measurements are a one-client baseline at a lower clock. The 24/48/96
numbers are falsification forecasts that define what must be measured.

## Network forecast

### Three wire shapes

The following forecasts use decimal MB/GB. They exclude TLS/WebSocket/IP
overhead, retransmission, handshake, voice, logs, and control-plane traffic.

1. **Current full snapshot:** 107.88 KiB repeated at nominal Deep Field 6 Hz
   to every recipient.
2. **v0.4 compact target:** 65 KB/s/player from the existing architecture
   envelope (15 Hz 3 KiB deltas, 1 Hz 16 KiB keyframe, inputs/events).
3. **Illustrative all-player transform lane:** 48 bytes per other player at
   20 Hz plus 20 KB/s/client for compact environment/events. This is not a
   codec promise; it exposes the quadratic egress term when every player is
   globally visible.

| Players | Current full snapshot | Compact target | Compact 45-minute run | Illustrative global-player lane |
|---:|---:|---:|---:|---:|
| 24 | 15.9 MB/s / 127 Mb/s | 1.56 MB/s / 12.5 Mb/s | 4.21 GB | 1.01 MB/s |
| 48 | 31.8 MB/s / 255 Mb/s | 3.12 MB/s / 25.0 Mb/s | 8.42 GB | 3.13 MB/s |
| 96 | 63.6 MB/s / 509 Mb/s | 6.24 MB/s / 49.9 Mb/s | 16.85 GB | 10.68 MB/s |

At nominal 6 Hz, the current full snapshot would move roughly 43, 86, and 172
GB for a 45-minute 24/48/96-player match. The roadmap's observed 0.33 MB/s
single-recipient estimate is lower because the measured authority was running
below nominal cadence; it must not be multiplied into a capacity promise.

### Network decisions by count

#### 24 players

- Owner-private versus public projection is mandatory before untrusted play.
- Static map manifests and unchanged state must leave the hot stream.
- Delta encoding and bounded send queues are mandatory for a hosted product.
- A complete public player-transform lane can remain if game design requires
  global awareness and the measured all-in rate stays below **80 KB/s/client
  p95** and **2 MB/s/match p95**.
- AOI infrastructure should exist for world/AI/body families. It may remain a
  semantically conservative no-op for player silhouettes or globally relevant
  threats.

#### 48 players

- Spatial AOI is mandatory for ordinary world bodies, AI, transient waves,
  VFX descriptors, and detailed state.
- Global lanes must be tiny and semantic: match clock, overload state, team or
  objective summaries, major anomaly/portal announcements, and optionally
  low-rate player dots.
- Public player transforms may be global only at a lower far-lane rate and
  quantization. Nearby interaction state remains in the fast lane.
- Target **<=80 KB/s/client p95**, **<=4 MB/s/match p95**, with a hard queue
  policy that coalesces state, forces rebase, then disconnects a persistently
  slow client.

#### 96 players

- AOI, priority accumulation, dirty-component masks, binary quantization, and
  multi-rate replication are mandatory.
- A full-rate all-player lane is rejected: even the illustrative 48-byte
  transform record creates 8.76 MB/s of transform egress before environment,
  events, overhead, or loss.
- Keep a near lane at 15–20 Hz, a middle lane at 5–10 Hz, and a far/global lane
  at 1–2 Hz or semantic-event-only. The exact radii are game-design inputs, not
  networking constants.
- Target **<=64 KB/s/client p95** and **<=6.5 MB/s/match p95** in normal load.
  Treat **8 MB/s sustained** as a rejection threshold for the 96-player mode
  until unit economics explicitly approve more.

Epic's official Replication Graph documentation is relevant historical
evidence: Fortnite's cited case starts with 100 clients and about 50,000
replicated actors, and Epic identifies per-actor/per-connection evaluation as
the CPU bottleneck. Its answer is persistent shared replication lists rather
than recomputing every actor for every connection
([Replication Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/replication-graph-in-unreal-engine)).
Epic's newer Iris design similarly keeps a quantized copy of replicated state,
tracks per-connection state, filters, prioritizes, and shares work across
connections
([Introduction to Iris](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-iris-in-unreal-engine)).
LBH should copy the pattern, not adopt Unreal: persistent Ballpark lane lists,
dirty quantized state once per tick, then cheap per-recipient selection.

## Server-side performance forecast

### Forecast model

For a 30 Hz player/contact clock, one frame is 33.3 ms. The v0.4 hosted gate
proposes p95 <=20 ms and p99 <=28 ms, leaving headroom for jitter and host
contention. Two deliberately simple forecasts expose the risk:

```text
tick CPU ms = base + perPlayer * P + pairCost * P*(P-1)/2

bounded/lean: base 3 ms, perPlayer 0.08 ms, pairCost 0.002 ms
heavy:        base 8 ms, perPlayer 0.20 ms, pairCost 0.006 ms
```

“Lean” assumes spatial candidate selection, cached/dirty state, bounded active
bodies, coarse fields, and few expensive AI decisions. “Heavy” represents a
larger active body set, denser player interaction, more AI/sensing, and more
field/consequence work. These coefficients are planning assumptions, not
benchmarks. The `reserved vCPU` column converts total CPU using
`tickCpuMs * 30 / 1000 / 0.60`, reserving 40% headroom.

| Players | Lean CPU/tick | Lean reserved vCPU | Heavy CPU/tick | Heavy reserved vCPU | Single-writer 30 Hz verdict |
|---:|---:|---:|---:|---:|---|
| 24 | 5.5 ms | 0.27 | 14.5 ms | 0.72 | Plausible in one process |
| 48 | 9.1 ms | 0.45 | 24.4 ms | 1.22 | Heavy case misses 20 ms p95; optimize or offload projection/jobs |
| 96 | 19.8 ms | 0.99 | 54.6 ms | 2.73 | Heavy case cannot run 30 Hz on one JS thread |

The vCPU conversion is total compute demand, not critical-path latency. A
54.6 ms tick still misses a 33.3 ms frame on one writer even if the machine has
many idle cores. Parallelism only helps the part that is independent.

### Heavier simulation envelopes

High player count and high simulation size are separate axes. Every benchmark
must publish both. Use at least these envelopes:

| Envelope | Dynamic/interactive bodies | Expensive AI agents | Field | Required populations |
|---|---:|---:|---|---|
| `H24` | 400 | 48 | coarse, <=4 Hz | 24 humans |
| `H48` | 900 | 96 | tiled coarse, <=6 Hz | 48 humans |
| `H96` | 1,800 | 192 | tiled coarse, <=6 Hz | 96 humans |
| `X96` | 3,000 | 384 | disturbance-heavy | 96 humans stress/overload |

These are capacity probes, not recommended content counts. Each run must report
per-system p50/p95/p99 wall time and CPU time for inbox, Ballpark sync/index,
movement/flow, broad phase, narrow phase/consequences, AI, field, projection,
encoding, socket queues, GC, and total tick. A pass based only on average tick
rate is rejected.

### Mandatory server changes and thresholds

#### 24 players

- Keep one writer thread and one match process.
- Replace nested all-player scans in pulse, targeting, competition, fauna,
  sentry, and contact paths with Ballpark candidate queries where semantics
  permit.
- Maintain existing multirate world/AI/field/growth schedules.
- Process isolation is mandatory for public hosting unless the scheduler can
  provide equivalent CPU/memory quotas and crash fencing.
- Pass when `H24` holds 30 Hz with tick p95 <=20 ms, p99 <=28 ms, GC pause p99
  <=4 ms, and no debt >250 ms. If not, do not add threads first; profile and
  remove accidental O(P^2), rebuilds, and allocation.

#### 48 players

- One match service remains one writer, but recipient projection/encoding is a
  valid first worker job because it consumes a frozen frame and cannot affect
  gameplay truth.
- Move field-tile rebuild, broad-phase bucket construction, or AI perception
  to workers only after traces show they dominate and deterministic input/
  output fixtures exist.
- Give a 48-player heavy match a dedicated CPU quota; do not pack it beside
  unrelated matches until noisy-neighbor tests prove p99 headroom.
- Reject release if more than 10% of normal ticks enter reduced replication,
  if TiDi is required in ordinary `H48`, or if any worker result can mutate
  state after its tick barrier.

#### 96 players

- Use one isolated multi-threaded service with one canonical writer and a
  fixed worker pool. Node's own documentation says worker threads are intended
  for CPU-intensive JavaScript and can share/transfer array buffers
  ([Node worker threads](https://nodejs.org/api/worker_threads.html)). Use a
  long-lived pool; never create workers per tick.
- Target **serial writer work <=8 ms p95** and **total CPU <=40 ms/tick p95**.
  With 75% of a 40 ms workload parallelizable across four workers, the idealized
  critical path is about 17.5 ms before synchronization overhead. That fits the
  20 ms target narrowly; a 55 ms heavy tick does not.
- Keep collision/consequence resolution and final reductions on the writer.
  Workers can return sorted candidate pairs, but ordering and application use
  canonical public-id/handle tie-breakers.
- Dedicate at least 4 vCPU to the first `H96` benchmark and test 6/8 vCPU. This
  is a benchmark allocation, not a hosting forecast; measured total CPU and
  parallel efficiency determine the production reservation.
- If `H96` cannot hold p95 <=20 ms/p99 <=28 ms after removing quadratic scans,
  persistent dirty-state projection, bounded active sets, and worker offload,
  choose one of three honest product actions: lower the movement clock after a
  blind feel test, reduce active simulation density, or cap the mode below 96.
  Do not hide normal-load failure behind permanent TiDi.

## Overload and TiDi policy

An overload ladder is mandatory before any 24+ public mode, but participant
count must not directly trigger it. Tick debt, queue bytes, CPU, GC, and worker
deadlines trigger it:

1. `NORMAL`: full approved rates.
2. `SHED_PRESENTATION`: drop/coalesce debug, telemetry detail, VFX descriptors,
   and far-lane cosmetic updates.
3. `REDUCE_FAR_LANES`: lower far AOI and keyframe cadence; preserve owner and
   near-contact truth.
4. `REDUCE_BACKGROUND`: lower AI deliberation, spawn, growth, field, and other
   explicitly multirate work without changing already-active contact rules.
5. `DILATED`: reduce one shared gameplay `timeScale`; publish it visibly and
   apply it symmetrically.
6. `ABORT`: interrupt and settle/void under declared rules before causality or
   memory safety is lost.

Recommended initial triggers, to be tuned from traces:

- enter shedding when tick p99 exceeds 28 ms for 30 of 60 ticks, debt exceeds
  100 ms, or aggregate socket queues exceed two seconds of the match budget;
- enter TiDi when tick debt exceeds 250 ms or p99 exceeds the frame period for
  five seconds after shedding;
- recover one step only after 30 seconds below p95 16 ms and debt below 50 ms;
- abort if `timeScale <0.5` would be required for more than 60 seconds in a
  normal published mode, or if debt exceeds two seconds.

TiDi is a safety valve and an event-mode feature, not a substitute for sizing.
Normal `H24`, `H48`, and `H96` benchmark runs must pass without it. The `X96`
stress run should prove that overload is fair, bounded, visible, and recoverable.

## When sharding becomes justified

### Not justified by 96 players alone

Do not create multiple writable spatial authorities for a single match while:

- players can cross the toroidal world quickly;
- waves, wells, Inhibitor pressure, portals, and extraction have run-wide
  effects;
- pulse, slingshot, contact, and AI can cross a region boundary within one or a
  few ticks;
- the match is short-lived and all participants share one outcome clock.

Those properties make region boundaries hot, mobile, and gameplay-visible.
Distributed regions would require ownership transfer, ghost entities,
cross-shard collision, time synchronization, event ordering, rollback or
compensation, and fencing. That is a larger product architecture, not a CPU
optimization.

### Reopen the decision only when all are true

1. The `H96` or larger intended content envelope still misses the tick budget
   after algorithmic fixes and internal parallelism.
2. Traces show the limiting work is spatially partitionable gameplay, not
   projection, encoding, GC, one global system, or an accidental scan.
3. At least 95% of interactions remain within a stable region for >=10 seconds,
   and cross-region interactions fit a declared latency/rollback contract.
4. The design accepts visible region handoff or can prove transparent handoff
   under 180 ms RTT, loss, reconnect, and process failure.
5. A prototype beats the single-authority service by at least 2x at equal
   correctness and operational headroom. A marginal win does not pay for the
   new failure modes.

Even then, prefer **one logical authority across internal workers** before
multi-host writers. A coordinator can assign deterministic body partitions to
workers, gather proposed next-state fragments, resolve cross-partition contacts,
and commit once. That is a staged route toward parallel simulation without
weakening canonical ownership.

## Required benchmark matrix

Every 24/48/96 claim should run this matrix on one isolated host and then under
packing/noisy-neighbor conditions:

- quiet spread, all players distributed;
- one dense pileup with maximum pulses/abilities;
- route-anchor contention around one well/wreck/portal;
- Inhibitor plus maximum relevant AI/fauna/sentries;
- join/leave/reconnect burst;
- one slow client and one lossy client;
- 45-minute normal soak and 90-minute churn soak;
- worker crash/late-result injection;
- `X96` overload and recovery.

Record application bytes and packet-capture bytes, not JSON string size alone.
Record total CPU, per-thread CPU, event-loop delay, worker queue delay, RSS,
heap, GC pauses, allocations/tick, tick debt, correction error, contact parity,
and per-client queue peaks. Use the same seed/input trace across process-only
and worker-backed builds.

## Final scaling staircase

| Gate | Architecture | Mandatory mechanisms | Reject or change direction when |
|---|---|---|---|
| 4–8 | one process, one writer | owner/public projection, bounded queues | normal tick misses product gate |
| 24 | one isolated process, one writer | deltas, static manifest, multirate sim, spatial query cleanup, AOI-ready lanes | >80 KB/s/client, >2 MB/s/match, or `H24` p95 >20 ms after profiling |
| 48 | one isolated match service; optional codec/job workers | AOI, dirty binary state, priorities, far lanes, process quota, overload ladder | normal TiDi, >4 MB/s, or serial hot path dominates after projection offload |
| 96 | one logical authority, canonical writer plus fixed internal workers | all above, deterministic barriers, dedicated CPU allocation, worker fencing | serial p95 >8 ms, total CPU >40 ms/tick, p99 >28 ms, >6.5 MB/s normal, or feel requires unsustainable clock |
| beyond 96 / much larger world | benchmark first | stable spatial independence and handoff proof | multi-writer prototype fails 2x-benefit and correctness gates |

The product-safe conclusion is specific: **24 is still a conventional single
process; 48 is the point where isolation, AOI, and replication workers become
operationally serious; 96 should be one logical authority implemented as a
multi-threaded service with one canonical writer.** Physical multi-server
sharding remains rejected until measured simulation—not ambition—forces it.

