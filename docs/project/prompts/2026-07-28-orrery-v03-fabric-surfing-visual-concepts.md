# Orrery Prompt: v0.3.2 Fabric And Surfing Visual Concepts

> E3 strategic design prompt for Orrery. Produce a visual design review and
> concept package, not implementation code. This packet should be handed off
> only after the current v0.3.1 Deck baseline is settled.

## Purpose

Last Singularity says that movement is the game and the ASCII spacetime fabric
is the product. In the current build those ideas are mechanically present, but
busy scenes can turn the fabric into visual noise: many wells, waves, wakes,
entities, labels, Noise contacts, and late-match effects can all compete for
the same pixels. The answer cannot simply be “turn the fabric down,” because
the player needs to see a current, anticipate it, and surf it.

Design a top-to-bottom visual grammar for the fabric and surfing as a readable
game mechanic. We want strong creative direction, not a neutral list of shader
knobs. The result must show what the player reads in motion: which flow is
surfable, which force is dangerous, what belongs to a well or entity, what is
only atmosphere, and what should visually aggregate or disappear as density
rises.

## Read First

- `docs/design/PILLARS.md`
- `docs/design/MOVEMENT.md`
- `docs/v0.3/reviews/v0.3.2-fabric-surfing-camera-review.md`
- `docs/v0.3/reviews/v0.3.1-design-review.md` — especially the fabric truth
  contract, “three seas” audit, swell telegraphing, and surfing sections
- `docs/v0.3/reviews/v0.3.1-fabric-design.md`
- `docs/project/reviews/2026-07-04-fable-entity-visual-hybrid-review.md`
- `docs/v0.3/evidence/visual-review-manifest.md`
- `src/fluid.js`
- `src/render/shaders/fluid.glsl.js`
- `src/render/shaders/ascii.glsl.js`
- `src/sim/flow-field.js`
- `src/presentation/scene-source.js`
- `src/presentation/presentation-frame.js`
- `src/presentation/presentation-style.js`
- `src/render-three/world-scene-presentation.js`
- `src/wave-rings.js`
- `src/wells.js`
- `scripts/sim-runtime.cjs` — authoritative player force application, coarse
  field, wave rings, and current Inhibitor/well consequences

Use the newest playable v0.3.1 source and its available 1280x800/Deck captures,
not an old jam build or generic space-game reference.

## Current Functional Ground

- Gameplay truth is authoritative at one 15 Hz integration rate on the 5×5,
  15×15, and 25×25 maps. Do not redesign physics or restore map-specific
  fidelity.
- The client already has a GPU fluid display, ASCII post-process, camera-
  anchored fluid window, authoritative coarse-field hydration, explicit wave
  rings, procedural wells, Three entity families, presentation quality tiers,
  and bounded VFX ownership.
- Current source distinguishes presentation facts and authoritative force
  truth, but it may not yet expose every semantic distinction your ideal visual
  language wants.
- Wells and Inhibitor corruption are fabric-first. Ships, wrecks, objectives,
  threats, and other interaction-critical entities use the established crisp-
  over-fabric hybrid language.
- Recent Deck play found crowded late-match fabric chaotic and difficult to
  parse. This review follows, rather than reopens, the v0.3.1 population cap,
  run-reset, entity sizing, sprite, exfil, and timer work.

## Required Visual Concepts

This may not be a text-only memo. Include at least **three concrete visual
concepts** grounded in current LBH scenes and capabilities:

1. **Ordinary traversal:** one player, readable ambient current, a nearby well,
   one objective, and sparse entities. Show how a player identifies a useful
   surf line before entering it.
2. **Competing forces:** overlapping well influence, a wave or wake, a hazard,
   and an objective. Show how ownership and danger remain legible without
   turning the world into colored debug vectors.
3. **Capped late match:** the accepted population ceiling, several entity
   families, Inhibitor pressure, heard contacts, and route information. Show
   what aggregates, fades, or yields first.

Prefer annotated mockups or paintovers of current captures, a short motion
storyboard, and a concise palette/layer key. Concept art must preserve the
actual top-down orthographic game, current entity silhouettes, ASCII fabric,
cyan route language, and magenta corruption language. Do not substitute a
cinematic cockpit, side view, fully illustrated starfield, or generic
wireframe map.

For every concept, label:

- **works with current functionality;**
- **presentation-only extension;**
- **requires a new authoritative/presentation fact;**
- **rejected because it would lie about gameplay.**

If current functionality is too limited or narrow to support an honest visual
concept, say so explicitly. Then show the best honest concept possible and name
the **smallest enabling fact or presentation seam** required. Do not solve the
gap by inventing unimplemented mechanics.

## Questions To Answer

1. What single visual rule makes a surfable current readable at decision
   distance, and how does it differ from dangerous pull, decorative turbulence,
   an entity wake, and a one-shot wave?
2. Which of the current fabric contributors deserve individual marks, and
   which should combine into one field response?
3. How should flow direction, strength, alignment opportunity, and decay read
   without becoming debug arrows, meters, or route spoilers?
4. Which visual elements should be world-persistent, distance-decimated,
   event-pulsed, or camera-local? What wins when their meanings collide?
5. How do objects “owe the fabric something” while still meeting the current
   crisp entity readability rules?
6. What should degrade first under Steam Deck load while preserving the
   gameplay read and 60 fps target?
7. Which current shader/VFX affordances are worth keeping, simplifying,
   retuning, or retiring with extreme prejudice?
8. What is the smallest two-vertical implementation order that lets Greg test
   the new surfing read before a broad art rewrite?

## Deliverable

Write:

`docs/project/reviews/2026-07-28-orrery-v03-fabric-surfing-visual-design.md`

Include:

- one strong recommended direction and one meaningfully different fallback;
- the three required visual concepts with annotations and source image paths;
- a compact visual grammar for ambient flow, surf opportunity, wells, waves,
  wakes, hazards, objectives, corruption, and density conflict;
- a keep/retune/retire table mapped to current source owners;
- the smallest presentation-fact additions, if any, separated from mechanics;
- a two-vertical implementation plan with exact likely files and capture
  criteria;
- explicit Greg taste decisions and anything Orrery could not ground honestly
  in current functionality.

## Guardrails

- Freeze authoritative movement, gravity, map sizes, collision, entity forces,
  Noise radii, 15 Hz fidelity, and current route mechanics.
- Three, VFX, shaders, and UI present truth; they do not create gameplay truth.
- Preserve Art Is Product, Movement Is the Game, Universe Is the Clock, Dread
  Over Difficulty, and the top-down ASCII-fluid identity.
- Do not solve readability by deleting the fabric, hiding meaningful danger,
  zooming out because entity count increased, or adding a large HUD meter.
- Do not produce generic concept art disconnected from the playable renderer.
- Clearly distinguish current capability, modest enabling work, and future
  speculation.
- Human motion and Deck taste decide the direction; automated tests only
  protect lifecycle, meaning, and performance.
