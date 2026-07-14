# Last Singularity v0.4 Multiplayer Architecture Program

> Working branch: `codex/v0.4-multiplayer-architecture`
>
> Base: current `codex/v0.3-ballpark-roadmap` at branch creation.

## Goal

Produce a decision-ready architecture and implementation roadmap for private
and, if viable, public 4–8 player Last Singularity sessions. The work must
extend v0.3 Ballpark authority, protocol-v2 identity, stamped events,
snapshots, relevance lanes, and the EVE-inspired one-run/one-authority model.
It must not quietly turn research assumptions into shipped claims.

“One authority” in this program always means **one logical single-writer
authority instance per live match/group**. Concurrent matches have concurrent
authorities. Those match instances are scheduled and packed across a regional
fleet; the authority boundary is not a requirement to buy one VM or container
for every match.

The target outcome is a multiplayer game Greg can play with at least four and
at most eight human players. This program chooses how to reach that outcome;
it does not pre-decide that decentralized peer-to-peer or hosted authority is
the winner.

The capacity model also pressure-tests 24, 48, and 96 simultaneous clients in
one heavier match authority. Those are future scale envelopes and stress
profiles, not v0.4 launch promises. Horizontal forecasts separately multiply
one authority per concurrent match across the regional fleet.

## Questions This Branch Must Resolve

1. What changes are required to make the current local authoritative stack a
   robust 4–8 player internet product?
2. What identity, authentication, profile, entitlement, session, player,
   reconnect, and durable-progression records exist locally, in cloud storage,
   or in both?
3. Can a true no-central-authority peer-to-peer design preserve LBH movement,
   collision, loot, extraction, signal, and run causality? If not, what hybrid
   P2P or player-hosted variant remains useful?
4. What tick, input, event, snapshot/delta, voice, telemetry, and egress
   budgets produce acceptable play at realistic latency and packet loss?
5. Which hosted topology and vendors fit one-run/one-authority processes, and
   what do they cost at concurrency and sales scales from 1,000 to 1,000,000?
6. At a $4.99 price point, what margin remains after storefront fees, refunds,
   taxes assumptions, payment/platform costs, compute, bandwidth, persistence,
   observability, support, and fraud/abuse reserves?
7. At 24/48/96 clients in one match, when do AOI, binary deltas, internal
   workers, dedicated hosts, lower clocks, or TiDi become mandatory, and what
   do light/representative/heavy versions of that sim cost?

## Research Lanes

- `docs/project/prompts/2026-07-10-agent-ballpark-multiplayer-architecture.md`
- `docs/project/prompts/2026-07-10-agent-multiplayer-identity-data.md`
- `docs/project/prompts/2026-07-10-agent-p2p-history-network-budgets.md`
- `docs/project/prompts/2026-07-10-agent-hosting-cost-unit-economics.md`

Returned research belongs in `docs/v0.4/research/`. The coordinator integrates
it into architecture decisions, cost models, open decisions, and a phased
implementation roadmap. Research agents own only their named memo files; the
coordinator owns the integrated documents.

## Integrated Documents

- `ARCHITECTURE.md` — recommended topology, authority, transport, network,
  identity, recovery, hosting, and private fallback.
- `ROADMAP.md` — phased prototype-to-alpha plan with falsifiable gates.
- `OPEN-DECISIONS.md` — recommended defaults and the product calls Greg owns.
- `ORCHESTRATION.md` — durable goal prompt, completed lanes, continuation
  order, ownership, and CodexBar heartbeat behavior.
- `research/phase0-multiplayer-baseline.md` — implemented 1/4/8 trust,
  privacy, settlement, bytes, latency, tick, and heap evidence.
- `phase1-json-wss-adapter-plan.md` — same-process JSON WebSocket integration,
  queue/backpressure, packaging, migration, rollback, and acceptance gates.
- `MULTIPLAYER-STATE-PAIR-S21-AUTHORITY-CLOCK.md` — eight-player critical-path
  attribution, public-only worker feasibility, authority fences, and the
  bounded runtime pilot gate.

## Evidence Standard

- Current vendor prices and platform constraints must use dated primary
  sources and links.
- Historical claims should prefer postmortems, conference talks, engineering
  papers, official documentation, or direct developer accounts.
- Every cost table must state assumptions and formulas, not just totals.
- Separate peak concurrent players from copies sold and monthly active users.
- Model at least low, expected, and high concurrency/traffic cases.
- Separate listen-server, deterministic lockstep, rollback, relay-assisted
  P2P, dedicated authority, and serverless/control-plane services.
- Name anti-cheat, host migration, NAT traversal, DDoS, save ownership,
  desync, replay, moderation, privacy, and operational failure modes.

## Guardrails

- Gameplay truth remains sim-owned unless a documented v0.4 decision replaces
  that contract after explicit comparison.
- One LBH run remains the default coarse authority unit.
- Ballpark ids, run ids, player ids, command credentials, sequences, event
  watermarks, and snapshot rebase are existing assets to extend.
- Three, VFX, UI, and audio remain presentation consumers.
- Art Is Product and Movement Is the Game remain product gates; networking
  that makes the fluid movement feel dishonest is not acceptable.
- This branch plans and prototypes multiplayer architecture. It does not
  promise public matchmaking, an MMO population, or a vendor commitment.

## Coordinator Control Loop

1. Keep independent lanes in separate files and inspect returned memos from
   source.
2. Classify findings as immediate architecture, prototype spike, cost input,
   open product decision, or rejected direction.
3. Reconcile disagreements with explicit assumptions and a strong
   recommendation.
4. Maintain a current checkpoint before usage-window exhaustion.
5. Resume after the Codex five-hour reset and continue until the integrated
   recommendation, roadmap, budgets, and decision ledger are complete.

## Deliverables

- architecture comparison and recommendation;
- identity/data model and trust-boundary diagrams;
- network model and per-session/per-player budgets;
- hosted topology/vendor comparison and cost calculator assumptions;
- $4.99 unit economics at 1K, 10K, 100K, and 1M copies;
- named fixed-service stacks, cohort duration, launch CCU, payout reserve, and
  loaded operations labor at those sales scales;
- phased prototype-to-production roadmap with acceptance gates;
- explicit open decisions for Greg;
- implementation prompt packets only after the architecture choice is ready.
