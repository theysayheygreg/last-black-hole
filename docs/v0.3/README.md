# Last Singularity v0.3 Docs

> Document revision: v0.3. Updated 2026-07-26.

This folder is the source-of-truth home for the v0.3 candidate line. The
architecture is implemented; remaining work is release evidence, physical
device acceptance, Greg's feel/taste review, and explicit promotion.

## Branch Contract

v0.3 structural work happens on a version-owned branch, not directly on
`main`. The accepted simulation/harness source branch is:

`codex/v0.3-sim-harness-simplification`

`main` remains the v0.2 demo and stabilization line for small fixes, Deck
deploys, and weekend-build polish. Do not merge, cherry-pick, or rebase v0.2
or later-version work into this source line. Promotion remains an explicit
Greg decision after its exact-source gates.

## Release Thesis

v0.3 is the production-readiness architecture release. The goal is not to add a
larger feature pile. The goal is to make movement, collision, entity ownership,
events, rendering contracts, and future multiplayer pressure easier to reason
about than the inherited game-jam loops.

The working theme is:

**Ballpark authority, ECS-ready shape, multiplayer-minded contracts.**

## Read Order

1. `ROADMAP.md` - v0.3 plan, delegated workstreams, milestones, and gates.
2. `DECISIONS.md` - accepted implementation choices for the current v0.3
   source line.
3. `OPEN-DECISIONS.md` - the few decisions still owned by Greg.
4. `RC-GATE.md` - playable release-candidate checklist, current blockers, and
   required evidence.
5. `DESIGN-INDEX.md` - living v0.3/v0.3.1 design ownership and historical
   archive routes.
6. `../reference/CARBON-ENGINE-RESEARCH.md` - Carbon/Destiny/Trinity lessons
   being mined for LBH-sized contracts.
7. `../project/LOCAL-PROTOCOL.md` - current local authority protocol.
8. `../project/NETWORK-ARCHITECTURE-PLAN.md` - older network plan and context.
9. `../project/SIM-DECOUPLING-PLAN.md` - previous sim/client split planning.
10. `../project/MECHANICS-SIM-RENDER-AUDIT.md` - current mechanics and
   sim/renderer audit baseline.
11. `../design/PILLARS.md` and `../design/MOVEMENT.md` - stable pointers to
    the current design guardrails and preserved historical context.
12. `../design/TEST-HARNESS.md` - current harness contract.
13. `../v0.2/ROADMAP.md` - active demo/stabilization roadmap.

## What v0.3 Is Not

- It is not a Carbon Engine migration.
- It is not a full ECS rewrite on day one.
- It is not public multiplayer as a promised product feature.
- It is not a generic physics-engine migration unless a spike proves it earns
  its cost.
- It does not move gameplay truth into Three, shaders, particles, or UI.
- It does not block v0.2 demo fixes on `main`.
