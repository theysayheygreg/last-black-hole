# High-Player-Count Match Authority Cost Model

> Research snapshot: 2026-07-10. All vendor inputs are public list prices,
> not quotes. All LBH CPU, memory, packing, and larger-match traffic values are
> forecasts until the benchmark gates in this document produce measurements.

## Executive answer

LBH's production unit is **one dedicated logical authority per match, multiplied
by the number of concurrent matches**. It is not one global authority and it
does not require one physical machine per match.

```text
live authorities = live matches
live matches ~= player CCU / average occupied seats per match
hosts = ceil(live authorities / measured safe authorities per host)
        plus regional warm and failure capacity
```

Each match has exactly one fenced single writer for gameplay truth. A physical
VM, container host, or fleet instance may safely pack several isolated match
authorities when measurement proves it. A large match may instead consume most
or all of a multi-core host. Parallel worker/native jobs may calculate coarse
field tiles, broadphase candidates, recipient projections, or encoding, but
only the match authority commits the tick. “One authority” therefore means one
causal owner, not one machine, one global process, or necessarily one CPU core.

The immediate product target remains 4–8 players. A 24-player match looks
plausible on ordinary small dedicated compute if recipient deltas are bounded.
Forty-eight and 96 players are technically possible, but they are separate
performance products: they require multi-core authority work, hard AOI limits,
bounded AI/ecology, per-recipient serialization budgets, and their own feel and
overload gates. Do not advertise those seat counts from spreadsheet evidence.

At the 64 KiB/s target, a 96-player match emits about 22.65 GB/hour, 6.29
MB/s, or 50.3 Mbit/s of state. At today's 1.08 MB/s full-JSON Shallows-style
ceiling, it emits 373.25 GB/hour, 103.68 MB/s, or 829 Mbit/s before events,
framing, retransmission, voice, or cross-region control traffic. The optimized
case is affordable; the full-JSON case is both expensive and operationally
reckless.

## Scope and definitions

This model covers simultaneous human clients in one authoritative match at
4, 8, 24, 48, and 96 seats. It separates:

- logical authority count from physical host count;
- gameplay simulation cost from recipient projection/encoding cost;
- live-match capacity from warm/failure reserve;
- target delta traffic from the current full-JSON ceiling;
- cost per match-hour from cost per player-hour;
- public list-price arithmetic from unmeasured LBH performance.

It excludes voice, salaries, moderation, databases, authentication, replays,
observability, taxes, support contracts, and control-plane fixed cost unless a
row explicitly says otherwise. Those shared costs remain additive.

### Terms

- **authority:** the isolated causal owner for one `run_id` and authority epoch;
- **host:** a VM/node/container allocation that may run one or more authorities;
- **one-per-host:** an authority receives the whole selected host shape;
- **packed:** several isolated authorities share a host under measured quotas;
- **seats:** connected human clients in one match;
- **sim size:** authoritative active bodies, contacts, hazards, AI work, field
  samples, and events—not the visual fluid texture rendered by clients;
- **headroom:** capacity deliberately left unused for bursts, placement, host
  failure, and uneven regional demand.

## Model formulas

Use decimal GB for vendor billing and binary KiB for application-rate targets:

```text
GB/player-hour = KiB/s * 1024 * 3600 / 1,000,000,000
GB/match-hour = GB/player-hour * occupied seats
egress $/match-hour = GB/match-hour * regional $/GB

safe packing = floor(min(
  host usable cores / p95 authority cores,
  host usable GiB / p95 authority GiB,
  host network budget / p95 authority network,
  host encode budget / p95 authority encode,
  platform process/session cap
))

packed compute $/match-hour = host $/hour
                              / safe packing
                              * capacity factor
compute $/player-hour = packed compute $/match-hour / occupied seats

capacity factor = 1 / (1 - reserved fraction)
total $/player-hour = (compute + egress + per-match services) / seats
                      + per-player services + shared monthly cost/player-hour
```

A fleet targeting 70% occupied capacity has a `1 / 0.70 = 1.43` capacity
factor. Twenty, 30, and 40% reserve correspond to factors of 1.25, 1.43, and
1.67. Saying “add 30%” understates a target in which 30% of provisioned
capacity must remain free.

Regional fragmentation adds a separate floor. If three regions each require
one warm host, a one-match alpha can provision three hosts for one active
authority. At scale the penalty is:

```text
regional fragmentation factor = provisioned regional slots
                                / globally required slots
```

Measure it from actual placement histograms. Do not hide it inside nominal
host utilization.

## Network forecast

### State egress by match size

The target bands are recipient-specific JSON/binary deltas plus periodic
rebases. The two full-JSON rows reproduce current v0.3 planning ceilings; they
are not measured multi-client wire traffic.

| Per-player downlink | GB/player-hour | 4 seats GB/match-h | 8 | 24 | 48 | 96 |
|---:|---:|---:|---:|---:|---:|---:|
| 32 KiB/s target-low | 0.118 | 0.472 | 0.944 | 2.831 | 5.662 | 11.325 |
| 64 KiB/s target | 0.236 | 0.944 | 1.887 | 5.662 | 11.325 | 22.649 |
| 96 KiB/s target-high | 0.354 | 1.416 | 2.831 | 8.493 | 16.987 | 33.974 |
| 0.33 MB/s Deep Field full JSON | 1.188 | 4.752 | 9.504 | 28.512 | 57.024 | 114.048 |
| 1.08 MB/s Shallows-style full JSON | 3.888 | 15.552 | 31.104 | 93.312 | 186.624 | 373.248 |

At 15 state updates/s, the 64 KiB/s target averages about 4.27 KiB per update
per recipient. A 96-seat authority produces 1,440 recipient updates/s. Its
aggregate output rates are:

| Band | Aggregate MB/s at 96 | Approx Mbit/s | Meaning |
|---|---:|---:|---|
| 32 KiB/s | 3.15 | 25.2 | aggressive AOI/delta target |
| 64 KiB/s | 6.29 | 50.3 | planning target |
| 96 KiB/s | 9.44 | 75.5 | target-high |
| 0.33 MB/s | 31.68 | 253 | current Deep Field ceiling fanned out |
| 1.08 MB/s | 103.68 | 829 | Shallows-style ceiling; reject |

This is payload only. Add packet framing, TLS/TCP ACKs, retransmission,
connection recovery, inputs, reliable events, and observability. Voice stays on
a separate path and budget.

### Egress price per player-hour

| Downlink | Fly NA/EU $0.02/GB | CF Container NA/EU $0.025/GB after allowance | Railway $0.05/GB | Render $0.15/GB overage | GameLift gen-6+ eligible |
|---:|---:|---:|---:|---:|---:|
| 32 KiB/s | $0.0024 | $0.0029 | $0.0059 | $0.0177 | $0 |
| 64 KiB/s | $0.0047 | $0.0059 | $0.0118 | $0.0354 | $0 |
| 96 KiB/s | $0.0071 | $0.0088 | $0.0177 | $0.0531 | $0 |
| 0.33 MB/s | $0.0238 | $0.0297 | $0.0594 | $0.1782 | $0 |
| 1.08 MB/s | $0.0778 | $0.0972 | $0.1944 | $0.5832 | $0 |

Cloudflare Containers include 1 TB/month in NA/EU before the marginal rate.
Render includes bandwidth by workspace plan. The table intentionally uses
marginal overage prices so a successful game is not modeled as living forever
inside a free/included tier. GameLift's zero applies only to eligible managed
GameLift traffic on generation-6-and-later instance families and supported
commercial regions; it does not make unrelated AWS traffic free.

### Serialization and compression are server work

Large-match CPU is not only physics. Recipient projection is approximately
`O(P * relevant components)`, and a naive implementation may stringify and
compress nearly the same object graph `P` times. Model encoding explicitly:

```text
encode cores = aggregate uncompressed MB/s
               / measured encode throughput MB/s/core

compression cores = aggregate pre-compression MB/s
                    / measured codec throughput MB/s/core
```

For illustration only, a measured 50 MB/s/core compression path would consume
about 0.19 core at 9.44 MB/s and 2.07 cores at 103.68 MB/s. Those are arithmetic
examples, not Node, JSON, or LBH benchmarks. The benchmark must record encode
CPU, compression CPU, allocation/GC, bytes before and after compression, and
slow-recipient queue depth separately from world-tick time.

## Simulation-size forecast

The authority cost should scale with active work, not map artwork or client
fluid resolution:

```text
tick work ~= fixed session work
            + P * bounded player work
            + active bodies * component work
            + Ballpark candidates * exact consequence checks
            + AI decisions at budgeted cadence
            + field tiles/sources at budgeted cadence
            + recipient projection and encoding
```

Ballpark/AOI should prevent whole-world pairwise scans. Any hot path that grows
as `P^2`, `P * allBodies`, or `P * fullSnapshot` must be identified rather
than averaged into a CPU number.

### Planning envelopes, not measurements

| Seats | S1 current-scale core (vCPU/GiB) | S2 dense/heavy (vCPU/GiB) | S3 stress world (vCPU/GiB) |
|---:|---:|---:|---:|
| 4 | 0.20 / 0.40 | 0.50 / 0.75 | 1.0 / 1.5 |
| 8 | 0.30 / 0.60 | 0.75 / 1.0 | 1.5 / 2.0 |
| 24 | 0.75 / 1.25 | 1.5 / 2.25 | 3 / 4 |
| 48 | 1.5 / 2.25 | 3 / 4 | 6 / 8 |
| 96 | 3 / 4 | 6 / 8 | 12 / 16 |

S1 assumes current coarse authority ideas, bounded AI/hazards, Ballpark
broadphase, 15 Hz primary tick, and client-owned visual fluid. S2 represents
roughly 2–4x active ecology/contact/field work and more event churn. S3 is an
8x-world stress envelope with broad action and interest churn. Network remains
capped by AOI; if world size linearly increases per-player downlink, the design
has failed before the vendor decision.

These envelopes reserve no CPU for host OS, supervisor, TLS, logs, or burst.
Packing calculations below expose only 70% of host CPU/RAM. A current
single-threaded Node authority cannot turn a `6 vCPU` allocation into six cores
of tick capacity by configuration. Before S2/S3 at 48–96 seats, split
parallelizable read-only work into deterministic jobs while retaining one tick
commit owner.

## Vendor compute inputs and fit

All links were checked 2026-07-10.

### Fly Machines

Fly publishes per-region Machine presets and regional egress. Example listed
shapes include shared 1x/1 GiB around $0.0082/hour in the existing memo's
selected region, and performance shapes such as 2 vCPU/4 GiB at $0.1126/hour,
4/8 at $0.2252/hour, 8/16 at $0.4504/hour, and 16/32 at $0.9009/hour in the
current pricing matrix. NA/EU public egress is $0.02/GB, APAC/Oceania/South
America $0.04/GB, and Africa/India $0.12/GB
([pricing](https://fly.io/docs/about/pricing/)).

Use shared CPU only for prototypes and light low-density matches. Stable surf
ticks and noisy-neighbor isolation need performance CPU benchmarks. Fly is the
cleanest first Node-process spike because it supports VM lifecycle and TCP/UDP,
but placement availability, cold start, drain, and multi-process fairness are
still tests, not guarantees.

### Cloudflare Containers

Containers charge provisioned memory at $0.0000025/GiB-s, consumed CPU at
$0.000020/vCPU-s, and provisioned disk at $0.00000007/GB-s after included
usage. Available shapes currently top out at `standard-4`: 4 vCPU, 12 GiB, 20
GB disk. Every Container is reached through a Worker and has a Durable Object,
which are billed separately. NA/EU egress includes 1 TB/month then costs
$0.025/GB ([pricing](https://developers.cloudflare.com/containers/pricing/)).

Hourly marginal formula:

```text
container compute ~= consumed vCPU * $0.072
                    + provisioned GiB * $0.009
                    + provisioned disk GB * $0.000252
                    + Worker + Durable Object charges
```

This is plausible through 24-player S1/S2 and perhaps 48-player S1. A 6- or
12-core authority does not fit today's largest published Container shape.
Splitting one match across helper containers would need a new deterministic
job protocol and would give up much of the runtime's simplicity; it is not a
free scale-up.

### Cloudflare Durable Objects

One Durable Object per match maps beautifully to one logical authority. Paid
pricing includes 1M requests and 400K GB-s/month, then $0.15/M requests and
$12.50/M GB-s. A non-hibernating accepted WebSocket bills wall time at a fixed
128 MB allocation; incoming WebSocket messages are billed 20:1 and outgoing
messages are not request-billed. Workers Paid has no additional data-transfer
or throughput charge ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).

After allowances, an always-active match costs approximately:

```text
duration = 3600s * 0.128 GB * $12.50 / 1,000,000 = $0.00576/hour
input requests = seats * 15 msg/s * 3600 / 20
                 * $0.15 / 1,000,000
```

| Seats | DO duration + 15 Hz input requests / match-h | Per player-h |
|---:|---:|---:|
| 4 | $0.0074 | $0.0018 |
| 8 | $0.0090 | $0.0011 |
| 24 | $0.0155 | $0.0006 |
| 48 | $0.0252 | $0.0005 |
| 96 | $0.0446 | $0.0005 |

This is billing arithmetic, not a claim that LBH fits. A Durable Object is
single-threaded, allocated 128 MB for billing, and has per-invocation CPU
limits; a continuously ticking match cannot assume chat-style hibernation.
The published limits make 48/96 heavy authorities especially doubtful without
a major redesign ([limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).
Benchmark real tick scheduling, memory, recovery, encoding, and 96-client fanout
before treating the table as achievable.

### Railway

Railway lists $20/vCPU-month, $10/GB RAM-month, and $0.05/GB egress, billed by
minute. Hobby ($5) and Pro ($20) subscription amounts are usage credits up to
their amount ([pricing](https://docs.railway.com/pricing/plans)). At 730
hours/month, marginal compute is about `$0.0274/vCPU-hour +
$0.0137/GiB-hour`.

Railway is attractive for fast experiments and its resource formula makes
large shapes look inexpensive. The unresolved question is whether reported
vCPU consumption corresponds to the dedicated, low-jitter capacity a 15 Hz
authority needs. Run affinity, replacement/drain, UDP, regions, and noisy
neighbors require benchmark or contract evidence.

### Render

Render currently lists Starter 0.5 CPU/512 MB at $7/month, Standard 1/2 GiB at
$25, Pro 2/4 at $85, Pro Plus 4/8 at $175, Pro Max 4/16 at $225, and Pro Ultra
8/32 at $450. Custom shapes reach higher. Bandwidth overage is $0.15/GB after
plan-specific included transfer ([pricing](https://render.com/pricing),
[instance types](https://render.com/docs/compute-plans)).

The process fit is simple, but marginal egress dominates. Render is a usable
prototype/control-plane comparison, not the favored high-player-count state
host without a materially better bandwidth contract. One 96-seat S3 authority
needs a custom compute quote because it exceeds the listed 8-CPU maximum.

### Google Cloud Run

Instance-based Cloud Run in the listed Tier-1 example costs $0.000018/vCPU-s
and $0.000002/GiB-s, or $0.0648/vCPU-hour and $0.0072/GiB-hour
([pricing](https://cloud.google.com/run/pricing)). An open WebSocket makes the
instance active/billable; WebSockets time out at up to 60 minutes, affinity is
best effort, and clients must reconnect
([WebSockets](https://cloud.google.com/run/docs/triggering/websockets)).

```text
Cloud Run live compute $/match-hour = vCPU * $0.0648 + GiB * $0.0072
```

Cloud Run can host the compute shape, but forced reconnect, run routing, state
recovery, and outbound internet transfer are extra design/cost lines. This
document does not quote a Cloud Run network total because Google network SKU
pricing varies by source/destination and was not reduced to a verified LBH
region mix. Obtain a Pricing Calculator export before comparison.

### Amazon GameLift Servers / EC2

GameLift runs one game session per server process and explicitly supports
multiple server processes per instance. Its calculator asks for sessions per
instance, players/session, idle-buffer percentage, Spot mix, instance type,
region, and traffic. The default examples are not LBH packing evidence
([multiprocess](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/fleets-multiprocess.html),
[calculator](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-calculator.html)).

The current public table exposes, for example, Linux `c6i.large` (2 vCPU, 4
GiB) at $0.109/hour in the selected pricing result. It is updated frequently,
and Spot varies. Generation-6-and-later eligible GameLift instances have free
network bandwidth in supported commercial GameLift regions
([instance pricing](https://aws.amazon.com/gamelift/servers/pricing/instance-pricing/),
[cost planning](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-intro-pricing.html)).

Use the current region-specific calculator or quote for larger c6/c7 shapes;
do not linearly extrapolate the one captured price into a procurement model.
GameLift becomes compelling when free eligible bandwidth and fleet/session
operations outweigh integration weight. Direct EC2 may have lower compute
overhead but restores allocator, health, drain, placement, and autoscaling work;
this research did not obtain a primary-source, region-pinned EC2 SKU export, so
no direct-EC2 dollar row is claimed.

## Named-stack S1 scenarios

The following table combines the S1 envelopes, 64 KiB/s state traffic, and
public list prices. It is an **illustrative forecast**, not a vendor ranking.
Fly assumes a performance host with 70% resource exposure, operational caps on
packing, and a 30% fleet reserve (`1.43x`). Railway applies the same reserve to
resource usage. Render selects the smallest listed fitting instance and uses
marginal bandwidth overage. Shared control/database/telemetry costs are absent.

### Fly performance fleet, NA/EU

Illustrative packing: 4- and 8-seat S1 authorities pack eight per 4 vCPU/8 GiB
host; 24-seat pack three per 4/8 host; 48-seat pack three per 8/16 host; 96-seat
pack three per 16/32 host. These are targets to falsify with p95 tick fairness,
not safe production counts.

| Seats | Forecast compute $/match-h incl reserve | Total $/match-h at 64 KiB/s | Total $/player-h | $/player-h at 1.08 MB/s full JSON |
|---:|---:|---:|---:|---:|
| 4 | $0.0403 | $0.0591 | $0.0148 | $0.0878 |
| 8 | $0.0403 | $0.0780 | $0.0098 | $0.0828 |
| 24 | $0.1073 | $0.2206 | $0.0092 | $0.0822 |
| 48 | $0.2147 | $0.4412 | $0.0092 | $0.0822 |
| 96 | $0.4294 | $0.8824 | $0.0092 | $0.0822 |

### Railway resource-rate forecast

| Seats | Forecast compute $/match-h incl reserve | Total $/match-h at 64 KiB/s | Total $/player-h | $/player-h at 1.08 MB/s full JSON |
|---:|---:|---:|---:|---:|
| 4 | $0.0157 | $0.0629 | $0.0157 | $0.1983 |
| 8 | $0.0235 | $0.1179 | $0.0147 | $0.1973 |
| 24 | $0.0539 | $0.3370 | $0.0140 | $0.1966 |
| 48 | $0.1028 | $0.6691 | $0.0139 | $0.1965 |
| 96 | $0.1959 | $1.3284 | $0.0138 | $0.1964 |

### Render listed instances and marginal bandwidth

| Seats | Smallest forecast-fitting listed instance | Compute $/match-h | Total $/match-h at 64 KiB/s | Total $/player-h | $/player-h at 1.08 MB/s |
|---:|---|---:|---:|---:|---:|
| 4 | Starter | $0.0096 | $0.1511 | $0.0378 | $0.5856 |
| 8 | Standard | $0.0342 | $0.3174 | $0.0397 | $0.5875 |
| 24 | Standard | $0.0342 | $0.8836 | $0.0368 | $0.5846 |
| 48 | Pro | $0.1164 | $1.8151 | $0.0378 | $0.5856 |
| 96 | Pro Plus | $0.2397 | $3.6371 | $0.0379 | $0.5857 |

Included workspace bandwidth can reduce a tiny deployment's bill, but it does
not change the marginal successful-game comparison.

### Cloud Run compute only

| Seats | S1 live compute $/match-h | Compute $/player-h | Missing before total |
|---:|---:|---:|---|
| 4 | $0.0158 | $0.0040 | internet egress, minimum/warm instances, router/state |
| 8 | $0.0238 | $0.0030 | same |
| 24 | $0.0576 | $0.0024 | same |
| 48 | $0.1134 | $0.0024 | same |
| 96 | $0.2232 | $0.0023 | same |

These rows deliberately do not pretend to be total player-hour cost.

### GameLift captured-price illustration

At the captured `c6i.large` $0.109/hour price and GameLift calculator's 10%
idle-buffer example (`1.11x`), six 4-seat S1 authorities would be about
$0.0202/match-hour, four 8-seat authorities about $0.0302/match-hour, and one
24-seat S1 authority about $0.121/match-hour. Eligible generation-6 networking
would add $0 for state egress. Every packing count is a benchmark assumption;
48/96-seat and dense-sim rows require current larger-instance/region prices and
cannot responsibly be filled from one dynamic-page SKU.

## Heavier-sim compute sensitivity

The table below exposes raw per-match compute before regional reserve and
network. Railway and Cloud Run use their metered formulas. Cloudflare Container
uses forecast consumed CPU, provisioned memory at the envelope, and 4 GB disk;
an actual instance must round memory/CPU up to a published shape.

| Seats/tier | vCPU/GiB | Railway $/match-h | Cloud Run $/match-h | CF Container marginal $/match-h | Fit warning |
|---|---:|---:|---:|---:|---|
| 24 S1 | 0.75/1.25 | $0.0377 | $0.0576 | ~$0.0663 | ordinary small compute |
| 24 S2 | 1.5/2.25 | $0.0719 | $0.1134 | ~$0.1293 | dedicated/performance CPU preferred |
| 24 S3 | 3/4 | $0.1370 | $0.2232 | ~$0.2530 | multi-core job path needed |
| 48 S1 | 1.5/2.25 | $0.0719 | $0.1134 | ~$0.1293 | dedicated/performance CPU preferred |
| 48 S2 | 3/4 | $0.1370 | $0.2232 | ~$0.2530 | multi-core job path needed |
| 48 S3 | 6/8 | $0.2740 | $0.4464 | ~$0.5050 | exceeds current CF Container vCPU shape |
| 96 S1 | 3/4 | $0.1370 | $0.2232 | ~$0.2530 | multi-core job path needed |
| 96 S2 | 6/8 | $0.2740 | $0.4464 | ~$0.5050 | exceeds current CF Container vCPU shape |
| 96 S3 | 12/16 | $0.5479 | $0.8928 | ~$1.0090 | large dedicated host/custom quote |

Add `1.25–1.67x` fleet capacity factor, chosen regional fragmentation, egress,
Worker/DO charges, storage, logs, and fixed services. Metered formulas do not
guarantee that the runtime supplies the dedicated CPU behavior implied by the
vCPU figure.

## One authority per host versus packed authorities

One-per-host is the safest first benchmark and the most expensive steady state.
It isolates GC, event-loop stalls, memory leaks, and tick debt. Packing is an
operations optimization that comes only after one-run truth is measured.

Example using a Fly performance 4 vCPU/8 GiB host at $0.2252/hour and a 1.43
capacity factor:

| Mode | Authorities/host | Compute $/match-h | Why use it |
|---|---:|---:|---|
| one per host | 1 | $0.3220 | first public test, fault isolation, unknown workload |
| conservative packed | 2 | $0.1610 | early production after fairness proof |
| moderate packed | 4 | $0.0805 | measured light matches |
| aggressive packed | 8 | $0.0403 | only if p95/p99 tick and GC remain independent |

Packing must fail closed when any authority crosses its CPU, heap, outbound
queue, or tick-debt budget. Placement should reserve capacity by the match's
declared seat/sim tier; a 96-seat S2 match must not be admitted into slots
priced for eight-seat S1 matches.

## Region and warm-capacity effects

- Size by region, not global averages. A global 70% target can hide one region
  at 100% and another nearly empty.
- Keep future-match placement movable; do not live-migrate a causal match in
  v0.4 merely to reclaim packing efficiency.
- Maintain at least one failure domain beyond ordinary warm slots for public
  launches. A 30% capacity reserve does not protect a tiny one-host region from
  losing that host.
- Cross-ocean parties need an explicit placement objective: minimize maximum
  RTT, average RTT, or party-leader RTT. That choice affects surfing feel.
- Fly egress varies 6x between NA/EU and Africa/India. Cloudflare Container
  egress varies by region. Cloud Run, Render, Railway, and GameLift require
  region-specific calculator/contract checks before a blended forecast.
- Warm capacity is not necessarily a running empty match process. It may be an
  already-running host with free authority slots. Scale-to-zero products save
  idle money only if startup plus placement meets admission latency.

## Performance gates for 24/48/96

Before calling a seat count feasible, run 90-minute synthetic sessions at S1,
S2, and S3 with real recipient projection and actual transport compression.
For each seat count record:

1. fixed-step p50/p95/p99 tick time, tick debt, and overload/time-scale entry;
2. world work separated from projection, JSON/binary encode, compression, TLS,
   and socket flush;
3. p50/p95 bytes per recipient by baseline, delta, event, and recovery class;
4. heap/RSS, allocation rate, GC pause, and retained per-player state;
5. Ballpark candidate counts and exact consequence checks per tick;
6. AI decisions, field work, contacts, events, and active-body counts;
7. 1/3/5% loss, 50/100/180/250 ms RTT, jitter, reconnect, and slow-client
   backpressure;
8. one authority per host, then 2/4/8 authorities with fairness attribution;
9. region startup/placement time and the billable warm-capacity curve;
10. crash fencing and exactly-once result settlement under packed-host loss.

Candidate gates:

- p95 tick work under 50% of the 15 Hz frame and p99 under 80% in normal mode;
- no authority loses its gate because a neighboring packed match enters S3;
- outbound queues remain bounded and stale state coalesces rather than grows;
- target traffic stays at or below 64 KiB/s average and 96 KiB/s p95/player;
- full rebase does not block current deltas or create multi-second GC/encode
  stalls;
- overload reduces optional ecology, AI cadence, distant replication, and
  field resolution before it changes player movement rules unfairly.

## Decision guidance

1. **4–8 players:** benchmark Fly performance Machines first, with Railway and
   Cloudflare Container comparisons. Run a separate Durable Object port only
   as an architecture experiment. GameLift is a later fleet benchmark.
2. **24 players:** plausible with the same one-authority contract. Require
   recipient deltas, dedicated/performance CPU evidence, and one-host-per-match
   proof before packing.
3. **48 players:** treat as a distinct dense-match mode. Require parallel
   projection/encoding and likely parallel read-only sim jobs under one commit
   owner. Do not rely on shared CPU.
4. **96 players:** treat as an R&D ceiling. Use a multi-core/high-memory host,
   strict AOI, bounded sim tiers, and transport under 96 KiB/s/player. Full JSON
   is disqualifying even where GameLift makes egress nominally free because the
   authority still pays CPU, GC, NIC, queueing, and latency.
5. **Vendor choice:** choose from measured cost per accepted match-hour at the
   required tick/feel gate, not headline vCPU price. Low egress can make Fly,
   Railway, or Cloudflare economical; free eligible GameLift bandwidth can
   dominate at scale; Render's marginal bandwidth is punitive; Cloud Run needs
   a complete region-specific network and reconnect model.

## Quote and benchmark gaps

- No LBH 24/48/96 CPU, memory, encode, compression, or wire benchmark exists.
- No safe authorities-per-host result exists on any vendor.
- Fly prices vary by selected region; confirm the exact launch-region matrix.
- Cloudflare Containers are emerging and top out at a published 4 vCPU shape;
  startup, placement, WebSocket routing, and production limits need proof.
- Durable Object cost is calculable, but real sim fit, memory, scheduling,
  recovery, and heavy-match CPU are unproven.
- Railway dedicated-CPU behavior, run affinity, replacement, UDP, and SLA need
  benchmark or contract evidence.
- Render custom compute and high-bandwidth commercial terms require quotes.
- Cloud Run outbound network cost and region mix need a Pricing Calculator
  export; reconnect routing remains application work.
- GameLift larger-instance region prices and Spot blend change continuously;
  produce saved calculator estimates. Direct EC2 lacks a verified
  primary-source SKU export in this snapshot.
- Shared database, auth, logs, replay, DDoS, support, and voice costs remain
  outside these match-hour rows.

## Primary vendor sources

Accessed 2026-07-10:

- Fly.io, [Resource Pricing](https://fly.io/docs/about/pricing/)
- Cloudflare, [Containers Pricing](https://developers.cloudflare.com/containers/pricing/)
- Cloudflare, [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- Cloudflare, [Durable Objects Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- Cloudflare, [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Railway, [Pricing Plans](https://docs.railway.com/pricing/plans)
- Render, [Pricing](https://render.com/pricing)
- Render, [Instance Types](https://render.com/docs/compute-plans)
- Google Cloud, [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- Google Cloud, [Using WebSockets](https://cloud.google.com/run/docs/triggering/websockets)
- AWS, [GameLift Servers Instance Pricing](https://aws.amazon.com/gamelift/servers/pricing/instance-pricing/)
- AWS, [GameLift Cost Planning](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-intro-pricing.html)
- AWS, [GameLift Pricing Calculator Inputs](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-calculator.html)
- AWS, [GameLift Multiple Processes per Instance](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/fleets-multiprocess.html)
