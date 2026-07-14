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
  --source-commit 5758ccf36f1de5640bb9edb496989a25cd9aa8c0
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
match duration in every row. The primary central scenario uses the refreshed
four-occupied-seat Fly envelope and a 45-minute match. Every central case fixes
safe density at one authority per host: no packing credit is taken. Tests reject
packed density unless its evidence status is an explicit measured benchmark.

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
| Best | 1,000 | $4,065 | $2,528 | $1,537 | 2,430 | 608 | 0.28 |
| Best | 10,000 | $40,650 | $3,285 | $37,365 | 24,300 | 6,075 | 2.77 |
| Best | 100,000 | $406,497 | $10,852 | $395,644 | 243,000 | 60,750 | 27.74 |
| Best | 1,000,000 | $4,064,966 | $86,527 | $3,978,440 | 2,430,000 | 607,500 | 277.40 |
| Base | 1,000 | $3,545 | $34,529 | -$30,984 | 14,040 | 3,510 | 0.60 |
| Base | 10,000 | $35,446 | $40,117 | -$4,670 | 140,400 | 35,100 | 6.01 |
| Base | 100,000 | $354,465 | $95,997 | $258,468 | 1,404,000 | 351,000 | 60.10 |
| Base | 1,000,000 | $3,544,649 | $654,801 | $2,889,848 | 14,040,000 | 3,510,000 | 601.03 |
| Worst | 1,000 | $2,816 | $1,758,846 | -$1,756,030 | 72,000 | 18,000 | 1.47 |
| Worst | 10,000 | $28,158 | $1,791,662 | -$1,763,504 | 720,000 | 180,000 | 14.68 |
| Worst | 100,000 | $281,579 | $2,119,820 | -$1,838,241 | 7,200,000 | 1,800,000 | 146.77 |
| Worst | 1,000,000 | $2,815,791 | $5,401,400 | -$2,585,609 | 72,000,000 | 18,000,000 | 1,467.71 |

Central unit-cost and break-even results:

| Case | $/authority-h | $/hosted player-h | Hosted player-h/$ | Egress/client | Safe authorities/host | Cohort break-even copies |
|---|---:|---:|---:|---:|---:|---:|
| Best | $0.0590 | $0.014750 | 67.80 | 33.32 KiB/s | 1 | 614 |
| Base | $0.0693 | **$0.017325** | 57.72 | 37.86 KiB/s | 1 | 11,598 |
| Worst | $0.0903 | $0.022575 | 44.30 | 53.01 KiB/s | 1 | none in modeled envelope |

`breakEvenHostedPlayerHours` is calculated at every sales scale after fixed,
one-time, support, and storage costs. It is zero where those costs already
exceed receipts. At one million copies the central best/base maximums are
approximately 272.3 million and 183.3 million hosted player-hours; the worst
case remains zero because the service stack and non-hosting variable costs
consume the available receipts.

The worst case is structurally loss-making, not merely too small at 1K. Its
$2.816 net receipt/copy is below $3.646 variable operations/copy: $1.625 of
Fly gameplay, $0.720 variable control, $1.200 support, and about $0.101 storage.
On top, the 84-month service tail contributes $1,705,200 of fixed stack and
$50,000 one-time work. At one million copies those terms produce $5,401,400
operations against $2,815,791 receipts. Shortening the service tail cannot by
itself cure the negative per-copy margin; lifetime/support/control assumptions
must also change.

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
5. authority compute, warm-fleet, and measured safe-density inputs.

At one million central/base copies, a 10% list-price increase changes modeled
contribution by +$354,465; a 10% relative storefront-fee increase changes it
by -$88,616; 10% more active lifetime changes it by -$28,536; 10% higher
authority compute changes it by -$20,405; and 10% higher egress changes it by
-$3,919. These are mechanical sensitivities, not
pricing recommendations.

Provider authority-rate sensitivity at four occupied seats:

| Provider/runtime | Best authority-h / player-h | Base authority-h / player-h | Worst authority-h / player-h | Position |
|---|---:|---:|---:|---|
| Fly performance | $0.0590 / $0.014750 | $0.0693 / $0.017325 | $0.0903 / $0.022575 | primary benchmark; application egress included, shared fixed costs separate |
| Hetzner CX23 | $0.0057 / $0.001425 | $0.0135 / $0.003375 | $0.0174 / $0.004350 | price floor; shared-CPU stability and operations unpriced |
| Hetzner CCX13 | $0.0445 / $0.011125 | $0.1052 / $0.026300 | $0.1351 / $0.033775 | dedicated comparison; transfer allowance and operations caveats |
| Cloudflare Durable Object | $0.00738 / $0.001845 experimental only | — | — | rate-card curiosity; unproven port, never a capacity forecast |

These alternatives replace only variable gameplay authority cost; the same
explicit fixed control-plane/database/observability/support stack must still be
added. Vercel is intentionally absent: the refreshed research keeps it
control-plane-only because bounded function epochs are not an uninterrupted
single-writer authority-hour.

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

Fly/Hetzner/Cloudflare-DO authority inputs are bound to official-source refresh
commit `963c4427b78d60e9fd4cd481debd5920ea39002f` and marked
`verifiedOfficialDerived`; Fly egress is marked `verifiedOfficial`. The older
R2 storage allowance remains `pendingRefresh` because it was not refreshed in
that provider ledger. Update values and source/status fields in `config.json`;
no code rewrite is required. Re-run the same command and commit the changed
config, output, and checksums.

The model excludes corporate income tax, publisher share/recoupment,
development, marketing, actual regional price/discount mix, payout timing,
voice/TURN, and any eight/24/48/96 capacity claim. Support is a transparent
per-active-player cash allowance plus named fixed components, not a staffing
or SLA promise. Host density, retention, actual four-player bytes, regional
egress, and match occupancy must be replaced with production measurements
before this becomes a budget.
