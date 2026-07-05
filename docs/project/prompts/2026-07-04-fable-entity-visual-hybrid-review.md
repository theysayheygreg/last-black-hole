# Fable/Orrery Prompt: Entity Visual Hybrid Review

> Weekend delegation prompt for Fable through Orrery. Please produce a review
> and visual direction memo, not code, unless Greg explicitly asks for
> implementation.

## Purpose

The Three renderer is now first-class, but most non-fluid entities are still
primitive bridge markers. Last Singularity needs a clear visual answer for how
ships, rivals, wrecks, stars, portals, fauna, and route objects sit above the
ASCII fabric while preserving the game's identity.

Use this pass to help decide whether entities should render through the ASCII
product surface, sit crisply above it as a codified hybrid, or use a mixed rule
by category. This is an explicit v0.3 open decision.

## Read First

- `docs/v0.3/OPEN-DECISIONS.md`
- `docs/design/THREE-ENTITY-VISUALS.md`
- `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`
- `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`
- `docs/project/THREE-VFX-PASS-PLAN.md`
- `docs/design/UI-VISUAL-SYSTEM.md`
- `docs/reference/THREE-ENTITY-MOODBOARD.md`
- `docs/reference/UI-MOODBOARD.md`
- `docs/project/ROADMAP.md`

Optional if useful:

- `src/three-renderer.js`
- `src/three/entity-visuals.js`
- `src/three/vfx-manager.js`
- `src/renderer-fixtures.js`
- `tests/renderer.cjs`
- `tests/ui-visual.cjs`
- `tests/visual-reference.cjs`

## Current Context

- Wells and Inhibitors stay fabric-first. They are the ASCII ocean and the
  corruption of that ocean.
- Ships, rivals, stars, planetoids/comets, wrecks, portals, fauna, and sentries
  need stronger silhouettes, mattes, halos, state accents, and readable motion.
- Greg has set a style rule: entities should use 2D pixel assets, or simple 3D
  assets with pixelated textures viewed from the top-down camera.
- Visual contrast matters more than dark subtlety. The void should stay black,
  but interactable objects must punch off it.
- Portal palette discipline is open: the current recommendation is route/cyan
  portals, with magenta reserved for Inhibitor/corruption.

## Questions To Answer

1. Should LBH codify a hybrid stack where crisp/pixel/low-poly entities sit
   above the fabric, or should more entity categories pass through the ASCII
   treatment? Where should the line be?
2. What silhouette language should distinguish player, rival, neutral ecology,
   loot/wreck, route anchor, and anomaly before color is considered?
3. What is the minimum entity backing stack: contact matte, rim, halo, local
   blur, glow, depth shadow, or something else?
4. Which objects should partially occlude or suppress the fabric behind them,
   and how do we cap that so the ASCII field remains the product?
5. What should the visual reference scene prove for readability, accessibility,
   and couch/Steam Deck scale?
6. Where should VFX do the work instead of mesh detail: thrust, braking, portal
   aperture, wreck pickup, rival danger, inhibitor corruption?
7. What should change in palette rules, especially for portals, salvage, rival
   threat, route tech, and neutral ecology?

## Deliverable

Write a review memo under `docs/project/reviews/` with:

- A clear recommendation for the ASCII-through-fabric versus hybrid-over-fabric
  decision, including any category-specific exceptions.
- A visual hierarchy table for entity categories: silhouette, color family,
  matte/backing, motion, VFX, and state accent.
- A first implementation slice that would improve the playable build fastest.
- A visual-reference harness plan with pass/fail checks for contrast and Deck
  readability.
- Performance risks and batching/instancing guidance.
- Open decisions Greg should make before asset production begins.

## Guardrails

- Do not replace the ASCII fluid identity with generic space-game meshes.
- Do not put gameplay truth in renderer objects. The sim owns pickup, death,
  extraction, signal, collision, and movement.
- Do not rely on tiny labels to identify gameplay-critical objects.
- Do not use magenta casually if it weakens the Inhibitor/corruption read.
