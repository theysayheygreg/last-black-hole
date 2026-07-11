# Agent Prompt: True P2P History, Pitfalls, And Network Budgets

> Perform deep web research. Produce a cited research memo, not code.

## Purpose

Investigate a true peer-to-peer LBH design with no centralized server and no
permanent physics/gameplay authority. Compare deterministic lockstep,
distributed simulation, rollback, consensus/arbitration, mesh networking,
listen servers, relays, and hybrid verification. Use historical games-industry
examples to identify where each model succeeded or failed.

## Branch And Owned Output

- Target branch: `codex/v0.4-multiplayer-architecture`.
- Write scope: only `docs/v0.4/research/p2p-history-network-budgets.md`.
- Do not edit integrated roadmap, decision log, changelog, or code.

## Read First

- `docs/v0.4/README.md`
- `docs/v0.3/ROADMAP.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/EVE-ARCHITECTURE-RESEARCH.md`
- `docs/design/MOVEMENT.md`

## Research Requirements

- Browse current primary technical sources and direct historical accounts.
- Cover representative RTS lockstep, fighting-game rollback, console/PC
  listen-server or host-migration games, distributed/mesh experiments, and
  modern relay/NAT traversal practice.
- Distinguish true authority-free P2P from a player-hosted authority.
- Cite claims inline with dated links. Prefer developer postmortems, GDC
  material, official platform docs, standards, and engineering papers.

## Questions To Answer

1. Can LBH's floating-point fluid/physics and dynamic consequence systems be
   made deterministic enough for lockstep across current targets?
2. If authority is distributed, how are conflicts, cheating, host departure,
   save settlement, and divergent simulations resolved?
3. What do NAT traversal, relay fallback, packet loss, jitter, asymmetric
   uplinks, and full-mesh scaling do to 4–8 players?
4. What bandwidth and packet-rate budgets follow from inputs, hashes,
   snapshots/checkpoints, rollback history, events, voice, and telemetry?
5. Which P2P variants should LBH reject, prototype, or keep as private-play
   fallbacks?

## Deliverable

Write the owned memo with a historical case-study table, topology comparison,
failure/cheat matrix, quantitative 4/6/8-player network models with formulas,
latency and loss targets, NAT/relay requirements, recommendation, and bounded
prototype plan.

## Guardrails

- Do not call listen-server architecture “true P2P.”
- State uncertainty and version/date for historical claims.
- Model upstream and downstream separately for every peer count.
- Protect Movement Is the Game: input delay and correction artifacts are
  product costs, not footnotes.

