# Hosted Authority Provider Fit And Unit Costs

> Research snapshot: 2026-07-14. This is a provider/runtime and marginal
> authority-cost model, not a vendor quote or a company-margin forecast. The
> companion [`../MULTIPLAYER-UNIT-ECONOMICS.md`](../MULTIPLAYER-UNIT-ECONOMICS.md)
> owns copies-sold, $4.99 receipts, cohort behavior, fixed services, and
> business-scale conclusions.

Official-source detail and change notes live in
[`2026-07-14-hosted-provider-source-ledger.md`](2026-07-14-hosted-provider-source-ledger.md).
Recheck that ledger before spending money.

## Decision

Use a **hybrid control plane plus regional process authorities** for the first
public implementation.

1. **Primary live authority benchmark:** Fly Machines using a performance CPU,
   with one logical authority process per match. A larger Machine may host
   several isolated processes only after measured packing proves that one
   match cannot steal another match's tick budget.
2. **Control plane:** Cloudflare Workers/Pages at the edge, backed by managed
   Postgres for identities, entitlements, match leases, and idempotent run
   settlement. Object storage owns replay/evidence blobs. The control plane
   allocates authorities but never becomes a second gameplay writer.
3. **Low-cost fallback:** the same authority container on Hetzner Cloud, using
   CCX dedicated CPU for a production benchmark and CX shared CPU only as a
   price-floor experiment. Cloudflare remains the public edge. This saves
   compute money by accepting substantially more fleet, patching, failover,
   and incident-response work.
4. **High-upside experiments:** one Cloudflare Durable Object per match and one
   Cloudflare Container per match. Durable Objects have the cleanest logical
   single-writer mapping and striking rate-card economics, but require a real
   sim port. Containers preserve the process model but currently price a
   1-vCPU shape with much more memory than LBH has proved it needs.
5. **Later managed-fleet option:** AWS GameLift Servers after regional demand,
   fleet placement, session allocation, and included-bandwidth economics
   justify its integration weight. AWS Fargate is the transparent container
   comparator before that point.

Do not use Vercel, Railway, or Cloud Run as the first live match authority.
They now support WebSockets, but their documented 30-minute beta, 15-minute,
and 60-minute request boundaries respectively force authority-continuity work
that a stable process host does not. They remain useful control-plane and web
service candidates.

## What “One Dedicated Authority” Means

“Dedicated” means **one canonical single writer per live match**, not one
physical server purchased for every match.

- `M` concurrent matches produce `M` independent authority identities and
  `M` active authority epochs.
- Each match has one process, actor, or isolated runtime that alone may commit
  movement, collision, death, pickup, extraction, abilities, signal, and run
  outcome.
- Several authority processes may share a VM/node/container host. They do not
  share mutable match state or elect multiple writers.
- A host slot is an allocation unit, not an authority identity. If a host
  dies, the allocator may restore a match into a new slot only with a new
  fenced epoch and an accepted recovery point.
- A reconnecting client presents a short-lived join ticket bound to
  `(match_id, authority_epoch, player_id)`. It cannot choose a writer.
- Durable account and progression state is outside the live process. Settlement
  is idempotent and accepts only the current authority epoch.

This is compatible with the Ballpark/sim-client split: the authority runs the
canonical fixed-step Ballpark world; clients send intents and render predicted
or interpolated presentation. It is also compatible with an EVE-like control
plane: identities, allocation, leases, and durable settlement are global
services while each match simulation remains an isolated single-writer unit.

## Evidence Boundary

S20 is the only admitted transport/capacity input for this memo. Its paired
four-client candidate rounds measured:

| Measure | Round A | Round B |
|---|---:|---:|
| clients | 4 | 4 |
| candidate cadence | 9.80 Hz | 9.85 Hz |
| mean application payload/client | 31,018 B/s | 30,203 B/s |
| p95 application payload/client | 32,766 B/s | 32,361 B/s |
| projection p95 | 55.04 ms | 54.65 ms |
| authority core | 0.585 | 0.589 |

The cost model deliberately uses the higher measured mean, 31,018 B/s/client.
That is 0.1116648 decimal GB/player-hour and 0.4466592 GB/four-player
match-hour before unmeasured transport overhead.

These measurements are application payload only. They exclude WebSocket,
TCP/IP, TLS, WAN loss/retransmission, reconnect/rebase bursts, authentication,
telemetry, logs, and voice. They were not measured on any provider.

The admitted product surface is one to four players. Eight-player S20 is
closed. S24 did not run a 24-client live authority and therefore proves no
24/48/96-client provider capacity. The high-count section below is scenario
forecasting, not an admission decision.

## Authority Topology

### Control plane

The Cloudflare edge and durable store own:

- account authentication and stable player identifiers;
- entitlement verification and invite/join-code exchange;
- regional match allocation and capacity inventory;
- a fenced match lease containing `match_id`, `authority_epoch`, region,
  address, build/protocol versions, and expiry;
- short-lived join/rejoin tickets;
- authority heartbeats, draining, and crash classification;
- idempotent settlement of the final signed run outcome;
- abuse throttles, ban state, audit records, and operator controls.

The control plane does **not** calculate ship movement or accept gameplay
outcomes from clients.

### Match data plane

Each allocated match slot starts one authority process. Clients connect
directly to that slot through WSS, send sequenced intents, and receive compact
state updates plus periodic recovery rebases. The process periodically writes
an opaque recovery checkpoint and emits one settlement command. Its local disk
is disposable.

### Failure boundary

For v0.4, prefer a clear reconnect-or-abort contract over pretending seamless
failover exists. A later recovery path must prove:

1. the old writer is fenced before the new epoch accepts commands;
2. a checkpoint is recent and deterministic enough to resume;
3. each player input sequence is deduplicated across the epoch boundary;
4. settlement cannot be duplicated, reordered, or accepted from the old epoch.

## Cost Method

### Common four-player scenarios

| Input | Best | Base | Worst | Status |
|---|---:|---:|---:|---|
| transport multiplier over S20 payload | 1.10x | 1.25x | 1.75x | unmeasured |
| resulting traffic/match-hour | 0.4913 GB | 0.5583 GB | 0.7817 GB | arithmetic |
| fleet/warm multiplier | 1.10x | 1.30x | 1.67x | unmeasured |
| authority density on a 1-vCPU shape | 1 | 1 | 1 | conservative forecast |
| authority density on a 2-vCPU Hetzner shape | 2 | 1 | 1 | best case unproved |
| occupied seats | 4 | 4 | 4 | terminal product case |

The measured 0.585–0.589 core makes two four-player authorities on one vCPU an
invalid current assumption. Packing two onto a two-vCPU host is only a best
case; the hosted benchmark must prove that scheduler jitter and a simultaneous
heavy tick do not break either match.

The fleet multiplier represents spare/warm capacity and imperfect bin packing.
It is not the provider's billing multiplier.

```text
payload GB/player-hour = 31,018 * 3,600 / 1,000,000,000

network $/authority-hour = payload GB/player-hour
                             * 4 occupied seats
                             * transport multiplier
                             * regional egress $/GB

compute $/authority-hour = host $/hour
                             * fleet/warm multiplier
                             / safe authorities per host

total $/authority-hour = compute + network
total $/player-hour = total $/authority-hour / 4
```

Fixed Workers, database, storage, observability, support, labor, taxes, DDoS
upgrades, public IPv4, and unused minimum commitments are excluded. For
Cloudflare Container and Render rows, the model applies the published overage
rate even when a monthly included allowance may temporarily make marginal
egress zero. Hetzner rows treat egress as zero only while the selected server's
large included transfer pool is not exhausted.

## Current Provider Comparison

| Platform | Process/socket continuity | Current rate-card anchor | Network/abuse boundary | LBH position |
|---|---|---|---|---|
| **Fly Machines** | Explicit regional VM lifecycle; long-lived TCP/HTTP/WSS process | performance-1x/2-GB examples $0.0447–$0.0546/h by region | NA/EU egress $0.02/GB; application WAF/rate controls remain ours | **Primary authority benchmark.** Closest match to today's Node process and sane egress. Use performance CPU for the decision run. |
| **Cloudflare Durable Objects** | One globally addressed, single-threaded object with WebSockets | active duration $12.50/M GB-s after allowance; incoming WS messages billed 20:1 | Cloudflare edge; application auth/input throttles still ours | **Port experiment.** Best logical mapping and possible cost floor, but no proof the real sim fits timers/CPU/recovery. |
| **Cloudflare Containers** | Explicit container routing and WSS forwarding; live socket prevents sleep | 1-vCPU/6-GiB/12-GB `standard-2`: $0.129024 for a fully active hour before allowance | NA/EU 1 TB included then $0.025/GB; Worker/DO routing is separately billed | **Second benchmark.** Strong topology; current shape overprovisions memory and active CPU behavior is unmeasured. |
| **Vercel Services/Functions** | Native WSS now documented, but Pro/Enterprise max 30 minutes is beta and reconnect is mandatory | low-cost US Fluid: $0.128/active-vCPU-h + $0.0106/GB-h provisioned memory; Pro $20/user/mo | 1 TB Pro transfer then starts $0.15/GB; WAF/DDoS included | **Web/control plane only.** Official pages still conflict, and a bounded function is not one uninterrupted authority-hour. |
| **Google Cloud Run** | WSS request capped at 60 minutes; reconnect mandatory; affinity best-effort | Tier-1 instance-based 1 vCPU/1 GiB = $0.072 active hour | network transfer separate; app abuse controls and continuity are ours | **Control plane/conditional experiment.** Requires external lease and restore proof before authority use. |
| **AWS Fargate** | Long-lived container task with explicit service/task lifecycle | US East example 1 vCPU/2 GB = $0.0493704/h | AWS transfer, IPv4, logs, load balancer, and selected security controls extra | **Transparent AWS comparator.** Good process fit; total rate needs a selected-region stack. |
| **AWS GameLift Servers** | Managed game-server fleets and session placement | regional instance/Spot rate; per-second, one-minute minimum | eligible gen-6+ GameLift bandwidth included in supported commercial regions | **Later fleet option.** Get a region/instance quote and prove integration when scale warrants it. |
| **Render** | No fixed WSS duration; deploy/maintenance replacement requires drain/reconnect | Standard 1 CPU/2 GB $25/mo plus workspace plan | included bandwidth varies; overage $0.15/GB; DDoS/firewall included | **Compatible but bandwidth-expensive.** Useful low-traffic comparison or control service. |
| **Railway** | WSS supported, but official Socket.IO guide documents a 15-minute request maximum | 1 vCPU/2 GB about $0.0555/h; Hobby $5, Pro $20 | egress $0.05/GB; L4-and-below DDoS only, no app WAF | **Do not use for first authority.** Fifteen-minute churn needs continuity work and defeats the simple-host advantage. |
| **Hetzner Cloud** | Ordinary long-lived VM; we own placement and process supervision | EU CX23 shared 2 vCPU/4 GB $0.0104/h; CCX13 dedicated $0.0809/h | at least 20 TB included EU transfer; network DDoS filtering, but patching/WAF/firewall/backups are ours | **Low-cost fallback.** CX is the price floor, CCX the credible production benchmark; both carry the highest operations burden here. |

## Four-Player Authority Cost

Each cell is `$/authority-hour / $/player-hour` at four occupied seats. Values
are marginal planning estimates under the common scenario table, not invoices.

| Runtime | Best | Base | Worst | Important exclusion or invalidator |
|---|---:|---:|---:|---|
| **Fly performance-1x, low-cost region** | $0.0590 / $0.0147 | **$0.0693 / $0.0173** | $0.0903 / $0.0226 | fixed services, observability, regional rate mix |
| **Cloudflare Container standard-2** | $0.1213 / $0.0303 | $0.1583 / $0.0396 | $0.2350 / $0.0588 | Workers/DO requests; assumes 0.585/0.75/1.0 active vCPU by scenario |
| **Railway 1 vCPU/2 GB** | $0.0856 / $0.0214 | $0.1001 / $0.0250 | $0.1318 / $0.0329 | **15-minute WSS boundary makes this hypothetical** |
| **Render Standard** | $0.1114 / $0.0278 | $0.1283 / $0.0321 | $0.1744 / $0.0436 | uses $0.15/GB overage even if allowance remains |
| **Hetzner CX23 shared 2 vCPU** | $0.0057 / $0.0014 | $0.0135 / $0.0034 | $0.0174 / $0.0043 | best packs two; shared-CPU stability and operations unpriced |
| **Hetzner CCX13 dedicated 2 vCPU** | $0.0445 / $0.0111 | $0.1052 / $0.0263 | $0.1351 / $0.0338 | best packs two; transfer assumed inside allowance; operations unpriced |
| **Cloud Run 1 vCPU/1 GiB, compute only** | $0.0792 / $0.0198 | $0.0936 / $0.0234 | $0.1202 / $0.0301 | **add network; 60-minute WSS boundary** |
| **Fargate 1 vCPU/2 GB, compute only** | $0.0543 / $0.0136 | $0.0642 / $0.0160 | $0.0824 / $0.0206 | add transfer, IPv4, load balancer, logs, security services |

The primary planning anchor is therefore **$0.0693 per occupied four-player
authority-hour, or $0.0173/player-hour**, before fixed/shared services. The
range to carry into a cohort model is $0.0590–$0.0903/authority-hour for the
first Fly implementation. A fleet running `M` simultaneous matches spends
approximately `M * authority-hour rate`; it does not collapse those matches
into one authority.

Hetzner CX's tiny number is not the recommendation. It exposes how little raw
VM compute can cost when bandwidth is bundled, while hiding the real price of
shared-CPU jitter, regional fleet engineering, patching, failover, and on-call
work. CCX is the honest dedicated-CPU comparison.

### Durable Object rate-card experiment

One active 128-MB Durable Object costs about `$0.00576/object-hour` after the
included duration allowance:

```text
0.128 GB * 3,600 seconds * $12.50 / 1,000,000 GB-seconds = $0.00576
```

If four clients each send 15 inputs/s, the 20:1 incoming-WebSocket billing
ratio produces 10,800 billed requests/hour, or about $0.00162 after the
request allowance. The resulting **$0.00738/authority-hour,
$0.00185/player-hour** is a rate-card curiosity, not an LBH forecast. It omits
Workers, storage, logs, control services, and—most importantly—whether the
real 0.585-core fixed-step sim can run correctly inside the Durable Object CPU
and scheduling model.

### Vercel rate-card experiment

A hypothetical fully active 1-vCPU/2-GB Fluid hour in a listed low-cost US
region is `$0.128 + 2*$0.0106 = $0.1492` before transfer and invocations. It
does not buy one uninterrupted authority-hour: the current maximum is a
30-minute Pro/Enterprise beta boundary. At least two function epochs and a
proved writer handoff would be required, so Vercel is excluded from the
authority-cost comparison.

## Heavy Match Forecast: 24 / 48 / 96 Clients

The detailed scenario model remains
[`high-player-count-hosting-cost-model.md`](high-player-count-hosting-cost-model.md).
Its S1/S2/S3 resource envelopes are forecasts for increasingly dense ecology,
contacts, fields, and event churn. They are not evidence that the current
single-threaded writer can consume those cores.

| Seats/tier | Forecast vCPU / GiB | Railway resource-rate compute/h | Cloud Run compute/h | CF Container active CPU+memory/h | Feasibility warning |
|---|---:|---:|---:|---:|---|
| 24 S1 | 0.75 / 1.25 | $0.0382 | $0.0576 | $0.0652 | ordinary small compute; live 24-client proof absent |
| 24 S2 | 1.5 / 2.25 | $0.0729 | $0.1134 | $0.1282 | performance/dedicated CPU preferred |
| 24 S3 | 3 / 4 | $0.1388 | $0.2232 | $0.2520 | internal deterministic worker path required |
| 48 S1 | 1.5 / 2.25 | $0.0729 | $0.1134 | $0.1282 | performance/dedicated CPU preferred |
| 48 S2 | 3 / 4 | $0.1388 | $0.2232 | $0.2520 | internal deterministic worker path required |
| 48 S3 | 6 / 8 | $0.2776 | $0.4464 | $0.5040 | exceeds current CF Container max vCPU shape |
| 96 S1 | 3 / 4 | $0.1388 | $0.2232 | $0.2520 | canonical writer and fanout both need proof |
| 96 S2 | 6 / 8 | $0.2776 | $0.4464 | $0.5040 | exceeds current CF Container max vCPU shape |
| 96 S3 | 12 / 16 | $0.5551 | $0.8928 | $1.0080 | **currently infeasible: more vCPU does not fix a serial writer** |

Those rows are compute-only and do not include reserve. At the high-count
model's 64 KiB/s/player transport target, network alone is:

| Seats | GB/match-hour | Fly at $0.02/GB | CF Container at $0.025/GB | Railway at $0.05/GB | Render at $0.15/GB |
|---:|---:|---:|---:|---:|---:|
| 24 | 5.662 | $0.113 | $0.142 | $0.283 | $0.849 |
| 48 | 11.325 | $0.226 | $0.283 | $0.566 | $1.699 |
| 96 | 22.649 | $0.453 | $0.566 | $1.132 | $3.397 |

One 96-player match is still **one** canonical authority, not 24 four-player
authorities. It may need deterministic internal job workers for broadphase,
AI, projection, compression, and fanout, but those workers cannot independently
commit world truth. Before any 24/48/96 offering, run a 90-minute live-client
matrix at S1/S2/S3 with actual compression, regional WAN, reconnects, and
neighboring-match contention.

## Operational And Abuse Costs Missing From The Tables

The hosted bill is not the service cost. Budget and test these separately:

- at least two authority regions, plus capacity unavailable during placement
  failure or provider incident;
- Postgres high availability, backups, point-in-time recovery, connection
  pooling, migrations, and restore drills;
- replay/evidence object storage and retention policy;
- metrics, logs, traces, crash dumps, synthetic probes, and paging;
- TLS/WSS edge, application WAF/rate limits, credential stuffing, join-code
  guessing, malicious input floods, and entitlement abuse;
- operator tools for draining a host, fencing an epoch, aborting/refunding a
  match, banning an identity, and replaying settlement;
- DDoS escalation beyond each provider's included network protection;
- player support, incident response, and the calendar-length service tail.

Cloudflare and Vercel package more edge protection. Hetzner packages cheap
compute and network filtering but leaves the largest operational surface to
us. Fly is the middle ground. That labor difference will dominate fractions of
a cent of compute at small scale and belongs in the companion unit-economics
model.

## Benchmark And Decision Gates

1. Package the current S20 authority as one immutable container/process with
   graceful drain, health/readiness, epoch fencing, and no local durable truth.
2. Run the same four-player 90-minute scenario on Fly performance CPU, Hetzner
   CCX, and Cloudflare Container in at least two regions. Record tick p50/p95/
   max, event-loop delay, CPU, RSS, bytes, retransmits, reconnects, and cost.
3. On 2-vCPU hosts, run one then two independent authorities. Reject packing
   if either match loses its gate when both enter their heaviest scenario.
4. Port the identical deterministic scenario—not a chat-room surrogate—to one
   Durable Object. Compare state hashes, scheduling, restart/recovery, and the
   actual request/duration bill.
5. Kill one live authority and prove the v0.4 abort contract. Only then attempt
   checkpoint recovery with a fenced new epoch.
6. Exercise expired/replayed join tickets, duplicate inputs, old-epoch
   settlement, join floods, and a malicious high-rate client.
7. Measure real transport bytes including TLS and reconnect rebases. Replace
   the 1.10x/1.25x/1.75x overhead factors with evidence.
8. Feed measured authority density, regional mix, real play hours, and fixed
   service quotes into the companion unit-economics artifact before choosing a
   production vendor.

## Final Position

Central hosted authority is still the right production direction for LBH. At
the admitted four-player S20 shape, the first credible process-host forecast
is cents per match-hour, not dollars. That makes correctness, cheat resistance,
stable movement truth, and durable settlement worth buying.

Choose Fly for the first public authority proof, Cloudflare for the edge and
control plane, Postgres for durable identity/settlement, and Hetzner CCX as the
low-cost operational fallback. Keep Durable Objects and Cloudflare Containers
as measured alternatives. Do not mistake cheap rate cards, WebSocket support,
or high socket limits for a proved simulation lifecycle.
