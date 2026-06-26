# Three Scene Visual Hierarchy

> **v0.2 status:** Current master target for the top-down Three scene.
> This supersedes the canvas-era layer stack in `DEPTH-LAYERS.md` for new
> renderer work. The older doc remains useful as historical reasoning.

## North Star

Last Singularity should feel like a flat tactical camera pointed down into a
deep, hostile volume. The view can stay top-down, but the scene should not feel
flat. Space is black. The void is scary. Every visual layer earns its place by
making that blackness feel deeper, making the ASCII fabric more legible, or
making gameplay entities easier to read against the fabric.

Color can widen beyond the original red/cyan terminal pair, but value hierarchy
comes first:

- the void owns most of the frame and should remain near-black;
- the ASCII fabric carries medium-value motion and field information;
- interactable entities get brighter silhouettes, contact shadows, halos, and
  local backplates when needed;
- rare hazard accents can be saturated, but only in small regions;
- HUD and text stay cleaner than the world so they do not compete with motion.

Contrast is a hard usability requirement. Black is allowed to dominate the
composition, but player-critical colors should be punched up enough to read
without squinting. When brightness alone would create bloom mush, use a darker
contact matte, outline shell, halo, or small affordance background to create a
controlled contrast pocket.

## Layer Stack

This doc uses `stackZ` from back to front. The renderer can map these to actual
Three `z` values centered around zero, but the ordering should stay stable.

| stackZ | Layer | Contents | Parallax | Camera/Zoom Behavior | Render Notes |
|--------|-------|----------|----------|----------------------|--------------|
| 0 | Black void | Clear color, edge darkening, deep absence | 0.00 | Never scales as an object | The frame should still read as black when all effects are active. |
| 1 | Far starfield | Sparse pin stars, dead systems, barely visible dust | 0.02-0.06 | More visible at wide zoom, thins near tight zoom | Low brightness, no gameplay color, no dense constellation noise. |
| 2 | Deep structure haze | Ancient grids, orbital scars, very large nebula shadows | 0.08-0.16 | Slow drift only | Use as atmosphere, not route information. Keep below fabric contrast. |
| 3 | Background parallax field | Existing `background-parallax-field`, far debris hints | 0.18-0.35 | Moves less than the gameplay plane | Can hold tiny non-interactable silhouettes and far lens flecks. |
| 4 | Fabric shadow/lensing | Under-well darkness, large local warp shadows | 0.80-1.00 | Tied to world, not screen | Prepares contrast before the ASCII plane without hiding the sim. |
| 5 | ASCII fluid fabric | Composer fluid, ASCII glyphs, current direction, wells, Inhibitor corruption | 1.00 | The gameplay ocean. It owns world truth and should not parallax away from sim coordinates. | Wells and Inhibitors are fabric-first systems. |
| 6 | Fabric emboss and hazard wash | Accretion glows, pressure shimmer, well near-side hints, anomaly washes | 1.00 | Scales with world | Prefer shader or shared render-target effects. Avoid entity-only truth here. |
| 7 | Semantic flow layer | Slingshot lanes, wave rings, current affordances, route hints | 1.00 | Can fade with zoom to avoid clutter | Non-text, low-opacity, diegetic navigation. This is information, not decoration. |
| 8 | Landmark entity layer | Stars, planetoids, comets, portals, wreck fields, megastructures | 0.96-1.00 | Stable gameplay positions with slight depth offsets | Use contact matte, rim shell, and material families for separation. |
| 9 | Active entity layer | Player, remote pilots, rivals, scavengers, fauna, sentries | 1.00 | Player remains the most stable read; threats can bob/roll | These objects must be readable at Steam Deck scale with labels off. |
| 10 | Immediate VFX layer | Thrust ports, brake sparks, pickup glints, release bursts, portal sparks | 1.00-1.04 | Can exaggerate motion during events | Short-lived and pooled. Effects explain action, not just prettiness. |
| 11 | Near-camera atmosphere | Screen-adjacent dust, speed flecks, lens motes, small foreground occluders | 1.06-1.18 | Stronger at high speed and near hazards | Sparse. This sells depth but must never cover input-critical entities. |
| 12 | Lens and frame effects | Lens flares, chromatic slip, vignette, CRT bloom prepass | Screen-space | Camera-fixed | Driven by world light sources but resolved in screen space. |
| 13 | HUD and menus | DOM HUD, status panels, title/results, controller hints | Screen-space | No parallax | HUD can use CSS scanlines, but gameplay CRT should be resolved before HUD. |

## Post-Processing Order

The end-state renderer should resolve the world as one composed image, then run
global post, then draw HUD:

1. render background, fabric, semantic, entity, and near-camera world layers;
2. resolve entity separation and bloom prepass;
3. run full-frame color grade, vignette, chromatic aberration, and CRT/scanline;
4. draw DOM/HUD with a lighter matching treatment.

Depth of field should be rare or absent. The Octopath-style vibe is useful
because it places old-school assets inside modern lens/post staging, but LBH is
mostly black void and high-contrast glyph fields. Heavy DOF on empty space will
usually read as blur rather than depth. Prefer parallax, source-driven glow,
lens flecks, contrast pockets, restrained bloom, and CRT treatment.

The current bridge is split: Composer owns the ASCII/fabric post stack, while
`ThreeRendererBackend` renders a transparent world target and applies its own
copy pass over the canvas. That is acceptable for v0.2 implementation work as
long as parameters stay visually aligned. The final Three-owned graph should
move toward one global post stack after the fabric and world are combined.

## Entity Separation Contract

Entities do not become readable by getting larger. They become readable by
owning a small local contrast system:

- **contact matte:** a dark transparent ellipse or hull-shaped shadow between
  fabric and object, rendered before the object;
- **core silhouette:** the gameplay shape, rendered as a pixel sprite/card or a
  top-down pixel-textured mesh;
- **rim shell:** a thin additive outline or faceted glow outside the silhouette;
- **halo/backplate:** a brighter or darker affordance pocket for critical
  states, especially player, portals, pickup-ready wrecks, and danger objects;
- **velocity trail:** direction and speed cue, never a permanent smear;
- **state spark:** small family-specific accent for salvage, danger, portal,
  ecology, or anomaly state.

The contact matte is the critical missing piece in the current screenshots. It
lets the ASCII ocean stay busy while objects remain separate from it.

## Contrast Budgets

| Family | Minimum Contrast Device | Notes |
|--------|-------------------------|-------|
| Player | contact matte + bright hull + rim shell + thrust/brake accents | The player should remain readable in the busiest well field. |
| Portal | aperture halo + dark inner well + state ticks | Extraction must read at a glance before labels. |
| Pickup-ready wreck | debris matte + amber glint | Loot value should punch through black and cyan fabric. |
| Looted wreck | debris silhouette + muted rim | Still present, but no reward sparkle. |
| Rival/threat | warning-colored shell + trail | Threat movement should be clear in peripheral vision. |
| Ecology | family silhouette + green/cyan pulse | Avoid hiding ambient entities as black specks. |
| Star/comet | bright core or tail + local glow | Route anchors can be colorful, but not UI-loud. |
| Inhibitor | fabric corruption + magenta/violet halo/backplate | Rare enough that it feels invasive every time. |

## Entity Asset Rule

Discrete entities should stay pixel-resolved even as the scene gains depth. Use
2D pixel sprites/cards or simple 3D meshes whose visible top-down textures are
pixel-authored or pixelated with nearest-neighbor sampling. Directional
lighting, shadows, parallax, bloom, trails, and screen-space effects are welcome
around those assets, but the ship/enemy/wreck surface should not become smooth
low-poly or glossy vector art.

## Palette Hierarchy

Use a wider palette, but keep it role-bound.

| Family | Primary Use | Notes |
|--------|-------------|-------|
| Black / blue-black | Void, frame edge, negative space | This is the dominant color family. Do not fill it with decorative noise. |
| Cyan / blue-white | Flow, player, portals, readable route tech | The old terminal identity lives here. |
| Bone white | Wells, high-energy fabric, player silhouette peaks | Use sparingly so wells remain dangerous and sacred. |
| Warning red | enemy pilots, collapse, direct danger | Keep red legible but not everywhere. |
| Salvage gold / amber | wreck value, stars, pickup moments | A warmer counterpoint to cyan; good for reward and route anchors. |
| Green | ecology, sentries, living systems | Avoid making green another generic UI color. |
| Magenta / violet | Inhibitor, anomaly, exotic corruption | Keep rare so it always feels invasive. |

## Zoom Rules

- Wide zoom should favor route readability: wells, stars, portals, major wreck
  fields, and semantic lanes survive; tiny debris and sparkles fade.
- Normal gameplay zoom should show all interactables with contact mattes and
  concise trails.
- Tight/debug zoom can reveal hull details, debris fragments, and parallax
  separation, but the normal game should not require it.
- Labels should fade in only when the player is near or targeting something.
  Shape language must work before text.

## Implementation Notes

- Keep all coordinate projection through `src/coords.js`; depth and parallax do
  not excuse local coordinate flips.
- Prefer separate Three groups for semantic, landmark, active, immediate VFX,
  and near-camera layers. Use `renderOrder` and material depth flags to preserve
  the top-down compositing contract.
- Pool repeated meshes, trails, particles, and glints. The visual hierarchy is
  not permission to allocate per entity per frame.
- Treat the current canvas/DOM world labels as text surfaces only. New world
  shape, glow, trail, and aura work should start in the Three scene.
