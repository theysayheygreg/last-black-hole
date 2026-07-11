# Agent Prompt: Ballpark-Compatible 4–8 Player Architecture

> Produce research and design output, not implementation code.

## Purpose

Design the strongest 4–8 player architecture that extends LBH's current v0.3
Ballpark Lite and EVE-inspired sim/client split. Pressure-test the existing
one-run/one-authority assumption and turn the result into concrete topology,
protocol, simulation, prediction, recovery, and rollout recommendations.

## Branch And Owned Output

- Target branch: `codex/v0.4-multiplayer-architecture`.
- Write scope: only `docs/v0.4/research/ballpark-multiplayer-architecture.md`.
- Do not edit integrated roadmap, decision log, changelog, or code.

## Read First

- `docs/v0.4/README.md`
- `docs/v0.3/ROADMAP.md`
- `docs/v0.3/OPEN-DECISIONS.md`
- `docs/project/EVE-ARCHITECTURE-RESEARCH.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/NETWORK-ARCHITECTURE-PLAN.md`
- `docs/project/SIM-DECOUPLING-PLAN.md`
- `docs/design/MOVEMENT.md`
- `scripts/sim-runtime.cjs`
- `src/sim/sim-client.js`

## Questions To Answer

1. What is already multiplayer-ready, and what remains local-stack illusion?
2. For 4–8 human players, what should the authoritative tick, input sampling,
   snapshot/delta cadence, interpolation, client prediction, reconciliation,
   event privacy, relevance, and late-join/reconnect contracts be?
3. How should the fluid/current model split between coarse authoritative truth
   and rich client reconstruction without undermining movement skill?
4. What failure/recovery behavior is required for host loss, sim crash,
   duplicate commands, stale snapshots, event gaps, slow clients, and overload?
5. What staged prototypes most cheaply falsify the architecture?

## Deliverable

Write the owned memo with a recommended topology, component and sequence
diagrams in text/Mermaid, current-to-target delta, network assumptions, failure
matrix, phased spikes, test/harness gates, and explicit rejected alternatives.
Make a strong recommendation.

## Guardrails

- One authority owns gameplay consequences unless the analysis proves a safer
  replacement.
- No gameplay truth in Three/UI/VFX/audio.
- Preserve protocol-v2 identity, event watermarks, snapshot rebase, Ballpark
  stable identity, and toroidal geometry where they remain sound.
- Distinguish 4–8-player engineering from MMO-scale marketing language.

