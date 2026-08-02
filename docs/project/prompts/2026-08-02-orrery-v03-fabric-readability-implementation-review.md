# Orrery Prompt: v0.3 Fabric Readability Implementation Review

> E3 delegation prompt for Orrery. Please review the implementation contract,
> not the already-approved art direction, and return one decisive memo rather
> than code.

## Purpose

Greg and Primary Sol have completed a top-to-bottom design simplification of
LBH movement-space presentation. The locked result has three layers: broad
local-flow lanes, visible-well deformation of those lanes, and one
source-telegraphed event swell. The implementation crosses authority movement,
the GPU fluid presentation, and source-bound VFX, so independent architecture
and game-readability judgment is warranted before code begins.

Escalation: **E3**. This is a difficult-to-reverse movement/presentation seam
touching the project's two highest pillars, Movement Is the Game and Art Is
Product. Greg explicitly requested Orrery review.

## Exact Review Target

- Branch: `codex/v0.3-ballpark-roadmap`
- Product/design base: `d9939949c2e7075f305998cfd18de34dac47be3c`
- Implementation plan commit: use the commit containing this prompt and
  `docs/v0.3/FABRIC-READABILITY-IMPLEMENTATION-PLAN.md`
- No implementation has started.

## Read First

- `docs/v0.3/FABRIC-READABILITY-IMPLEMENTATION-PLAN.md`
- `docs/v0.3/OPEN-DECISIONS.md` — Moving Reference Frame through Three-Layer
  Fabric Grammar
- `docs/v0.3/reviews/2026-08-01-movement-physics-fabric-redesign.md`
- `docs/v0.3/reviews/2026-08-02-fabric-force-and-world-object-catalog.md`
- `docs/v0.3/concepts/fabric-flow-lanes-concept-01.png`
- `docs/v0.3/concepts/fabric-well-distortion-concept-01.png`
- `docs/v0.3/concepts/fabric-event-wave-concept-01.png`
- `scripts/coarse-flow-field.cjs`
- `src/fluid.js`
- `src/render/shaders/fluid.glsl.js` — especially `FRAG_DISPLAY`
- `src/presentation/well-wave-presentation.js`

## Current Context

- Gameplay truth is server/sim-owned at one 15 Hz clock.
- Remote clients already receive and upload a world-anchored coarse current
  texture. The display shader currently reads a blended local velocity texture.
- Existing visual noise, brightness, surf-band, halo, and ecology layers are
  attractive but make useful flow illegible.
- Existing wave force is still a per-tick acceleration band and must become one
  authority-owned swept crossing impulse.
- Greg has approved all mechanical and art-direction decisions in the plan.
  Do not reopen option soup around those decisions.

## Questions To Answer

1. Does the ordered V1–V6 plan preserve one authority while still reaching a
   playable visual result quickly? Name any reordering that materially reduces
   risk or time-to-feel.
2. Is the proposed first lane seam—shader-local presentation sampling the
   accepted coarse-current texture—the simplest credible path to stable curved
   lanes? Compare it briefly against a presentation-only advected lane texture
   and bounded CPU streamline geometry, then make one recommendation.
3. Does the plan keep current direction, qualitative gravity deformation, and
   one-shot wave truth distinct enough that the renderer cannot accidentally
   create a second physics model?
4. Identify at most five concrete blockers or fix-forwards. Cite exact source
   or plan evidence and classify each as blocker, fix-forward, backlog, or Greg
   decision.
5. Give a concise implementation handoff: the first two commits you would ask
   a Luna/xhigh renderer-movement worker to produce and the one capture that
   should decide whether the lane substrate works.

## Deliverable

Write:

`docs/project/reviews/2026-08-02-orrery-v03-fabric-readability-implementation-review.md`

Include:

- verdict: ACCEPT, ACCEPT WITH FIX-FORWARD, or REWORK;
- recommended lane-rendering seam and why;
- prioritized findings, maximum five;
- recommended vertical ordering;
- one playable/capture acceptance rubric;
- unresolved Greg decisions only if truly required before implementation.

Post one compact receipt in `#last-black-hole` with the memo path. Stop after
that receipt.

## Guardrails

- Read-only review. Do not implement, edit code, run broad tests, merge, push,
  deploy, or invoke another agent.
- Do not reopen the locked 20% carry, localized well profile, 25% one-shot
  impulse, 0 / 1 / 2 / 3 staggered cadence, or approved concept composites.
- Favor video-game simplicity and visible player consequences over scientific
  fluid/orbital accuracy.
- Preserve server authority and one renderer update loop.
- Do not propose a new engine, generalized field framework, production-grade
  reliability layer, or exhaustive test program.
- Human play owns feel and art acceptance.

