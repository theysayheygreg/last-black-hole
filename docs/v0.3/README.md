# Last Singularity v0.3 Docs

This folder is the planning home for the v0.3 line.

## Branch Contract

v0.3 structural work should happen on a branch, not directly on `main`.
The initial planning branch is:

`codex/v0.3-ballpark-roadmap`

`main` remains the v0.2 demo and stabilization line for small fixes, Deck
deploys, and weekend-build polish. The v0.3 branch should regularly merge
current `main` after those fixes land, but it should not force unfinished
architecture work back into the v0.2 demo path.

## Release Thesis

v0.3 is the production-readiness architecture release. The goal is not to add a
larger feature pile. The goal is to make movement, collision, entity ownership,
events, rendering contracts, and future multiplayer pressure easier to reason
about than the inherited game-jam loops.

The working theme is:

**Ballpark authority, ECS-ready shape, multiplayer-minded contracts.**

## Read Order

1. `ROADMAP.md` - v0.3 plan, delegated workstreams, milestones, and gates.
2. `../reference/CARBON-ENGINE-RESEARCH.md` - Carbon/Destiny/Trinity lessons
   being mined for LBH-sized contracts.
3. `../project/LOCAL-PROTOCOL.md` - current local authority protocol.
4. `../project/NETWORK-ARCHITECTURE-PLAN.md` - older network plan and context.
5. `../project/SIM-DECOUPLING-PLAN.md` - previous sim/client split planning.
6. `../project/MECHANICS-SIM-RENDER-AUDIT.md` - current mechanics and
   sim/renderer audit baseline.
7. `../design/PILLARS.md` and `../design/MOVEMENT.md` - design guardrails.
8. `../design/TEST-HARNESS.md` - current harness contract.
9. `../v0.2/ROADMAP.md` - active demo/stabilization roadmap.

## What v0.3 Is Not

- It is not a Carbon Engine migration.
- It is not a full ECS rewrite on day one.
- It is not public multiplayer as a promised product feature.
- It is not a generic physics-engine migration unless a spike proves it earns
  its cost.
- It does not move gameplay truth into Three, shaders, particles, or UI.
- It does not block v0.2 demo fixes on `main`.
