# Orrery Prompt: v0.3.2 Camera And Viewport Visual Concepts

> E3 strategic design prompt for Orrery. Produce a visual design review and
> concept package, not implementation code. This packet should be handed off
> only after the current v0.3.1 Deck baseline is settled.

## Purpose

The current camera is broadly comfortable on a laptop or monitor, but physical
Steam Deck play makes ships, enemies, wrecks, wells, and labels feel smaller
and harder to distinguish. A closer camera could improve moment-to-moment
readability, yet the player also needs enough horizon to read currents, plan a
slingshot, hear and locate threats, and approach an exfil.

Design the v0.3.2 camera and viewport direction as a player-facing composition
problem. Compare a fixed closer Deck baseline, phase-authored framing, and a
restrained context-aware camera. Take a position on whether LBH should have one
universal framing model, a Deck/readability baseline, an accessibility choice,
or a small amount of authored dynamism. The answer must preserve movement feel
and must never zoom out simply because more entities spawned.

## Read First

- `docs/design/PILLARS.md`
- `docs/design/MOVEMENT.md`
- `docs/design/CONTROLS.md`
- `docs/v0.3/reviews/v0.3.2-fabric-surfing-camera-review.md`
- `docs/v0.3/reviews/v0.3.1-design-review.md` — physical scale and view sections
- `docs/project/reviews/2026-07-28-orrery-v03-scale-rc-followup-review.md`
- `docs/v0.3/evidence/visual-review-manifest.md`
- `src/coords.js`
- `src/config.js` — current camera follow and lead-ahead knobs
- `src/main.js` — map setup, camera update, presentation-frame camera facts
- `src/presentation/presentation-frame.js`
- `src/render-three/world-projection.js`
- `src/render-three/world-scene-presentation.js`
- `src/render-three/entity-presentation-scale.js`
- `src/render/viewport.js`
- `src/content/units.data.json`
- `src/content/noise.js`

Use the newest playable v0.3.1 source and its available physical-Deck and
1280x800 captures. Do not infer the experience from desktop screenshots alone.

## Current Functional Ground

- `src/coords.js` currently centralizes a fixed `CAMERA_VIEW = 3.0` and all
  world/screen projection. The Three presentation consumes the camera view, so
  variable framing has an existing projection seam, but it is not yet a
  player-facing dynamic-camera system.
- Camera follow already has bounded lerp and velocity lead-ahead. The fluid
  grid is camera-anchored, and projection changes must keep the ASCII fabric,
  fluid display, Three scene, UI targeting, culling, and screen/world input in
  agreement.
- Entity presentation already has pixel-minimum policies. Camera work must
  decide what remains physical scale and what receives readability
  compensation; it must not silently mutate authoritative radii.
- Current world Noise uses real emitter radius. The camera does not define
  hearing. Edge indicators are reserved for audible contacts and exits.
- Maps are 5×5, 15×15, and 25×25 with 480/600/720-second runs and four
  normalized match phases. Entity count and map size are not permission to
  reduce simulation fidelity.

## Required Visual Concepts

This may not be a text-only memo. Show at least **three grounded camera
concepts** using the same representative LBH scenes:

1. **Closer Deck baseline:** a fixed, more readable view with minimum player,
   enemy, wreck, well, exfil, label, and fabric-feature sizes marked in physical
   Deck terms.
2. **Phase-authored framing:** a closer early-run composition and a modestly
   wider late-run composition keyed only to the four existing match-time
   phases. Show what the player gains and loses at each phase.
3. **Restrained context camera:** limited changes for a few justified existing
   states—high-speed travel, slingshot engagement, exfil approach, or a large
   heard threat—with hysteresis, deadbands, and a clear return to baseline.

Each concept must include:

- an annotated 1280x800 frame or paintover grounded in the current renderer;
- a Deck physical-readability overlay or safe-area diagram;
- one short transition storyboard showing start, midpoint, and settled frame;
- current `3.0` view comparison;
- exact conditions that permit and prohibit the change;
- what is feasible now versus what needs a small presentation extension.

If the current renderer or captured functionality is too limited to support an
honest concept, state that plainly. Show the smallest honest version and name
the minimal enabling seam. Do not fill the gap with a fictional mechanic,
camera system, or cinematic angle.

## Questions To Answer

1. What should the default physical Deck view be, and should desktop use the
   same world view or a platform/readability variant?
2. Does phase-authored framing improve the “universe worsening over time” read,
   or does it weaken movement precision and object recognition?
3. Which existing contexts genuinely earn a temporary camera change? Which
   must never move the camera?
4. What hard min/max view, transition duration, easing, velocity limit,
   hysteresis, and cooldown would prevent pumping or motion sickness?
5. How should velocity lead-ahead behave as view changes, especially during
   slingshot hold/release, wrapped-world travel, terminal transitions, pause
   resume, and exfil confirmation?
6. Which entities may receive presentation-scale compensation at wider views,
   and where would compensation become dishonest or visually crowded?
7. How do audible edge contacts and the cyan exfil indicator behave across
   views without leaking off-screen information?
8. Should the first implementation be one fixed Deck/readability correction,
   or a tiny dynamic vertical? Give a strong recommendation and explain what
   Greg should test first.

## Deliverable

Write:

`docs/project/reviews/2026-07-28-orrery-v03-camera-viewport-visual-design.md`

Include:

- a direct recommendation among fixed closer, phase-authored, restrained
  context-aware, or a specific hybrid;
- the three required visual concepts and transition storyboards with source
  paths;
- a platform/readability policy for Deck versus desktop;
- proposed min/max view and transition behavior as provisional design values,
  not silently accepted tuning;
- a matrix of allowed/prohibited states and expected effect on surfing,
  slingshot, exfil, heard contacts, labels, and entity minima;
- the smallest implementation vertical with exact likely source owners and a
  human playtest script;
- open Greg decisions and any concept that current functionality could not
  support honestly.

## Guardrails

- Do not change map size, physics, authoritative radii, Noise reach, 15 Hz
  fidelity, entity population, or match schedule to make framing easier.
- Entity count never directly drives zoom-out.
- Preserve one coordinate/projection authority through `src/coords.js`; no
  local scale folklore in renderers or UI.
- Do not introduce free camera, tactical-map omniscience, cinematic cuts,
  perspective gameplay, or a Unity-style editor camera.
- Remote/terminal/pause truth must retain presentation precedence; camera motion
  cannot delay or obscure death, extraction, results, or resume reconciliation.
- Favor the smallest reversible player-facing vertical. Human Deck play owns
  readability and comfort; tests protect projection agreement and lifecycle.
