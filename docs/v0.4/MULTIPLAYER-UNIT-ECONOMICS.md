# v0.4 Multiplayer Unit Economics

## Decision frame

At $4.99, the admitted four-player game can support central per-match
authorities under the best and base traffic/operations envelopes. It cannot
support the worst service posture modeled here: that posture loses money even
at one million copies because a long service tail and $20,300 monthly fixed
stack dominate the cohort.

The least risky continuity plan is hybrid: hosted identity, entitlement,
settlement, and discovery with player-hosted private matches available when
central gameplay service is uneconomic or eventually retired. Pure local
private play has the lowest service obligation but gives up centralized
gameplay authority and its cheat/settlement benefits.

This model does **not** assume eight-player admission or 24/48/96 density. Every
concurrent match owns one logical single-writer authority. Multiple authorities
may be packed on a host only through the explicit density evidence inputs.
`safeAuthoritiesPerHost` is derived as
`floor(measuredAuthoritiesPerHost * safetyFactor)`, never from copies sold.

## Reproducible model

The canonical inputs, full audit ledger, sensitivity rows, and source hashes
are in [`evidence/unit-economics/`](evidence/unit-economics/). Regenerate with:

```bash
node tests/v04-multiplayer-unit-economics.cjs
node scripts/v04-multiplayer-unit-economics.cjs \
  --config docs/v0.4/evidence/unit-economics/config.json \
  --output docs/v0.4/evidence/unit-economics/model.json \
  --source-commit 00f91f14fe0281bfc643b2c239763a9ecd55314c
```

The receipt ledger applies deductions in this explicit order:

```text
gross = copies * $4.99
net receipts before operations = gross
  * (1 - refunds)
  * (1 - storefront fee)
  * (1 - chargebacks)
  * (1 - tax/VAT/FX allowance)
```

Refunds, chargebacks, and tax/VAT/FX are independent inputs. They are not
presented as universal rates. The 15%, 20%, and 30% storefront bands are
scenario assumptions; this document makes no claim that any is a current
universal storefront default.

Demand and authority sizing are similarly explicit:

```text
lifetime player-hours = copies * active-player conversion
  * monthly hours per active player * active lifetime months
multiplayer player-hours = lifetime player-hours * multiplayer share
hosted multiplayer player-hours = multiplayer player-hours * hosted gameplay share
authority-hours = hosted multiplayer player-hours / average players per match
match starts = authority-hours / average match duration
average hosted CCU = hosted multiplayer player-hours / (service months * 730)
peak matches = average hosted CCU * peak-to-mean / average players per match
peak hosts = ceil(peak matches / safe authorities per host)
```

The model exposes `costPerAuthorityHour`, `costPerHostedPlayerHour`,
`safeAuthoritiesPerHost`, egress per client, `averagePlayersPerMatch`, and
match duration in every row. Central scenarios currently use three average
players per match and a 45-minute match. The one- or two-authority host-density
inputs are explicitly `planningAssumptionPendingMeasurement`; they are not
capacity evidence.

## Case assumptions

| Input | Best | Base | Worst |
|---|---:|---:|---:|
| storefront fee | 15% | 20% | 30% |
| refunds | 3% | 8% | 12% |
| chargebacks | 0.2% | 0.5% | 1.5% |
| tax/VAT/FX allowance | 1% | 3% | 7% |
| active-player conversion | 45% | 65% | 80% |
| monthly hours/active | 4 | 6 | 10 |
| active lifetime | 3 months | 6 months | 12 months |
| multiplayer share | 45% | 60% | 75% |
| service tail | 12 months | 36 months | 84 months |
| peak-to-mean | 4x | 4.5x | 5x |

The resulting net receipts before operations are $4.065, $3.545, and $2.816
per copy. These are scenario outputs, not forecasts.

## Local/listen/private fallback

Hosted gameplay share, authority-hours, gameplay egress, and hosted match CCU
are all exactly zero. Operations still include the explicit per-active-player
support allowance plus optional packaging/update-manifest costs.

| Case | Copies | Gross | Net receipts | Operations | Contribution |
|---|---:|---:|---:|---:|---:|
| Best | 1,000 | $4,990 | $4,065 | $45 | $4,020 |
| Best | 10,000 | $49,900 | $40,650 | $450 | $40,200 |
| Best | 100,000 | $499,000 | $406,497 | $4,500 | $401,997 |
| Best | 1,000,000 | $4,990,000 | $4,064,966 | $45,000 | $4,019,966 |
| Base | 1,000 | $4,990 | $3,545 | $497 | $3,048 |
| Base | 10,000 | $49,900 | $35,446 | $3,422 | $32,024 |
| Base | 100,000 | $499,000 | $354,465 | $32,672 | $321,793 |
| Base | 1,000,000 | $4,990,000 | $3,544,649 | $325,172 | $3,219,477 |
| Worst | 1,000 | $4,990 | $2,816 | $2,120 | $696 |
| Worst | 10,000 | $49,900 | $28,158 | $12,920 | $15,238 |
| Worst | 100,000 | $499,000 | $281,579 | $120,920 | $160,659 |
| Worst | 1,000,000 | $4,990,000 | $2,815,791 | $1,200,920 | $1,614,871 |

## Central per-match authority

| Case | Copies | Net receipts | Operations | Contribution | Hosted player-h | Authority-h | Peak matches |
|---|---:|---:|---:|---:|---:|---:|---:|
| Best | 1,000 | $4,065 | $2,502 | $1,563 | 2,430 | 810 | 0.37 |
| Best | 10,000 | $40,650 | $3,024 | $37,626 | 24,300 | 8,100 | 3.70 |
| Best | 100,000 | $406,497 | $8,240 | $398,257 | 243,000 | 81,000 | 36.99 |
| Best | 1,000,000 | $4,064,966 | $60,402 | $4,004,564 | 2,430,000 | 810,000 | 369.86 |
| Base | 1,000 | $3,545 | $34,416 | -$30,871 | 14,040 | 4,680 | 0.80 |
| Base | 10,000 | $35,446 | $38,984 | -$3,537 | 140,400 | 46,800 | 8.01 |
| Base | 100,000 | $354,465 | $84,664 | $269,801 | 1,404,000 | 468,000 | 80.14 |
| Base | 1,000,000 | $3,544,649 | $541,471 | $3,003,178 | 14,040,000 | 4,680,000 | 801.37 |
| Worst | 1,000 | $2,816 | $1,758,594 | -$1,755,778 | 72,000 | 24,000 | 1.96 |
| Worst | 10,000 | $28,158 | $1,789,143 | -$1,760,985 | 720,000 | 240,000 | 19.57 |
| Worst | 100,000 | $281,579 | $2,094,626 | -$1,813,046 | 7,200,000 | 2,400,000 | 195.69 |
| Worst | 1,000,000 | $2,815,791 | $5,149,456 | -$2,333,665 | 72,000,000 | 24,000,000 | 1,956.95 |

Central unit-cost and break-even results:

| Case | $/authority-h | $/hosted player-h | Hosted player-h/$ | Egress/client | Safe authorities/host | Cohort break-even copies |
|---|---:|---:|---:|---:|---:|---:|
| Best | $0.00492 | $0.003999 | 250.04 | 32 KiB/s | 2 | 610 |
| Base | $0.01148 | $0.009253 | 108.07 | 64 KiB/s | 1 | 11,165 |
| Worst | $0.01476 | $0.019076 | 52.42 | 96 KiB/s | 1 | none in modeled envelope |

`breakEvenHostedPlayerHours` is calculated at every sales scale after fixed,
one-time, support, and storage costs. It is zero where those costs already
exceed receipts. At one million copies the central best/base maximums are
approximately 1.004 billion and 343.2 million hosted player-hours; the worst
case remains zero because the service stack and non-hosting variable costs
consume the available receipts.

## Hybrid control plane plus player-hosted private matches

Hosted authority-hours and gameplay egress are zero; identity/control,
settlement, storage, observability, and support remain explicit costs.

| Case | Copies | Gross | Net receipts | Operations | Contribution |
|---|---:|---:|---:|---:|---:|
| Best | 1,000 | $4,990 | $4,065 | $667 | $3,398 |
| Best | 10,000 | $49,900 | $40,650 | $1,090 | $39,559 |
| Best | 100,000 | $499,000 | $406,497 | $5,323 | $401,174 |
| Best | 1,000,000 | $4,990,000 | $4,064,966 | $47,645 | $4,017,321 |
| Base | 1,000 | $4,990 | $3,545 | $3,380 | $165 |
| Base | 10,000 | $49,900 | $35,446 | $6,652 | $28,794 |
| Base | 100,000 | $499,000 | $354,465 | $39,377 | $315,088 |
| Base | 1,000,000 | $4,990,000 | $3,544,649 | $366,626 | $3,178,023 |
| Worst | 1,000 | $4,990 | $2,816 | $20,629 | -$17,813 |
| Worst | 10,000 | $49,900 | $28,158 | $38,816 | -$10,658 |
| Worst | 100,000 | $499,000 | $281,579 | $220,688 | $60,891 |
| Worst | 1,000,000 | $4,990,000 | $2,815,791 | $2,039,408 | $776,383 |

Hybrid cohort break-even is 155 copies best, 949 base, and 23,407 worst.
This is the clearest modeled economic continuity path, but it transfers NAT,
host loss, host cheating, availability, and client hardware risk to players.

## Sensitivity and red-team findings

The checked-in model perturbs each named input and records the contribution
delta for every topology, case, and sales scale. The dominant inputs are:

1. realized price/net receipts, particularly storefront fee and refund/tax
   treatment;
2. service-tail fixed monthly cost in the worst central case;
3. active lifetime and multiplayer hours, because they multiply transport,
   compute, and variable control costs;
4. egress price and bytes/client in central service;
5. host price, warm factor, and measured safe authority density.

At one million central/base copies, a 10% list-price increase changes modeled
contribution by +$354,465; a 10% relative storefront-fee increase changes it
by -$88,616; 10% more active lifetime changes it by -$17,203; and 10% higher
egress price changes it by -$7,619. These are mechanical sensitivities, not
pricing recommendations.

Red-team constraints preserved in the implementation and tests:

- copies never divide host count or authority density;
- zero hosted hours produce zero authority-hours, compute, egress, CCU, and
  peak hosts;
- copies, player-hours, receipts, and total costs are monotonic within a fixed
  case/topology;
- fee tiers and deduction order are independently tested;
- negative rates, over-100% rates, more-than-four average seats, zero density,
  and invalid prices are rejected;
- cent display rounding is separate from full-precision calculation;
- every row carries formulas and component ledgers rather than an opaque
  blended `$ / player-hour` constant.

## Limitations and refresh contract

All nonzero provider prices are imported from the July 10 research snapshot
and marked `pendingRefresh`. Update values and source/status fields in
`config.json`; no code rewrite is required. Re-run the same command and commit
the changed config, output, and checksums.

The model excludes corporate income tax, publisher share/recoupment,
development, marketing, actual regional price/discount mix, payout timing,
voice/TURN, and any eight/24/48/96 capacity claim. Support is a transparent
per-active-player cash allowance plus named fixed components, not a staffing
or SLA promise. Host density, retention, actual four-player bytes, regional
egress, and match occupancy must be replaced with production measurements
before this becomes a budget.
