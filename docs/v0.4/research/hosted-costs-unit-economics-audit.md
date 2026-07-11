# Audit: Hosted Authority Costs And $4.99 Unit Economics

> Independent audit of `hosted-costs-unit-economics.md` on 2026-07-10.
> Vendor facts below were rechecked against linked primary sources on that
> date. This is not a vendor quote.

## Verdict

The memo's architecture recommendation remains directionally sound: use a
stateful container/VM for the first internet authority spike, keep durable
progression outside the run process, and treat Durable Objects as a separate
runtime experiment. Its sales arithmetic is also correct to rounding.

The cost conclusion is not yet decision-grade. The `$0.015/player-hour` and
`$0.18/copy` planning case is **plausible only as a low-egress, well-packed
authority target**, not demonstrated as a blended production cost. The memo
does not derive that rate from a named stack, omits the fixed/shared services
it says the rate includes, and uses one rate across vendors whose bandwidth
alone can exceed it. It should be retained as a prototype gate, not booked as
a forecast.

One material vendor claim is now stale: Vercel's current official guidance
says Functions natively support WebSockets. They remain a poor owner for an
LBH run because a connection is pinned only for the function's bounded
duration and later connections are not guaranteed to reach the same function,
not because WebSockets are categorically unsupported.

## Findings Requiring Correction

### 1. The planning rate is not reproducible

The memo says `$0.015/player-hour` includes compute, state egress,
control/database, and observability, but supplies no equation or dollar
allowance for the last three. It also supplies no run density. A reproducible
model needs at least:

```text
transport GB/player-hour = KiB/s * 1024 * 3600 / 1,000,000,000
egress/player-hour = transport GB/player-hour * regional $/GB
compute/player-hour = host $/hour * warm-capacity factor
                      / concurrent runs per host / occupied seats per run
shared/player-hour = monthly control + auth + database + backups
                     + object storage + logs/metrics + support plan
                     divided by monthly player-hours
total/player-hour = egress + compute + shared + relay/voice + incident reserve
```

Until `concurrent runs per host`, average occupied seats, region mix, and the
shared monthly numerator are measured, the blended result cannot be audited.

### 2. Bandwidth arithmetic is correct, but the cost bands are vendor-specific

Using decimal GB, matching vendor billing:

| Downlink/player | GB/player-hour | Fly NA/EU at $0.02/GB | Cloudflare Container NA/EU at $0.025/GB | Railway at $0.05/GB | Render overage at $0.15/GB |
|---:|---:|---:|---:|---:|---:|
| 32 KiB/s | 0.117965 | $0.00236 | $0.00295 | $0.00590 | $0.01769 |
| 64 KiB/s | 0.235930 | $0.00472 | $0.00590 | $0.01180 | $0.03539 |
| 96 KiB/s | 0.353894 | $0.00708 | $0.00885 | $0.01769 | $0.05308 |
| 192 KiB/s | 0.707789 | $0.01416 | $0.01769 | $0.03539 | $0.10617 |
| 256 KiB/s | 0.943718 | $0.01887 | $0.02359 | $0.04719 | $0.14156 |

The source rates are current official rates: Fly lists $0.02/GB in NA/Europe,
$0.04 in APAC/Oceania/South America, and $0.12 in Africa/India
([Fly pricing](https://fly.io/docs/about/pricing/)); Cloudflare Containers
lists 1 TB/month included in NA/Europe and $0.025/GB afterward
([Containers pricing](https://developers.cloudflare.com/containers/pricing/));
Railway lists $0.05/GB ([Railway pricing](https://docs.railway.com/pricing/plans));
and Render lists plan-dependent included bandwidth followed by $0.15/GB
([Render pricing](https://render.com/pricing)). Checked 2026-07-10.

Consequences:

- The memo's `64 KiB/s -> 0.236 GB/player-hour`, eight-player
  `1.89 GB/run-hour`, `$0.038/Fly run-hour`, and `$0.284/Render run-hour`
  examples are arithmetically correct.
- `$0.015/player-hour` can contain compute and shared services at 64-96 KiB/s
  on Fly NA/EU only if packing is good. At 96 KiB/s, Railway egress alone is
  `$0.01769`; Render egress alone is `$0.05308` after included bandwidth.
- The stated stressed-production `$0.040/player-hour` is not a portable band.
  At 256 KiB/s Railway already costs `$0.04719` and Render `$0.14156` before
  compute, database, logs, or support.
- The current-full-snapshot `$0.08-$0.60+` band is a plausible cross-vendor
  envelope, but its endpoints should be named. At 0.33-1.08 MB/s, raw egress
  is 1.188-3.888 GB/player-hour: `$0.0238-$0.0778` on Fly NA/EU and
  `$0.178-$0.583` at Render overage rates.

### 3. The current LBH ceiling is characterized correctly, with two caveats

`tests/authority-budget.cjs` measures the UTF-8 byte length of the complete
uncompressed `/snapshot` JSON response and multiplies p95 bytes by the
**runtime's current** `session.snapshotHz`. It is not an on-wire WebSocket
measurement and it does not include HTTP/WebSocket framing, TLS, inputs,
events, reconnects, compression, or multiple recipient-specific payloads.

The recorded 107.88 KiB and 0.33 MB/s values in `docs/v0.3/ROADMAP.md` are
consistent with that test's reported runtime projection. The Shallows
extrapolation is also correct: 107.88 KiB * 10/s is about 1.105 MB/s (reported
as 1.08 MB/s when treating KiB as MiB), and eight recipients consume about
31.8 decimal GB/run-hour (31.1 GB if starting from the rounded 1.08 MB/s).
The memo should choose one byte convention and avoid implying that the current
single-client HTTP body has been measured under eight-client fan-out.

There is also a clock-context caveat: current static profiles in
`src/content/session-profiles.data.json` specify 15/10 Hz for Shallows and
10/6 Hz for the large profile, while the recorded Deep Field authority run
shows 7.74/8 Hz and a lower effective snapshot projection. Cost work must log
base and overload-adjusted clocks separately.

### 4. Vendor facts and missing constraints

| Vendor/runtime | Audit result | Required correction or missing constraint |
|---|---|---|
| Cloudflare Durable Objects | Core prices are correct. Paid includes 1M requests and 400K GB-s; excess is $0.15/M requests and $12.50/M GB-s. Incoming WS messages bill 20:1 and outgoing WS messages are not request-billed. | A continuously ticking run cannot assume hibernation savings. An accepted non-hibernating WebSocket bills wall time at a fixed 128 MB allocation. At exhausted free allowances that is `$0.00576/run-hour` for duration; eight clients sending 15 inputs/s add about `$0.00324/run-hour` in request charges, before the calling Worker or storage. Each object is single-threaded, has a soft 1,000 request/s limit, 32 MiB inbound WS-message limit, and 30 seconds CPU per request/message reset. See [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (checked 2026-07-10). |
| Cloudflare Containers | The egress claim is correct, but the memo links the general Workers page rather than the product pricing page. | Containers additionally bill provisioned memory at $0.0000025/GiB-s, consumed CPU at $0.000020/vCPU-s, and disk at $0.00000007/GB-s after included usage. Every Container is reached through a Worker and has a Durable Object, and Cloudflare says those are billed too. Scale-to-sleep does not help during a live run. See [Containers pricing](https://developers.cloudflare.com/containers/pricing/) (checked 2026-07-10). |
| Fly Machines | Good first process-fit candidate. The `$0.0082/hour` 1 GB shared-1x number is a current listed regional price, not a universal global rate. | Model compute and egress by region; egress spans 6x from NA/EU to Africa/India. Machine placement is best-effort and can fail in a selected region. Fly can expose TCP or UDP, unlike the HTTP-only products in this comparison. See [pricing](https://fly.io/docs/about/pricing/), [Machines](https://fly.io/docs/machines/overview/), and [service protocols](https://fly.io/docs/reference/configuration/) (checked 2026-07-10). |
| Railway | Listed plan and resource rates are correct. | The $5 Hobby and $20 Pro subscription amounts are usage credits, not additive fees until usage exceeds the credit. The memo does not establish run affinity, process replacement semantics, graceful drain, public UDP support, regional price/availability, or an SLA. These remain benchmark/contract unknowns. See [pricing](https://docs.railway.com/pricing/plans) (checked 2026-07-10). |
| Render | `$7` Starter, `$25` Standard, WebSockets, and `$0.15/GB` overage are correct. | Included bandwidth depends on workspace plan. Render assigns new WebSockets randomly across instances, periodically replaces instances, gives 30 seconds by default to shut down, and does not guarantee reconnect to the same instance. Public service ingress is one HTTP port, so the cited evidence supports WebSockets, not UDP. See [pricing](https://render.com/pricing), [WebSockets](https://render.com/docs/websocket), and [web services](https://render.com/docs/web-services) (checked 2026-07-10). |
| Google Cloud Run | WebSocket lifecycle warning is correct. The listed `$0.000018/vCPU-s` and `$0.000002/GiB-s` are current default instance-based rates. | The memo should state the billing mode: an open WebSocket is active/billable; request-based active CPU is priced differently. Connections time out at at most 60 minutes, affinity is best-effort, reconnects may land on another instance, and outbound internet transfer is a separate Google Cloud networking charge. This is HTTP/WebSocket, not a UDP game-socket host. See [pricing](https://cloud.google.com/run/pricing) and [WebSockets](https://cloud.google.com/run/docs/triggering/websockets) (checked 2026-07-10). |
| Vercel Functions | **Stale/incorrect claim.** Current official guidance says Functions natively support WebSockets. | Keep the rejection, change the reason. Connections are pinned only for maximum function duration; later connections need not reach the same function; durable room state is external. Current Fluid Compute maxima are 300 seconds Hobby, 800 seconds Pro/Enterprise generally, with a 1,800-second beta. See [WebSocket guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) and [function limits](https://vercel.com/docs/functions/limitations) (checked 2026-07-10). |
| AWS GameLift Servers | Directionally correct but not costed, so it does not satisfy the requested comparison. | A usable comparison needs region, instance type, processes/runs per instance, On-Demand/Spot mix, idle buffer, and DTO input. AWS's own calculator defaults illustrate that these are first-class inputs; GameLift's current guidance also says network bandwidth is free on generation-6-and-later instance types, which materially changes a snapshot-heavy comparison and needs validation for the chosen fleet. See [cost planning](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-intro-pricing.html) and [calculator inputs](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-calculator.html) (checked 2026-07-10). |

The relay reference is correct: Cloudflare Realtime currently lists a shared
1,000 GB free tier across SFU and TURN and `$0.05/GB` egress afterward
([Realtime pricing](https://developers.cloudflare.com/realtime/sfu/pricing/),
checked 2026-07-10). The memo still needs a voice bitrate, speaking duty cycle,
and relay percentage before this becomes a cost input.

### 5. Missing fixed and operational costs

The original assignment explicitly requested control plane, auth, database,
object storage, observability, relay, DDoS/egress, backups, support, and idle
capacity. The memo names most of these but prices none of them. There is no
monthly fixed-cost table and no smallest/recommended/scale-out stack bill.

At minimum, the next model must name a product/tier and quantity for:

- account/entitlement auth and abuse controls;
- primary database, storage, point-in-time recovery, replicas, and connection
  pooling;
- replay/evidence object storage, reads, writes, retention, and restore tests;
- log ingestion/retention, metrics cardinality, traces, alerts, and incident
  paging;
- domain/TLS/static hosting/control API;
- warm regional authority capacity and failover buffer;
- paid vendor support, on-call labor, moderation, fraud/chargebacks, privacy
  requests, and backup recovery exercises;
- TURN and voice separately from gameplay state.

Free tiers should appear only as a cash-flow case, never in marginal
cost/player-hour after the cliff.

## Unit-Economics Audit

### Arithmetic

The receipt formula is correct:

```text
$4.99 * (1 - 0.08 refunds) * (1 - 0.30 store) * (1 - 0.03 leakage)
= $3.1171532 per copy
```

The 1K/10K/100K/1M receipt, service-cost, and contribution rows all agree with
that formula after rounding. The concurrency table also correctly uses
`CCU * 730 * $0.015`, and the hosting-only break-even calculations are
correct (`3.117 / rate`).

### Unsupported business assumptions

- A flat 30% store deduction is a conservative placeholder, not a sourced
  blended rate. The model must identify storefront mix, regional pricing,
  discounts, keys, and any revenue-share tiers before it is a forecast.
- Refunds, sales/VAT treatment, FX, payment leakage, and chargebacks are
  combined without evidence. Store reporting generally needs a regional
  cohort model rather than one stacked 3% factor.
- `$0.50/copy` is a one-time reserve proportional to sales, not a developer
  salary or ongoing support allowance. It is only $500 at 1K copies and says
  nothing about calendar months, staffing, or incident coverage. Therefore
  the memo does not meet its own requirement to show contribution after an
  explicit labor/support allowance.
- Lifetime infrastructure cost is charged to a sales cohort without the
  fixed monthly cost or the months over which those 12 hours are played.
  Cash-flow and shutdown obligations for a paid game remain unmodeled.
- One million copies at 12 hours each correctly creates 12 million
  player-hours and `$180,000` variable cost at the target rate, but that total
  inherits every unsupported rate and retention assumption above.

The corrected cohort formula should be:

```text
receipts = copies * realized net receipt/copy
variable service = copies * lifetime player-hours/copy
                   * measured variable $/player-hour
fixed service = service months * fixed monthly stack cost
labor/support = loaded monthly labor * service months
                + per-ticket/moderation/fraud variable cost
contribution = receipts - variable service - fixed service
               - labor/support - publisher/development obligations
```

## Is `$0.18/copy` Defensible?

**As a design target: yes. As the current planning forecast: no.**

At 96 KiB/s on Fly NA/EU, raw state egress is `$0.00708/player-hour`.
Illustratively, one `$0.0082/hour` host serving one 4.5-seat run adds
`$0.00182/player-hour`; a 40% warm-capacity multiplier raises that compute
component to `$0.00255`. That leaves about `$0.00537/player-hour` inside the
`$0.015` target for control plane, database, storage, telemetry, support-plan
amortization, input/event overhead, and incident reserve. This is possible,
but it is not generous and it assumes one run saturates neither the host nor
the regional bandwidth price.

At the same 96 KiB/s, Railway egress alone exceeds the target by 18%, and
Render overage exceeds it by 254%. A lower 64 KiB/s target, more than one run
per host, or a platform with included/zero marginal egress creates more room.
A continuously active Durable Object may also beat the target on metered
compute/request charges, but only if the real sim fits its single-threaded,
128 MB runtime and its actual bandwidth economics and Worker/storage charges
are verified.

Approve `$0.18/copy` only after a 90-minute, eight-client benchmark reports:

1. p50/p95 bytes per recipient by message class and actual compression;
2. input/event/rebase/reconnect overhead and regional egress destination mix;
3. stable runs per host at the 15 Hz feel gate plus 40% warm headroom;
4. a named production stack's monthly fixed bill divided by a conservative
   player-hour floor;
5. TURN/voice as a separate line;
6. three-, twelve-, and forty-hour lifetime cohorts and the months over which
   they accrue.

Until then, present a range rather than a point forecast: `$0.18/copy` target,
`$0.48/copy` stressed low-egress case, and a vendor-specific high-egress case
derived from the chosen region and transport measurement. Do not use the
memo's `$0.18` row as a promise of production margin.
