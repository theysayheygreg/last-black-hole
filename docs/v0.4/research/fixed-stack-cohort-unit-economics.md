# Fixed-Stack And Cohort Unit Economics

> Research snapshot: 2026-07-10. Vendor prices are public list prices, not
> quotes. LBH traffic, packing, retention, sales timing, staffing, and support
> inputs are explicit planning assumptions. Re-run this model from measured
> production data before committing money or publishing a margin claim.

## Decision

The $4.99 price supports a centrally hosted 4–8-player game **only if LBH keeps
state traffic near the compact-delta target and operates with a deliberately
lean service model**. Variable infrastructure is not the hard part: the base
case below is $0.0143/player-hour, or $0.172 for a 12-hour buyer. Calendar-time
database, observability, warm-region, incident, on-call, and customer-support
costs dominate small cohorts.

Use these operating postures, promoting only when actual MAU, CCU, incident
load, and revenue justify the next one:

| Cohort | Default posture | Reason |
|---:|---|---|
| 1K copies | **Smallest / owner-operated** | Do not buy enterprise reliability for a cohort whose modeled lifetime receipts are only $3,117. |
| 10K copies | **Smallest**, with a launch burst allowance | The recommended staffed posture consumes the cohort's receipts before gameplay hosting does. |
| 100K copies | **Recommended production** | Paid telemetry, real paging, staging, database recovery, and a staffed launch become defensible, although $4.99 still does not fund an indefinite live team by itself. |
| 1M copies | **Scale / contracted** | Require negotiated database, edge, observability, abuse, and support terms; public list pricing is no longer a reliable forecast. |

This is a service-operations model, not a studio P&L. It excludes game
development, content production, publisher recoupment/share, corporate income
tax, localization, certification, and marketing. The loaded labor lines include
only the fraction of engineering, on-call, support, moderation, security, and
privacy work assigned to keeping the shipped service alive.

## Source-backed price anchors

- Cloudflare Workers Paid has a $5/month account minimum, includes 10 million
  requests and 30 million CPU milliseconds, and does not separately charge
  Workers egress. R2 Standard is $0.015/GB-month, $4.50/million Class A
  operations, $0.36/million Class B operations, and no Internet egress charge
  ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
  [R2 pricing](https://developers.cloudflare.com/r2/pricing/)).
- Supabase Pro starts at $25/month, includes 100K MAU, 8 GB database disk,
  250 GB egress, 100 GB file storage, seven days of daily backups, and seven
  days of logs. Excess MAU is $0.00325; Team starts at $599/month. Additional
  compute, replicas, PITR, log drains, and enterprise support remain separate
  ([Supabase pricing](https://supabase.com/pricing),
  [billing guide](https://supabase.com/docs/guides/platform/billing-on-supabase)).
- Grafana Cloud Pro has a $19/month platform fee, includes 10K active metric
  series and 50 GB logs, and lists 30-day log retention and 13-month metric
  retention. Enterprise starts at a $25,000/year spend commitment
  ([Grafana pricing](https://grafana.com/pricing/)).
- PagerDuty Professional lists $21/user/month when billed annually
  ([PagerDuty pricing](https://www.pagerduty.com/pricing/incident-management/)).
- Fly lists an NA `shared-cpu-1x`/1 GB Machine at $0.0082/hour or $5.92/month;
  public egress is $0.02/GB in NA/Europe, $0.04 in APAC/Oceania/South America,
  and $0.12 in Africa/India. Exact compute varies by selected region
  ([Fly pricing](https://fly.io/docs/about/pricing/)).

Domain registration, enterprise plans, PITR/replica shapes, customer-support
software, fraud/moderation tooling, and premium vendor response are **quote
gaps** below. Their dollar rows are budget allowances, not claimed vendor
prices. TLS itself can remain included with Cloudflare/Fly; the domain row is
registration and renewal.

## Three named monthly stacks

These are fixed floors. Elastic match compute, state egress, per-MAU/GB/event
overages, voice/TURN, and ticket labor remain variable. “Warm capacity” means
empty authority slots in each live region, not an empty process per possible
match. The variable compute rate later in this document carries capacity above
this floor and the 30% fleet reserve.

### Smallest: owner-operated public service — $162/month

| Component | Named product/assumption | Monthly |
|---|---|---:|
| Edge/control/static | Cloudflare Workers Paid + Pages | $5 |
| Database/auth/backups | One Supabase Pro project; included seven-day daily backups | $25 |
| Object storage | R2 usage allowance; list-price meter, no free-tier dependency | $5 |
| Logs/metrics/errors | Grafana Cloud Pro floor | $19 |
| Paging/vendor support | 2 PagerDuty Professional seats; Supabase/Grafana included email/community support | $42 |
| Warm regional authority floor | Three Fly 1 GB shared Machines at NA list price | $18 |
| Backup restore exercises | Monthly logical export/restore and off-platform copy allowance; **quote gap** | $25 |
| Domain/TLS | Registration amortization **quote gap**; TLS included | $2 |
| Subtotal |  | $141 |
| Abuse/incident cash reserve | 15% of subtotal | $21 |
| **Fixed monthly floor** | rounded | **$162** |

There is no purchased customer-support system here: support is an owner-run
mailbox and issue queue. That is an operating constraint, not a free service.

### Recommended: production 4–8-player service — $803/month

| Component | Named product/assumption | Monthly |
|---|---|---:|
| Edge/control/static | Cloudflare Workers Paid | $5 |
| Database/auth | Supabase Pro production plus staging allowance | $35 |
| DB recovery/headroom | PITR, connection/compute headroom, and replica budget; **quote gap** | $150 |
| Object storage | R2 replay/evidence/backup allowance | $25 |
| Logs/metrics | Grafana Cloud Pro plus metered telemetry allowance | $119 |
| Paging | 4 PagerDuty Professional seats | $84 |
| Warm regional authority floor | Nine blended 1 GB Fly Machines across three regions | $58 |
| Backup restore exercises | Retention and quarterly destructive-restore allowance; **quote gap** | $50 |
| Customer support/abuse tools | Helpdesk, moderation, fraud and privacy tooling; **quote gap** | $170 |
| Domain/TLS | Registration amortization **quote gap** | $2 |
| Subtotal |  | $698 |
| Abuse/incident cash reserve | 15% of subtotal | $105 |
| **Fixed monthly floor** |  | **$803** |

### Scale: contracted multi-region service — $20,300/month

| Component | Named product/assumption | Monthly |
|---|---|---:|
| Edge, WAF, DDoS, account support | Cloudflare enterprise allowance; **quote required** | $2,500 |
| Database/auth plan | Supabase Team public floor | $599 |
| DB compute, replicas, PITR, pooling | Multi-region/HA allowance; **quote and topology required** | $3,500 |
| Object/replay storage | R2 metered allowance | $500 |
| Logs/metrics/traces | Grafana Enterprise minimum ($25K/year) plus $2K usage allowance | $4,083 |
| Paging | 10 PagerDuty Professional seats; enterprise incident features excluded | $210 |
| Warm regional authority floor | Failure-domain floor before CCU-driven elastic fleet; **benchmark/quote gap** | $1,500 |
| Backups/DR | Cross-provider copies and regular recovery exercises; **quote gap** | $1,000 |
| Support/moderation/fraud tools | Tooling only, not agents; **quote gap** | $2,000 |
| Premium vendor response | Support-contract allowance; **quote required** | $1,000 |
| Domain/certificates | Portfolio allowance; **quote gap** | $25 |
| Subtotal |  | $16,917 |
| Abuse/incident/contract variance reserve | 20% rounded | $3,383 |
| **Fixed monthly floor** |  | **$20,300** |

At this scale, do not treat the table as a shopping list. Solicit Cloudflare,
database, observability, fleet, and support quotes against measured MAU,
queries, bytes, series cardinality, retention, regions, and incident SLA.

## Cohort and load assumptions

The receipt placeholder is retained for comparability with the earlier memo:

```text
modeled receipt/copy = $4.99 * (1 - 8% refunds)
                     * (1 - 30% storefront share)
                     * (1 - 3% tax/FX/payment leakage allowance)
                     = $3.1171532
```

This is deliberately conservative, but not a sourced storefront forecast.
Regional prices, discounts, platform mix, refunds, tax handling, chargebacks,
and revenue-share tiers require actual sales data.

| Case | Lifetime hosted hours/copy | Service months | Lifetime-play distribution | Launch peak/launch average | Regional destination mix |
|---|---:|---:|---|---:|---|
| Low | 3 | 12 | 55% month 1; 25% months 2–3; 20% months 4–12 | 4x | 80% NA / 20% EU |
| Base | 12 | 36 | 35% month 1; 25% months 2–3; 25% months 4–12; 15% months 13–36 | 4x | 55% NA / 30% EU / 15% APAC |
| High | 40 | 84 | 20% month 1; 15% months 2–3; 25% months 4–12; 20% months 13–36; 20% months 37–84 | 5x | 45% NA / 30% EU / 20% APAC / 5% other |

“Service months” means the paid-online commitment for this sales cohort, not
that every buyer plays uniformly until the final month. A paid game's shutdown
promise is a product decision: extending base service from 36 to 84 months
adds 48 months of fixed stack and tail staffing even if player-hours barely
move.

### Variable cost per player-hour

All three cases hold compact state delivery at 64 KiB/s/player. Regional Fly
egress blends to $0.020/$0.023/$0.029 per GB in low/base/high. Since 64 KiB/s
is 0.23593 decimal GB/player-hour, the state-egress lines are
$0.00472/$0.00543/$0.00684.

| Case | Match compute with fleet reserve | State egress | Variable DB/auth/object/log/relay allowance | Abuse/incident reserve | **Total/player-hour** |
|---|---:|---:|---:|---:|---:|
| Low | $0.00250 | $0.00472 | $0.00096 | 10% | **$0.0090** |
| Base | $0.00400 | $0.00543 | $0.00300 | 15% | **$0.0143** |
| High | $0.00800 | $0.00684 | $0.01000 | 25% | **$0.0311** |

Compute is an unmeasured 4–8-player planning allowance, not a Fly benchmark.
It assumes an average 4.5 occupied seats, safe authority packing, and 30% free
fleet capacity (`1 / 0.70 = 1.43x`). The high case represents weak packing,
more reconnect/replay/telemetry/relay work, and costly regional fragmentation;
it does **not** permit full JSON snapshots. Voice is excluded until bitrate,
speaking duty cycle, and relay percentage are chosen.

### Launch CCU and match placement

```text
launch average CCU = copies * lifetime hours * month-1 play share / 730
launch peak CCU = launch average CCU * peak ratio
peak matches = ceil(launch peak CCU / 4.5 occupied seats)
```

| Copies | Case | Launch avg CCU | Launch peak CCU | Peak 4–8p matches |
|---:|---|---:|---:|---:|
| 1K | low / base / high | 2 / 6 / 11 | 9 / 23 / 55 | 2 / 6 / 13 |
| 10K | low / base / high | 23 / 58 / 110 | 90 / 230 / 548 | 20 / 52 / 122 |
| 100K | low / base / high | 226 / 575 / 1,096 | 904 / 2,301 / 5,479 | 201 / 512 / 1,218 |
| 1M | low / base / high | 2,260 / 5,753 / 10,959 | 9,041 / 23,014 / 54,795 | 2,009 / 5,115 / 12,177 |

Capacity is placed per region, not from the global total. The base 1M launch,
for example, is approximately 12,658 NA, 6,904 EU, and 3,452 APAC peak players
before party-aware placement changes the split. Each concurrent match still
has one dedicated logical single-writer authority; thousands of authorities
are packed across a fleet, not collapsed into one global sim.

## Loaded labor and service-tail policy

These are transparent employer-cost/contractor-equivalent assumptions, not
salary surveys or hiring quotes:

| Posture | Staffed launch period | Active monthly labor | Tail monthly labor | Included operating allocation |
|---|---:|---:|---:|---|
| Smallest | 3 months | $7,500 | $1,000 | 0.3 engineer, 0.15 support/moderation, small security/on-call allowance; owner risk remains high |
| Recommended | 12 months | $32,000 | $8,000 | 1 backend/SRE, 1 support/moderation equivalent, security/privacy/on-call allowance |
| Scale | 24 months | $105,000 | $30,000 | 3 backend/SRE, 4 support/moderation equivalents, security/privacy/on-call allowance |

The tail is not 24/7 staffed response. If the product promises a 24/7 SLA,
adds voice/community moderation, or faces a sustained abuse wave, replace these
allowances with a real rota and vendor quotes. At every scale, customer tickets,
refunds, fraud loss, chargebacks, and moderation should eventually be modeled
per active user/ticket rather than hidden in one salary line.

## Lifetime contribution by sales cohort

Stack assignment is the economical default above: Smallest for 1K and 10K,
Recommended for 100K, Scale for 1M. `Before fixed` subtracts variable gameplay
service only. `After fixed` also subtracts the stack for every service month.
`After labor` finally subtracts active and tail operations labor. Negative is a
funding requirement, not an arithmetic error.

| Copies | Case / posture | Gross | Modeled receipts | Variable service | Fixed service | Ops labor | Contribution before fixed | After fixed | **After fixed + labor** |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1K | low / Smallest | $4,990 | $3,117 | $27 | $1,944 | $31,500 | $3,090 | $1,146 | **-$30,354** |
| 1K | base / Smallest | $4,990 | $3,117 | $172 | $5,832 | $55,500 | $2,946 | -$2,886 | **-$58,386** |
| 1K | high / Smallest | $4,990 | $3,117 | $1,244 | $13,608 | $103,500 | $1,873 | -$11,735 | **-$115,235** |
| 10K | low / Smallest | $49,900 | $31,172 | $270 | $1,944 | $31,500 | $30,902 | $28,958 | **-$2,542** |
| 10K | base / Smallest | $49,900 | $31,172 | $1,716 | $5,832 | $55,500 | $29,456 | $23,624 | **-$31,876** |
| 10K | high / Smallest | $49,900 | $31,172 | $12,440 | $13,608 | $103,500 | $18,732 | $5,124 | **-$98,376** |
| 100K | low / Recommended | $499,000 | $311,715 | $2,700 | $9,636 | $384,000 | $309,015 | $299,379 | **-$84,621** |
| 100K | base / Recommended | $499,000 | $311,715 | $17,160 | $28,908 | $576,000 | $294,555 | $265,647 | **-$310,353** |
| 100K | high / Recommended | $499,000 | $311,715 | $124,400 | $67,452 | $960,000 | $187,315 | $119,863 | **-$840,137** |
| 1M | low / Scale | $4,990,000 | $3,117,153 | $27,000 | $243,600 | $1,260,000 | $3,090,153 | $2,846,553 | **$1,586,553** |
| 1M | base / Scale | $4,990,000 | $3,117,153 | $171,600 | $730,800 | $2,880,000 | $2,945,553 | $2,214,753 | **-$665,247** |
| 1M | high / Scale | $4,990,000 | $3,117,153 | $1,244,000 | $1,705,200 | $4,320,000 | $1,873,153 | $167,953 | **-$4,152,047** |

The table produces the important business conclusion that the old `$0.18/copy`
row could not: successful unit economics for *hosting* do not automatically
fund a live-service organization. A $4.99 premium game needs one or more of:
owner-operated tail support, a finite online-service term, much larger sales,
additional paid content, platform funding, a higher realized price, or an
offline/player-hosted continuity path. Do not cut authority correctness or
send unmoderated support work to make the spreadsheet positive.

## Cash timing and launch reserve

Illustrative cash assumptions:

- 40% of unit sales occur in launch month, 25% in month 2, 15% in month 3,
  and 20% later;
- storefront cash becomes available an average **45 days after the sale**;
- actual platform payout schedules, withholding, reserve, tax, and refunds are
  quote/contract gaps;
- pre-fund two months of fixed stack plus active labor, plus launch-month
  variable usage. This is a survival reserve, not total development capital.

Base-case launch cash requirement:

| Copies / posture | Month-1 variable usage | Two months fixed + active labor | **Pre-payout reserve** | First 40% receipt tranche eventually due |
|---:|---:|---:|---:|---:|
| 1K / Smallest | $60 | $15,324 | **$15,384** | $1,247 |
| 10K / Smallest | $601 | $15,324 | **$15,925** | $12,469 |
| 100K / Recommended | $6,006 | $65,606 | **$71,612** | $124,686 |
| 1M / Scale | $60,060 | $250,600 | **$310,660** | $1,246,861 |

Cash is uneven even if lifetime contribution is positive. Keep the incident
reserve outside ordinary vendor autopay, set spend caps/alerts, and ensure an
egress or log-amplification bug cannot consume the refund/tax cash before the
first payout lands.

## Separate 24/48/96-player sensitivity

Do not blend large-event economics into the 4–8-player cohort rate. The
high-count model uses different authority shapes, AOI/serialization contracts,
and product gates. Its current S1 Fly NA/EU forecast at 64 KiB/s/player is:

| Seats in one match | S1 total/match-hour | Total/player-hour | 12 player-hours/copy if all play were in this tier |
|---:|---:|---:|---:|
| 24 | $0.2206 | $0.0092 | $0.110 |
| 48 | $0.4412 | $0.0092 | $0.110 |
| 96 | $0.8824 | $0.0092 | $0.110 |

That apparent flatness comes from full occupancy and proportional forecast
resources; it is not proof that a 96-player sim costs the same to build or
operate. For heavier simulation, raw compute before reserve and network rises
from Railway's $0.0377/$0.0719/$0.1370 per match-hour for 24-player S1/S2/S3,
to $0.1370/$0.2740/$0.5479 for 96-player S1/S2/S3. Cloud Run and Cloudflare
Container forecasts are higher, and 96-player S3 requires a large dedicated
host/custom shape. See
[`high-player-count-hosting-cost-model.md`](high-player-count-hosting-cost-model.md)
for the full vendor and network model.

Large matches also carry a worse failure blast radius, more expensive load
tests, harder moderation, and less packing flexibility. Price and capacity-plan
them as a separate event SKU until 90-minute S1/S2/S3 benchmarks prove CPU,
memory, bytes, tick p99, host isolation, and regional behavior.

## What would replace these assumptions with evidence

1. Measure actual compressed bytes/player-hour by message class at 4, 6, and 8
   players, including inputs, reliable events, rebases, reconnects, and loss.
2. Measure accepted match-hours per host at the movement-feel gate, then reserve
   30% fleet capacity and at least one failure domain per launch region.
3. Record MAU, database size/queries/connections, replay GB and operations,
   telemetry GB/series/cardinality, tickets/1K MAU, moderation events, refund
   and chargeback rates.
4. Replace the illustrative play curves with weekly retention and player-hour
   cohorts from the public test; derive launch peak from hourly concurrency,
   not copies sold.
5. Export invoices and vendor calculator/contract quotes for each region,
   including support, PITR, replicas, restore egress, WAF/DDoS, and enterprise
   minimums.
6. Decide the paid-online support term and continuity policy before launch.
   Model the shutdown/offline or player-hosted transition as a funded product
   milestone, not an emergency after the revenue tail disappears.

## Bottom line

Approve central hosted authority for v0.4 research. Approve `$0.0143/player-hour`
only as the **base compact-delta experiment target**, not a production promise.
Budget the fixed stack by calendar month, pre-fund the payout lag, and keep
operations labor visible. At $4.99, the architecture is affordable; the
long-lived service obligation is the commercial constraint.
