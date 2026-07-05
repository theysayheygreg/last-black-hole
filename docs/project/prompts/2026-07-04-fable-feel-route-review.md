# Fable/Orrery Prompt: Feel + Route Pass

> Weekend delegation prompt for Fable through Orrery. Please produce a review
> and design memo, not code, unless Greg explicitly asks for implementation.

## Purpose

Last Singularity is in a Three-first, server-authoritative v0.3 architecture
branch. The biggest product risk is still feel: if the player cannot
intentionally move, surf, slingshot, and recover, the rest of the game cannot
carry the build.

Use Fable's horsepower to pressure-test the movement and route design from a
player-feel point of view. We want a plan that makes the next playable build
more controllable, more legible, and more intentionally routed without turning
the ship into a generic twin-stick craft.

## Read First

- `docs/v0.2/DESIGN.md`
- `docs/design/PILLARS.md`
- `docs/design/MOVEMENT.md`
- `docs/design/CONTROLS.md`
- `docs/design/SLINGSHOT.md`
- `docs/v0.3/ROADMAP.md`
- `docs/v0.3/RC-GATE.md`
- `docs/project/ROADMAP.md`
- `docs/design/AGENT-TESTING.md`

Optional if useful:

- `tests/agent-play-eval.cjs`
- `tests/movement-golden.cjs`
- `tests/slingshot-edge-queue.cjs`
- `src/shared/movement-constants.cjs`
- `src/ballpark.cjs`

## Current Context

- Movement is the game. The design intent is "surf the ASCII spacetime fluid,"
  not "fly freely on top of a backdrop."
- v0.3 has a Ballpark mirror/relevance layer, authoritative movement fixtures,
  queued remote slingshot-edge input, event journals, and render diagnostics.
- The current branch still needs a human playtest verdict before it can be
  called a good playable build.
- Greg has flagged repeated historical issues around coordinate drift, spawn
  safety, immediate deaths, inconsistent controls, and maps that can feel like
  they pull the player around without enough agency.

## Questions To Answer

1. What should the first 60 seconds of a successful run feel like, second by
   second, on Shallows?
2. Which movement helpers should be real mechanics versus invisible assists?
   Consider wave magnetism, well escape assist, portal alignment, wreck approach
   stickiness, counter-steer damping, input buffering, and beginner drift guard.
3. What should the player be able to intentionally do after five minutes of
   learning: brake, orbit, slingshot, recover, skim, pick up, extract?
4. What route shapes should Shallows, Expanse, and Deep Field teach? Name the
   route beats and the intended "I meant to do that" moments.
5. Which movement metrics should the harness measure so agents can catch broken
   feel before Greg becomes QA?
6. What visual/audio affordances would make slingshot opportunity and loss of
   control readable without covering the ASCII fabric?
7. Which current design promises should be cut, deferred, or simplified because
   they fight the movement fantasy?

## Deliverable

Write a review memo under `docs/project/reviews/` with:

- A strong recommendation for the next movement slice.
- A ranked list of 3-5 experiments, each with expected feel, risks, and how to
  evaluate it.
- A Shallows route teaching plan, with one or two later-map escalation ideas.
- A proposed "movement acceptance test" that blends agent play eval, metrics,
  and a short human playtest checklist.
- Concrete files or systems likely to change.
- Any open questions Greg should answer before implementation.

## Guardrails

- Do not make the client renderer the source of movement truth.
- Do not hide coordinate conversions outside `src/coords.js`.
- Do not recommend generic inertial arcade controls unless you can explain how
  they preserve fluid surfing.
- Prefer changes that create reviewable slices over full-system rewrites.
