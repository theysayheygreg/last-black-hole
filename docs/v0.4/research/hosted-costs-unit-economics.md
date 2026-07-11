# Hosted Authority Costs And $4.99 Unit Economics

> Research snapshot: 2026-07-10. Prices and limits are current-source inputs,
> not vendor quotes. Re-run this model before any production commitment.

## Recommendation

Use a **hybrid hosted-authority stack**:

1. Keep one LBH run as one authoritative process.
2. Put static web/download surfaces and the low-duty control edge on
   Cloudflare Workers/Pages or an equivalent CDN edge.
3. Put the first public sim prototype in small regional containers or VMs so
   the existing Node authority can move with minimal semantic change. Fly
   Machines is the strongest first benchmark candidate; Cloudflare Containers,
   Railway, Render, and Cloud Run are comparison lanes.
4. Use Postgres for account/profile/entitlement/run settlement and object
   storage for replay/evidence blobs. The live sim is disposable; durable
   progression never depends on its local disk.
5. Prototype a **Cloudflare Durable Object per run** separately. Its economics
   are unusually attractive, but it is a runtime/architecture port, not a
   deployment target for the existing Node child process.
6. Do not use Vercel Functions as the live authority without direct vendor
   confirmation and a stateful-run proof. Current official Vercel pages
   conflict on WebSocket support; the newer guidance still describes bounded
   function duration and no guarantee that later connections reach the same
   function, which is the wrong default lifecycle for a single-writer run.

The business conclusion is encouraging but conditional: $4.99 can support
hosted 4–8-player sessions if LBH ships interest-managed deltas. It is much
less comfortable if it sends today's full JSON snapshots to every player for
the lifetime of the game.

Here “one run as one authority” is logical isolation. Every concurrent match
has its own single-writer authority instance, while a regional fleet may pack
many isolated match workers into one VM/container/node. Cost depends on
measured concurrent authorities per host, not on buying one host per match.

## Current LBH Baseline

The v0.3 Deep Field probe observed:

- 7.74 authority ticks/s against an 8 Hz target;
- 107.88 KiB p95 full snapshot;
- 0.33 MB/s estimated one-client snapshot stream at Deep Field's cadence;
- 4.12 MiB short-soak heap growth;
- 1.555 ms p95 Ballpark sync.

The byte calculation in `tests/authority-budget.cjs` is uncompressed JSON body
size multiplied by `snapshotHz`. It is a useful ceiling, not a public network
protocol. Shallows at 10 snapshots/s would be roughly 1.08 MB/s per player at
the same payload size. Eight Shallows clients would therefore consume roughly
31 GB of server egress per run-hour before transport compression and before
events, inputs, reconnects, or voice. That is the first cost problem to solve.

### Required Public-Network Targets

| Measure | Prototype ceiling | Production target |
|---|---:|---:|
| authority tick | 15 Hz Shallows | 15 Hz stable, explicit overload ladder |
| client input | 15–30 msg/s | batched/deduped; edges separately reliable |
| state delivery | 10–15 updates/s | baseline + interest delta, periodic rebase |
| average state downlink/player | 256 KiB/s | 32–96 KiB/s |
| p95 state downlink/player | 512 KiB/s | under 192 KiB/s |
| full rebase | current full snapshot | infrequent, compressed, run-stamped |
| voice | optional/separate | relay/SFU budget independent of sim |

At 64 KiB/s, one player-hour is about 0.236 GB. At eight players, the run
egresses about 1.89 GB/hour. At Fly's North America/Europe $0.02/GB rate that
is about $0.038/run-hour in state egress; at Render's $0.15/GB overage it is
about $0.284/run-hour. Vendor egress policy matters more than small VM price.

## Vendor Fit

All linked claims were checked 2026-07-10.

| Platform | Live run fit | Relevant current facts | Position |
|---|---|---|---|
| Cloudflare Durable Objects | Strong experimental fit after port | One globally addressable, single-threaded object can coordinate a game room over long-lived WebSockets. Paid pricing includes 1M requests and 400K GB-s, then $0.15/M requests and $12.50/M GB-s; incoming WS messages receive a 20:1 billing ratio and outgoing WS messages are not request-billed. Each object has a soft 1,000 requests/s limit. ([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)) | Best cost/scale experiment. Requires adapting the sim to isolate lifecycle, timers, persistence, and Worker runtime limits. Benchmark determinism and sustained 15 Hz scheduling before choosing it. |
| Cloudflare Containers | Strong emerging container candidate | Workers pricing lists per-use container CPU, memory, disk, scale-to-sleep, 1 TB NA/EU egress included, then $0.025/GB. ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | Put on the benchmark list; confirm maturity, regions, startup time, process supervision, WebSocket routing, and production limits before depending on it. |
| Fly Machines | Strong first prototype fit | A shared 1x/1 GB Machine is listed around $0.0082/hour; Machines offer regional VM lifecycle control. NA/EU internet egress is $0.02/GB. ([pricing](https://fly.io/docs/about/pricing/), [Machines](https://fly.io/docs/machines/overview/)) | Recommended first internet-hosted authority spike because it resembles today's Node process and prices network sanely. Prove packing multiple isolated runs per Machine before one-VM-per-run. |
| Railway | Good small-production/prototype fit | Hobby is $5/month, Pro $20/month; resource rates are $20/vCPU-month, $10/GB RAM-month, and $0.05/GB egress, billed by minute. ([pricing](https://docs.railway.com/pricing/)) | Excellent developer-speed comparison. Validate regional placement, autoscaling control, websocket routing, and noisy-neighbor behavior. |
| Render | Good process fit, weaker traffic economics | Web services support WebSockets. Starter is $7/month/0.5 CPU/512 MB and Standard is $25/month/1 CPU/2 GB; bandwidth overage is $0.15/GB on listed plans. ([pricing](https://render.com/pricing), [WebSockets](https://render.com/docs/websocket)) | Viable control plane or early low-traffic host. Expensive for snapshot-heavy authority unless higher plans/quotes alter egress. |
| Google Cloud Run | Conditional fit | WebSockets are supported, but connections are HTTP requests capped at 60 minutes, clients must reconnect, affinity is best-effort, and an open WebSocket makes the instance active/billable. Listed default prices include $0.000018/vCPU-s and $0.000002/GiB-s. ([WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets), [pricing](https://cloud.google.com/run/pricing)) | Useful autoscaled container/control service, but run ownership must survive forced reconnect and non-sticky replacement. A run router and external state are mandatory. |
| AWS GameLift Servers | Strong later dedicated-host fit | GameLift provides managed dedicated game server fleets, Spot/on-demand instances, matchmaking/session features, and usage-based instance pricing. ([pricing](https://aws.amazon.com/gamelift/servers/pricing/instance-pricing/), [cost planning](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-intro-pricing.html)) | Revisit when concurrency, regions, fleet placement, and operations justify its integration weight. It is not the cheapest learning environment. |
| Vercel Functions | Not recommended for live authority | Vercel's limits page says Functions cannot act as WebSocket servers, while a newer official knowledge-base article says WebSockets are supported but pinned only for bounded function duration and later connections may reach another function. ([limits](https://vercel.com/docs/limits), [WebSocket guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), [function limits](https://vercel.com/docs/functions/limitations)) | The official contradiction needs vendor confirmation. Bounded lifetime, non-sticky reconnect, and external room state remain poor defaults for one match authority. Fine for website and control surfaces. |

### P2P Relay/Voice Cost Reference

Cloudflare Realtime TURN/SFU lists 1,000 GB/month free and $0.05/GB egress
afterward; client-to-Cloudflare traffic is free. ([pricing](https://developers.cloudflare.com/realtime/sfu/pricing/), [TURN](https://developers.cloudflare.com/realtime/turn/))
This makes it a credible NAT/voice benchmark, but it does not create gameplay
authority or solve cheat/save settlement.

## Topology Options

### A. Minimal Private/Public Alpha

- Cloudflare edge for TLS, static client, rate limits, and run-router API.
- One regional Fly/Railway/Render process hosts several isolated run workers.
- Small managed Postgres stores accounts, entitlements, profiles, and settled
  outcomes.
- WebSocket state transport; HTTPS for bootstrap/recovery/admin.
- No public matchmaking beyond invite/join code.

This maximizes reuse of v0.3 and is the recommended first real test.

### B. Cloudflare-Native Run Objects

- One Durable Object per run.
- Worker handles auth/bootstrap/routing.
- D1 or external Postgres owns durable account/profile data.
- R2 holds larger replay/evidence blobs.
- Realtime TURN/SFU handles voice or relay needs.

This may be the best eventual low-ops economics. It must earn that position by
running the real fixed-step Ballpark workload, not a chat-room surrogate.

### C. Managed Fleet

- GameLift or Kubernetes/Agones-style fleet packs multiple run processes onto
  regional nodes.
- Separate matchmaking/control plane and durable data services.
- Reserved/Spot blend plus warm capacity.

This is appropriate after real demand proves the need for regional fleet
placement, explicit session allocation, and mature operations.

## Cost Per Active Hour

These are design envelopes, not quotes or forecasts. Only egress arithmetic is
directly reproducible today. Compute density, fixed control/database/observability
cost, regional mix, warm capacity, operations, support, salaries, and taxes are
unmeasured and must be added after the hosted benchmark.

| State shape | State downlink/player | Approx variable cost/player-hour | 12-hour lifetime cost/copy | Meaning |
|---|---:|---:|---:|---|
| optimized low | 32 KiB/s | $0.008 | $0.10 | efficient deltas, low-cost egress, well-packed authorities |
| low-egress design target | 64–96 KiB/s | $0.015 | $0.18 | falsification target used illustratively in the sales table |
| stressed production | 192–256 KiB/s | $0.040 | $0.48 | excess churn/rebases/telemetry or costly regions |
| current full-snapshot shape | 0.33–1.08 MB/s | $0.08–$0.60+ | $0.96–$7.20+ | depends heavily on map cadence and $/GB; unacceptable as the shipped default |

The Durable Object implementation could undercut the low band because
Cloudflare Workers have no separate egress charge and DO request/duration
pricing is small at 4–8 players. That upside should not be booked until the
real sim passes CPU, scheduling, restart, and recovery tests in the runtime.

## Sales And Unit Economics

Copies sold does not determine concurrency. The model therefore separates
receipts from play cost.

### Illustrative Cohort Assumptions

- list price: $4.99;
- refunds: 8% of gross units/receipts;
- storefront share: 30% after refunds;
- sales tax/FX/payment leakage allowance: 3% of the remainder;
- developer receipts before corporate income tax:
  `copies * 4.99 * 0.92 * 0.70 * 0.97 = copies * $3.117`;
- expected lifetime hosted play: 12 player-hours/copy;
- low-egress service target: $0.015/player-hour = $0.18/copy;
- illustrative per-copy support reserve: $0.50/copy. This is explicitly not a
  salary, fixed-service, or ongoing support model.

| Copies | Gross at $4.99 | Modeled developer receipts | Illustrative hosted service target | Contribution before fixed/labor | After $0.50/copy support reserve |
|---:|---:|---:|---:|---:|---:|
| 1,000 | $4,990 | $3,117 | $180 | $2,937 | $2,437 |
| 10,000 | $49,900 | $31,172 | $1,800 | $29,372 | $24,372 |
| 100,000 | $499,000 | $311,715 | $18,000 | $293,715 | $243,715 |
| 1,000,000 | $4,990,000 | $3,117,153 | $180,000 | $2,937,153 | $2,437,153 |

These figures are not a production margin forecast. They exclude fixed hosting
and service months, loaded labor/on-call/support, corporate income tax,
development recoupment, publisher
share, regional price mix, discounts, chargeback spikes, platform-specific
minimums, and ongoing content development. They also treat the sales cohort's
lifetime play as if it can be funded from its receipts; cash-flow timing needs
a monthly cohort model before launch.

### Sensitivity Per Copy

| Case | Lifetime hours | Cost/player-hour | Hosted service/copy | Receipts less service |
|---|---:|---:|---:|---:|
| low engagement/optimized | 3 | $0.008 | $0.024 | $3.093 |
| expected | 12 | $0.015 | $0.180 | $2.937 |
| high engagement/stressed | 40 | $0.040 | $1.600 | $1.517 |

At $3.117 modeled receipts/copy, the hosting-only break-even is roughly 208
player-hours at $0.015/hour, 78 hours at $0.04/hour, or just 5.2 hours at
$0.60/hour. That is why current full-snapshot transport can turn a successful,
high-retention game into an infrastructure liability while compact deltas leave
ample room.

## Concurrency Scenarios

Use CCU rather than copies sold to size live capacity:

`run CCU = player CCU / average occupied seats`

`authority instance CCU = run CCU`

`compute host CCU = ceil(authority instance CCU / safe authorities per host)`

`monthly player-hours = average CCU * 730`

`monthly variable service = monthly player-hours * cost/player-hour`

At the $0.015 low-egress design target:

| Average player CCU | Approx runs at 4.5 players | Monthly player-hours | Variable service/month |
|---:|---:|---:|---:|
| 25 | 6 | 18,250 | $274 |
| 250 | 56 | 182,500 | $2,738 |
| 2,500 | 556 | 1,825,000 | $27,375 |
| 25,000 | 5,556 | 18,250,000 | $273,750 |

Peak capacity, idle/warm headroom, database, support, and incident response sit
on top. A 20–40% peak/warm reserve is reasonable for planning until real hourly
curves exist.

### Reproducible Cost Formula Required After Benchmark

```text
transport GB/player-hour = KiB/s * 1024 * 3600 / 1,000,000,000
egress/player-hour = transport GB/player-hour * regional $/GB
compute/player-hour = host $/hour * warm factor
                      / safe concurrent authorities per host
                      / occupied seats per authority
shared/player-hour = monthly control + auth + database + backups
                     + storage + logs/metrics + support plan
                     divided by conservative monthly player-hours
total/player-hour = egress + compute + shared + relay/voice
                    + incident/abuse reserve
```

The current memo does not yet supply measured run density or a named fixed
monthly stack. `$0.18/copy` stays a benchmark target until those inputs exist.

## Required Spikes Before Vendor Choice

1. Replace polling with WebSocket transport without changing protocol-v2
   authority semantics.
2. Add per-player interest deltas plus compressed periodic full rebase; record
   actual bytes at 4, 6, and 8 clients.
3. Run 90-minute 8-player synthetic sessions under 50/100/180 ms RTT, jitter,
   1/3/5% loss, reorder, disconnect, and reconnect.
4. Pack multiple isolated runs into one 1-vCPU/1-GB host and measure the point
   where tick fairness fails.
5. Port the same fixed scenario to one Durable Object and compare tick
   stability, event-loop pressure, restart/recovery, and cost.
6. Benchmark at least two regions and one cross-ocean party.
7. Exercise transactional run settlement so a crash/retry cannot duplicate or
   erase rewards.
8. Build a monthly cohort/CCU calculator from real playtest retention before
   committing to a service budget.

## Decision

For v0.4 planning, choose **central authoritative hosted sessions as the
primary production model**, with player-hosted/private authority as a fallback
and Durable Objects as the high-upside experimental authority runtime.

Do not choose true authority-free P2P to save hosting cost until its cheat,
determinism, host-loss, progression-settlement, and movement-feel costs are
compared against the approximately $0.18/copy low-egress hosted-service target.
At compact-delta rates, central authority is cheap enough that correctness is
worth buying.

## High-Count Extension

The detailed 24/48/96 model now lives in
`docs/v0.4/research/high-player-count-hosting-cost-model.md`. Its key 96-seat
comparison is:

- 64 KiB/s/player: 22.65 GB/match-hour and about 50.3 Mbit/s payload;
- current 1.08 MB/s full-JSON ceiling: 373.25 GB/match-hour and about
  829 Mbit/s payload;
- illustrative S1 total at 64 KiB/s: about $0.882/match-hour on the modeled
  Fly NA/EU packed fleet, $1.328 on Railway, and $3.637 on Render;
- modeled heavy compute rises from 6 vCPU/8 GiB at S2 to 12 vCPU/16 GiB at S3,
  but those cores help only after deterministic worker offload around the one
  canonical writer.

Those numbers exclude shared fixed services and remain forecasts until the
high-count benchmark proves CPU, packing, bytes, and regional behavior.
