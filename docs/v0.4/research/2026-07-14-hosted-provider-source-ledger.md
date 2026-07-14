# Hosted Provider Source Ledger — 2026-07-14

This ledger records the official-source inputs used by
[`hosted-costs-unit-economics.md`](hosted-costs-unit-economics.md). It is a
research snapshot, not a quote. Prices, included allowances, beta features,
and regional availability must be rechecked before a purchase or production
commitment.

All pages below were accessed 2026-07-14. Currency is USD unless the source
states otherwise. Tax, discounts, support plans, public IPv4, logging,
databases, and other ancillary services are excluded unless called out.

## LBH Evidence Inputs

- [`MULTIPLAYER-STATE-PAIR-S20-COMPRESSION.md`](../MULTIPLAYER-STATE-PAIR-S20-COMPRESSION.md)
  is the only admitted hosted-cost transport baseline. Its two four-client
  candidate rounds measured 30,203–31,018 application payload bytes/s/client,
  32,361–32,766 p95 bytes/s/client, 9.80–9.85 Hz candidate cadence,
  54.65–55.04 ms projection p95, and 0.585–0.589 authority core.
- Those bytes exclude WebSocket framing, TCP/IP, TLS, reconnect/rebase traffic,
  control-plane traffic, and WAN retransmission. The cost memo therefore marks
  all transport overhead factors as unmeasured.
- The admitted surface is one to four players. Eight-player S20 is closed and
  the S24 24-client material is synthetic only. No provider is credited with
  proven 8/24/48/96-player capacity.

## Cloudflare

### Durable Objects

- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/):
  paid Workers starts at $5/month; Durable Objects include 1 million requests
  and 400,000 GB-s/month, then cost $0.15/million requests and
  $12.50/million GB-s. Duration uses 128 MB while an object is active. Incoming
  WebSocket messages receive a 20:1 request-billing ratio; outgoing WebSocket
  messages are not request-billed.
- [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/):
  one object is single-threaded, has a soft 1,000 requests/s ceiling, supports
  up to 10 GB of SQLite storage, and accepts WebSocket messages up to 32 MiB.
- [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/):
  hibernation can avoid duration charges while idle. An actively ticking LBH
  match with frequent messages should not assume meaningful hibernation.

**Interpretation:** one Durable Object per match maps cleanly to LBH's logical
single-writer rule, but the current Node authority is not a Durable Object.
Timer stability, CPU fit, restart semantics, and the sim port remain unproved.

### Workers and Containers

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/):
  the paid plan is $5/month and includes 10 million requests and 30 million
  CPU-ms; excess is $0.30/million requests and $0.02/million CPU-ms. A
  WebSocket upgrade is a request; messages passing through an established
  Worker WebSocket are not additional Worker requests.
- [Containers pricing](https://developers.cloudflare.com/containers/pricing/):
  the paid plan includes 25 GiB-hours of memory, 375 vCPU-minutes of active CPU,
  and 200 GB-hours of disk. Excess rates are $0.009/GiB-hour provisioned memory,
  $0.072/vCPU-hour active CPU, and $0.000252/GB-hour disk. North America and
  Europe include 1 TB/month egress, then charge $0.025/GB. Other regions have
  smaller allowances and $0.04–$0.05/GB listed rates.
- The same pricing page lists `standard-2` at 1 vCPU, 6 GiB memory, and 12 GB
  disk. A fully active hour is therefore $0.129024 before included allowances:
  `$0.072 + 6*$0.009 + 12*$0.000252`.
- [Container WebSocket example](https://developers.cloudflare.com/containers/examples/websocket/)
  and [routing/scaling guidance](https://developers.cloudflare.com/containers/platform-details/scaling-and-routing/):
  WebSockets can be forwarded to a container and explicit instance routing is
  available. Live sockets prevent scale-to-zero. Placement is regional rather
  than arbitrary per-city placement, and capacity varies by region.

**Interpretation:** Containers are now a serious runtime candidate rather than
an unnamed emerging feature. Active-CPU billing may reward a sim that spends
time idle between ticks, but the local 0.585-core observation does not prove
Cloudflare CPU billing or packing density.

## Vercel

- [WebSocket support article](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections),
  updated 2026-06-22: Vercel Functions now natively support WebSockets, but a
  connection is pinned only for the function's maximum duration.
- [Vercel Services and Fluid compute](https://vercel.com/kb/guide/vercel-services-fluid-compute)
  and [Services limits](https://vercel.com/kb/guide/vercel-services): Services
  use Functions on Fluid compute and inherit function memory and duration
  limits.
- [Real-time WebSocket guidance](https://vercel.com/kb/guide/real-time-chat-websockets):
  connections close at the maximum function duration and clients must
  reconnect.
- [30-minute function-duration announcement](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes),
  updated 2026-06-15: Pro and Enterprise Node/Python functions can run up to
  1,800 seconds in beta. Older [function limits](https://vercel.com/docs/functions/limitations)
  still show lower limits, and the general [limits page](https://vercel.com/docs/limits)
  still says Functions cannot be WebSocket servers. The official docs are not
  fully reconciled.
- [Fluid compute pricing](https://vercel.com/docs/functions/usage-and-pricing):
  in listed low-cost US regions, active CPU is $0.128/hour and provisioned
  memory is $0.0106/GB-hour. A hypothetical fully active 1-vCPU/2-GB hour is
  therefore $0.1492 before transfer and invocations.
- [Vercel pricing](https://vercel.com/pricing): Pro is $20/user/month with
  included usage credit; 1 TB fast transfer is included, then transfer starts
  at $0.15/GB. WAF and DDoS mitigation are included.

**Interpretation:** the July 10 statement that Vercel lacked native WebSockets
is stale. The production verdict is unchanged: a forced 30-minute beta
boundary is not an uninterrupted match authority-hour, and reconnect cannot
be allowed to create a second writer. Use Vercel for web/control surfaces, not
the first live authority.

## Fly.io

- [Fly pricing](https://fly.io/docs/about/pricing/): machine rates are regional.
  Current tables list shared-1x/1-GB examples around $0.0082–$0.0103/hour and
  performance-1x/2-GB examples around $0.0447–$0.0546/hour. North America and
  Europe internet egress is $0.02/GB; several other regions are $0.04/GB, and
  Africa/India are $0.12/GB. Volumes are $0.15/GB-month.
- [Machines overview](https://fly.io/docs/machines/overview/) and
  [configuration reference](https://fly.io/docs/reference/configuration/):
  Machines expose explicit start/stop lifecycle, TCP/UDP/HTTP services,
  regional placement, connection-aware auto-start/stop, and optional volumes.
  Root filesystems are ephemeral.

**Interpretation:** Fly remains the clearest first process-host benchmark. Use
a performance CPU for the decision benchmark; a cheap shared CPU is only an
exploration lane until tick stability and noisy-neighbor sensitivity pass.

## Google Cloud Run

- [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets):
  WebSockets are supported, but every stream is an HTTP request capped at 60
  minutes. Clients must reconnect, session affinity is best-effort, and an open
  socket keeps the instance active and billable. A container can accept up to
  1,000 concurrent connections, which is not the same as 1,000 authoritative
  simulations.
- [Cloud Run committed-use pricing](https://docs.cloud.google.com/run/cud):
  the listed Tier 1 on-demand instance-based rates are $0.000018/vCPU-second
  and $0.000002/GiB-second, or $0.0648/vCPU-hour and $0.0072/GiB-hour. A
  1-vCPU/1-GiB active hour is $0.072 before requests and network transfer.
- [CPU configuration](https://docs.cloud.google.com/run/docs/configuring/services/cpu):
  default CPU is 1 vCPU; up to 8 vCPU is supported with memory constraints.

**Interpretation:** Cloud Run is strong for stateless control services. The
60-minute socket ceiling and best-effort affinity make a live authority
conditional on an external lease, reconnect, and recovery design.

## AWS

### Fargate

- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/): the US East
  Linux/x86 example is $0.000011244/vCPU-second and $0.000001235/GB-second, or
  $0.0404784/vCPU-hour and $0.004446/GB-hour. A 1-vCPU/2-GB task is
  $0.0493704/hour. Billing is per second with a one-minute minimum; 20 GB
  ephemeral storage is included. Standard AWS transfer, public IPv4, and
  observability charges are separate. Fargate Spot is interruptible.

### GameLift Servers

- [GameLift Servers instance pricing](https://aws.amazon.com/gamelift/servers/pricing/instance-pricing/)
  and [cost planning](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-intro-pricing.html):
  pricing is regional/instance-specific, per second with a one-minute minimum;
  Spot pricing changes over time and Spot capacity can be interrupted.
- The current pricing page states that supported generation-6-and-newer
  GameLift instances include bandwidth in and out in supported commercial
  regions. Exact instance prices are loaded dynamically and were not converted
  into a static LBH rate without selecting a region and instance.

**Interpretation:** Fargate is the transparent AWS container comparator.
GameLift becomes attractive when managed fleet/session placement and bundled
bandwidth justify its integration weight; it requires a region/instance quote
before an LBH cost claim.

## Render

- [Render pricing](https://render.com/pricing): Starter web services are
  $7/month for 0.5 CPU/512 MB and Standard is $25/month for 1 CPU/2 GB. Service
  runtime is prorated by the second. Workspace tiers are Hobby $0, Pro
  $25/month, and Scale $499/month. Included bandwidth varies by workspace;
  overage is $0.15/GB.
- [Render WebSockets](https://render.com/docs/websocket): there is no fixed
  WebSocket duration, but deploys and maintenance replace instances. Clients
  must reconnect, state should be external, and SIGTERM drain time is bounded.

**Interpretation:** Render has a compatible process/socket lifecycle and a
clear operator surface, but its post-allowance egress is expensive for a
state-streaming game.

## Railway

- [Railway plans and pricing](https://docs.railway.com/pricing/plans): Hobby is
  $5/month and Pro $20/month, credited toward usage. Listed resource rates are
  $0.000463/vCPU-minute, $0.000231/GB-minute, $0.05/GB egress, and
  $0.15/GB-month volume storage. A continuously allocated 1-vCPU/2-GB hour is
  approximately $0.0555.
- [Public networking limits](https://docs.railway.com/networking/public-networking/specs-and-limits)
  and [Socket.IO guide](https://docs.railway.com/guides/socketio): HTTP/1.1
  WebSockets are supported, but the guide documents a 15-minute maximum
  request duration and requires reconnect handling.
- [Regions](https://docs.railway.com/deployments/regions): listed metal regions
  include California, Virginia, Amsterdam, and Singapore.

**Interpretation:** the July 10 memo understated a decisive limit. Fifteen
minute browser socket churn makes Railway unsuitable for the first persistent
authority without an explicit continuity proof. It remains useful for
short-lived control services.

## Hetzner Cloud

- [2026 price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/):
  current Germany/Finland pricing lists CX23 (2 shared vCPU, 4 GB RAM, 40 GB
  disk) at $0.0104/hour with a $6.49 monthly cap, excluding VAT and IPv4.
  CCX13 dedicated CPU is listed at $0.0809/hour with a $50.49 cap.
- [Billing FAQ](https://docs.hetzner.com/cloud/billing/faq/): servers bill by
  the hour up to the monthly cap and continue billing while powered off until
  deleted. EU cloud servers include at least 20 TB outbound traffic per month.
- [Shared versus dedicated CPU](https://docs.hetzner.com/cloud/servers/faq/):
  shared CPU performance can vary; dedicated CCX is intended for predictable
  CPU-intensive workloads.
- [Security measures](https://docs.hetzner.com/general/security-and-identify/technical-and-organizational-measures/)
  and [Cloud SLA](https://docs.hetzner.com/general/company-and-policy/slas-cloud/):
  Hetzner provides network DDoS detection/filtering and a 99.9% cloud SLA, but
  the customer owns server patching, application security, firewall policy,
  backups, orchestration, and incident response.

**Interpretation:** Hetzner is the low-cost fallback/control benchmark, not the
low-operations choice. Benchmark both CX shared and CCX dedicated; do not book
CX density until it passes tick stability under neighbor contention.

## Source-Quality Rules

1. A vendor calculator, sales quote, or selected-region invoice overrides this
   ledger.
2. Included transfer is a fleet/month allowance, not automatically a marginal
   zero-dollar match. The memo shows overage rates where available and labels
   allowance-dependent zeros.
3. A WebSocket connection limit is not a simulation-capacity limit.
4. A serverless reconnect path is not authority continuity unless the lease,
   epoch, recovery point, and single-writer invariant are proved.
5. No listed DDoS feature removes LBH's need for authentication, input limits,
   join throttles, application abuse controls, and incident telemetry.
