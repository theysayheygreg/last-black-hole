# Last Singularity v0.4 Multiplayer Architecture Program

> Branch: `codex/v0.4-multiplayer-architecture`
>
> Base: `codex/v0.3-ballpark-roadmap` at branch creation. Any stale v0.3 text
> in orchestration metadata is superseded by this live branch and document set.

## Final Outcome

The research and architecture program is decision-ready. It does **not** prove
that LBH is already a public 4–8-player product.

- S20 negotiated compression is the admitted replication path for **one
  through four players**. The requested minimum of four is supported by local
  product evidence.
- Eight-player v0.4 admission is closed. S23 and S23P remain executable,
  default-off research paths; neither is admitted. The later split-fragment
  prototype is historical only, fully reverted, and failed its terminal abort
  screen.
- The recommended verified topology is one dedicated **logical gameplay
  authority per live match/group**. If `M` matches are live, `M` independently
  fenced authorities are live. Measured packing may place several authorities
  on one host; there is never one global gameplay authority.
- True authority-free public P2P is rejected. Relay-assisted player-hosted
  authority remains a useful, visibly unverified private/long-tail fallback.
- Hosted identity, entitlement, placement, and settlement belong to a central
  control plane. The first authority benchmark is Fly performance CPU;
  Cloudflare edge plus Postgres is the control-plane default; Hetzner CCX is
  the operational fallback. Cloudflare Durable Objects and Containers are
  measured experiments. Vercel is control-plane/web only.
- S24 measured a synthetic H24 fixture, not a live 24-client authority. The
  live cohort never admitted and the raw capture never started. H48/H96 are
  far extrapolations and X96 fails its modeled writer and network screens.

Start with [`MULTIPLAYER-DECISION-PACKET.md`](MULTIPLAYER-DECISION-PACKET.md)
for the executive decision, costs, scale evidence, gates, and next milestones.

## Read Order

1. [`MULTIPLAYER-DECISION-PACKET.md`](MULTIPLAYER-DECISION-PACKET.md) — final
   executive answer to the original request.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — authority, transport, network,
   identity, recovery, hosting, and private fallback contracts.
3. [`ROADMAP.md`](ROADMAP.md) — staged implementation and measurement plan.
4. [`OPEN-DECISIONS.md`](OPEN-DECISIONS.md) — Greg's product calls, separated
   from engineering gates.
5. [`COMPLETION-AUDIT.md`](COMPLETION-AUDIT.md) — requirement-by-requirement
   coverage and evidence status.
6. [`HOSTED-IDENTITY-PLACEMENT-DECISION.md`](HOSTED-IDENTITY-PLACEMENT-DECISION.md)
   — identifier lifetimes, trust boundaries, leases, tickets, settlement, and
   privacy.
7. [`MULTIPLAYER-UNIT-ECONOMICS.md`](MULTIPLAYER-UNIT-ECONOMICS.md) —
   reproducible $4.99 economics at 1K/10K/100K/1M copies.

## Evidence And Research Anchors

- [`MULTIPLAYER-STATE-PAIR-S20-COMPRESSION.md`](MULTIPLAYER-STATE-PAIR-S20-COMPRESSION.md)
  — admitted one-through-four replication evidence.
- [`MULTIPLAYER-STATE-PAIR-S23-PUBLIC-BODY.md`](MULTIPLAYER-STATE-PAIR-S23-PUBLIC-BODY.md)
  and
  [`MULTIPLAYER-STATE-PAIR-S23P-PREPARED-PUBLIC-SOURCE.md`](MULTIPLAYER-STATE-PAIR-S23P-PREPARED-PUBLIC-SOURCE.md)
  — executable default-off eight-player research and rejection.
- [`MULTIPLAYER-STATE-PAIR-SPLIT-PUBLIC-FRAGMENT.md`](MULTIPLAYER-STATE-PAIR-SPLIT-PUBLIC-FRAGMENT.md)
  — terminal eight-seat negative and full revert.
- [`evidence/s24-factorial-preflight/README.md`](evidence/s24-factorial-preflight/README.md)
  and
  [`evidence/s24-live-loopback/README.md`](evidence/s24-live-loopback/README.md)
  — synthetic H24 measurement and terminal live non-proof.
- [`research/p2p-history-network-budgets.md`](research/p2p-history-network-budgets.md)
  — authority-free, listen-server, and dedicated-host comparison with
  historical cases and network models.
- [`research/multiplayer-identity-data-model.md`](research/multiplayer-identity-data-model.md)
  — local/cloud/hybrid identity taxonomy and normalized data model.
- [`research/2026-07-14-hosted-provider-source-ledger.md`](research/2026-07-14-hosted-provider-source-ledger.md)
  and
  [`research/hosted-costs-unit-economics.md`](research/hosted-costs-unit-economics.md)
  — dated official provider inputs and deployment recommendation.
- [`evidence/unit-economics/`](evidence/unit-economics/) — checked-in inputs,
  formulas, full tables, source statuses, and checksums.

## Durable Authority Vocabulary

“One authority” always means one logical single-writer gameplay authority for
one live match/group. Concurrent matches multiply that unit horizontally.
Internal workers may later compute pure derived work behind deterministic
barriers, but only the match writer orders inputs and commits movement,
contacts, loot, death, extraction, events, and results.

The EVE-inspired part is the causal and operational shape, not a single shared
MMO world: one run is one coarse authority unit; durable data is separate from
the hot sim; derived client state is boxed; overload is explicit and fair.

## Program Boundary

The architecture/research objective is complete. Product implementation is
not. The next work is four-player completion, Greg's hosted-progression choice,
Phase 5 identity/settlement/placement, and Phase 6 regional measurement. No
new eight-player optimization or high-count capacity claim is authorized by
this packet.
