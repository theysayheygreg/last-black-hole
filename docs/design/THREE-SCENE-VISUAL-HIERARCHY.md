# Three Scene Visual Hierarchy

> **Canonical design and implementation contract.** This document governs the
> visual hierarchy of the playable top-down scene. Its laws are durable; the
> implementation appendix is a source snapshot pinned to
> `bd9429eb07f590e10e12ca8398b38264180cf79e` and will age as code changes.

## Purpose and authority

Last Singularity is an ASCII-fluid game, not a conventional space scene with an
ASCII filter. **Art Is Product** means that the fabric is the terrain, its
currents are the navigation surface, and every later layer must protect that
read. When visual goals compete, **Telegraphy > Navigation > Mood**.

This specification answers three questions for every renderer change:

1. What draws behind or in front of what?
2. Which layers may move, darken, or distort the fabric?
3. Where does a new effect belong, and what stability/lifecycle laws constrain
   it?

Related sources have narrower authority:

- [`THREE-ENTITY-VISUALS.md`](THREE-ENTITY-VISUALS.md) owns category language,
  asset families, and the entity separation stack.
- [`../v0.3/FABRIC-VISUAL-CHARTER.md`](../v0.3/FABRIC-VISUAL-CHARTER.md)
  owns the ranking above and the continuous-route, gravitic-body, and
  honesty-core/art-directed-surface rules.
- [`../v0.3/UI-STYLE-GUIDE-v1.md`](../v0.3/UI-STYLE-GUIDE-v1.md) owns canvas
  and DOM UI hierarchy, typography, role color, matte, and Deck readability.
- [`../project/THREE-VFX-PASS-PLAN.md`](../project/THREE-VFX-PASS-PLAN.md) owns
  the staged VFX implementation plan. Aspirational passages there do not prove
  that a layer ships.
- [`../project/THREE-ENTITY-VISUAL-PASS-PLAN.md`](../project/THREE-ENTITY-VISUAL-PASS-PLAN.md)
  owns production sequencing and evidence for entity families.
- `src/render-three/render-plan.js` describes diagnostic seams and budgets. It
  is architecture, not evidence that every named pass has live pixels.

The historical canvas stack in `DEPTH-LAYERS.md` remains reasoning, not current
renderer authority.

## Normative hierarchy laws

- The void frames the image; the fabric owns the world; entities explain
  contacts; immediate VFX explain events; canvas and DOM UI explain player
  state and choices.
- World topology is more important than decorative depth. A visual layer that
  makes a stable current, well, route, or landmark appear to swim has failed
  even if the individual frame is beautiful.
- The canonical product read is the final world plus crisp gameplay/UI layers,
  not an isolated raw-scene or debug view.
- Category reads before affiliation and detail. For entities the order is
  matte -> silhouette -> rim/halo -> trail -> state accent -> optional label.
- Screen-space treatment may modulate presentation. It may not relocate,
  re-phase, duplicate, or invent world terrain.
- World annotations may never occlude a threat. The UI contract places world
  labels below entities; the implementation snapshot records the current
  compositing divergence rather than pretending that ordering already ships.
- Gameplay truth remains in authority/sim state. Three, shaders, canvas VFX,
  and post-process passes only present supplied state and renderer-neutral
  events.
- One renderer/backend frame loop owns updates. Visual families do not add
  independent animation loops, timers, or gameplay decisions.

## Spatial HUD and world annotations (Endless Sky Phase 1D)

> **Status:** design-locked and authorized for v0.3 implementation. The
> migration replaces the older noise rings, brackets, portal timing arcs,
> grapple marks, off-screen marks, labels, and their local geometry owners. It
> does not preserve old APIs or dual renderers. Integration remains subject to
> the active v0.3 worktree hold.

One analytic spatial-HUD/annotation owner supplies both geometry and layout.
It owns a shared primitive library for solid, dashed, and segmented rings and
arcs; tapered pointers; lines; brackets/corners; outlines; progress sectors;
and repeated category marks. Strokes retain a readable pixel weight across
zoom and desktop/Deck viewport classes. Callers submit semantic facts and
canonical projected geometry; they do not author placement or spatial math.

### Category grammar

Category must read without color:

| Category | Required analytic silhouette |
|---|---|
| Noise | Expanding or dashed rings |
| Portal / EXFIL | Five-segment route ring plus concentric collapse and final-aperture timing arcs |
| Grapple | Reachable arc, capture/magnetism allowance, and attached tether |
| Salvage | Three-notch bracket family |
| Vessels | Four-corner bracket family, with hostility/selection as a state accent |
| Inhibitors | Broken or inward-facing containment geometry |

Exact tuning remains a visual-review concern, but these silhouettes are stable
semantic vocabulary. Interaction affordances occupy several ship lengths at
ordinary travel speed; pencil-thin or single-character marks may contribute
texture but cannot carry the whole interaction read.

### Signal and rim law

Off-screen truth follows `SIGNAL-DESIGN.md`. Only heard/audible contacts are
eligible for the rim. Unknown distant Noise is direction plus magnitude on the
audible rim. Close identification upgrades that same mark to its entity-family
grammar; it does not reveal an omniscient second marker. EXFIL and portals emit
Noise and follow the same law. A legitimately discovered mission-critical
portal timing fact may persist, but discovery does not reveal unrelated
contacts or gameplay state.

### Canonical label placement

One placement owner considers the subject silhouette and interaction radius,
other labels, reserved HUD regions, the ship-local Heat/speed stack, screen
bounds, zoom, and viewport class. Fixed landmarks choose a stable anchor when
admitted or generated. Moving contacts choose from a bounded shared candidate
set and retain their anchor through hysteresis; they do not switch sides every
frame. Labels never cover their subjects.

The normal spatial composition is:

`fabric -> world annotation/bracket/label -> entity matte -> entity silhouette -> state accent/VFX -> critical HUD`

This Phase 1D order resolves the snapshot's known label-order residual. Text,
brackets, and annotations remain presentation only; they cannot decide
visibility, identity, contact, portal, grapple, pickup, or extraction truth.

### Lifecycle, coordinate, and migration law

- A single lifecycle owner creates, updates, resets, disposes, and reports
  bounded pooled annotation objects from the renderer/backend frame loop.
  Rebuilds hide/reset pools first. No feature adds a loop or stale annotation
  cache.
- Projection, radius, collision, distance, camera, edge clamp, and coordinate
  math extend and consume the canonical coordinate/geometry owners. No local
  formula is permitted merely because a mark is presentational.
- Migration is replacement. Each vertical switches all consumers to the new
  owner and deletes the superseded helper, constant, test, and import in the
  same coherent change. Compatibility facades, mirrored geometry, dual
  renderers, deprecated aliases, and fallbacks are blocking defects unless a
  concrete external boundary is returned to Greg for approval.
- Gameplay and signal authority remain unchanged. The system presents supplied
  facts and never creates a second contact, event, or interaction authority.

### Player-readable art direction

- Black and blue-black remain the dominant field and negative space. Do not
  fill the void with decorative noise merely to prove depth.
- The fabric carries medium-value blue/violet movement information. Cyan is
  reserved for routes/exfil and the player family; bone-white marks peak energy
  and critical structure; red marks direct danger; amber/gold marks salvage,
  value, or warm route anchors; green marks ecology; magenta/violet marks
  Inhibitor or anomaly corruption. Role colors are not generic decoration.
- Discrete entities remain pixel-resolved at the normal play scale: generated
  sprite cards or simple top-down forms with nearest-filtered/pixel-authored
  surfaces. Modern depth, glow, matte, and VFX may support those assets without
  turning them into smooth vector or glossy low-poly icons.
- Wide views preserve major routes, wells, portals, and landmarks; small debris
  and sparks may fade. Normal play must read without tight/debug zoom. Labels
  are proximity/selection detail, never the first category cue.

## Back-to-front visual stack

The shipped v0.3 graph at the pinned snapshot resolves in this order:

1. **Void and Composer fabric source.** `FluidDisplay` draws the black field,
   world-anchored continuous current corridors, source-bound waves, compact
   well bodies/rims/plumes, and localized Inhibitor corruption.
2. **Composer post chain.** The rich chain is exactly `FluidDisplay -> Gain ->
   Accretion -> Bloom -> Tonemap -> ColorGrade -> Vignette -> ASCII ->
   Chromatic -> Scanlines`. It resolves directly into the shared
   `fluid-canvas` framebuffer. The minimal diagnostic/performance chain is
   `FluidDisplay -> Tonemap -> ASCII`.
3. **Three world target.** A top-down orthographic scene renders into a
   full-resolution, byte-backed RGBA target that is cleared for color and depth
   every frame. Its generic background, fabric, and foreground groups are
   declared but empty in ordinary product play. Render order, rather than group
   name alone, places diagnostic semantic well rings before entity backing;
   pooled backing, landmark, salvage, and active-entity silhouettes follow;
   then the source-backed final-portal semantic ring reads as a post-silhouette
   state accent. Immediate or screen VFX appear only when their explicit gates
   have live events.
4. **Three composite.** A fullscreen quad presents the transparent Three target
   over the Composer frame with normal alpha blending. Its entity gain/gamma
   and very restrained scan/vignette may affect Three pixels; motion warp and
   motion chromatic displacement are zero in every shipped quality profile.
5. **Canvas gameplay and UI overlay.** `overlay-canvas` is drawn after the
   WebGL world. It owns gameplay instruments, labels, local ability cues,
   explicit warning mattes/tints, menu and results surfaces, and related
   canvas text. It is not part of the world post chain.
6. **DOM HUD and browser shell.** The phase-gated DOM HUD sits above the canvas
   overlay. Minimum-window and fatal/bootstrap surfaces sit above the HUD.

This is a composition order, not permission to use every layer in every phase.
Empty, zero-strength, title-only, diagnostic-only, and retired lanes are named
below so future work does not mistake architecture for shipped pixels.

## Layer and pass contract

In the table, **world** means tied to canonical world coordinates; **camera
window** means a view of world data whose sampling window follows the camera;
**screen** means viewport/cell/pixel coordinates. “May suppress” describes an
allowed local contrast role, not a mandate.

| Back -> front | Layer/pass and owner | Space and anchoring | Blend/depth | Motion, time, camera, player inputs | Fabric suppression/distortion allowance | Snapshot status |
|---|---|---|---|---|---|---|
| 0 | Void/clear, `src/render/shaders/fluid.glsl.js`, `src/render/passes/fluid-display-pass.js` | Screen clear carrying a world view | Opaque source color | Camera window and phase tuning | May remain near-black; cannot masquerade as a new world mask | **Live** |
| 1 | Fluid/current/well display, same owners plus fluid/coarse textures | World topology sampled through the camera window; global toroidal anchors | Opaque Composer source | Authority/coarse flow, fluid textures, wells, source waves, Inhibitors, world camera, time | Currents may vary luminance; legitimate well cores may suppress locally and radially; no generic tiled darkness | **Live** |
| 2 | Gain, `src/render/passes/gain-pass.js` | Screen | Opaque scalar pass | Phase tuning | May attenuate the complete source only in an authored phase | **Live; 1.0 gameplay, title attenuation** |
| 3 | Accretion, `src/render/passes/accretion-pass.js` | World anchors projected into the camera window | HDR additive color over source | Well positions/radii, camera, phase strength | May brighten authored title wells; may not add a second gameplay well | **Live in graph; zero gameplay, title-only pixels** |
| 4 | Bloom, `src/render/passes/bloom-pass.js` | Screen, source-derived | Bright-pass plus additive composite | Source luminance and phase tuning | May spread existing highlights; may not erase route edges or merge categories | **Live** |
| 5 | Tonemap, `src/render/passes/tonemap-pass.js` | Screen | Opaque HDR-to-LDR transform | Source color/exposure | Global value compression only; preserve relative telegraphy | **Live; core pass** |
| 6 | Color grade, `src/render/passes/color-grade-pass.js` | Screen | Opaque split-tone transform | Source luminance | Role-bound global color modulation; cannot recolor gameplay categories ambiguously | **Live** |
| 7 | Composer vignette, `src/render/passes/vignette-pass.js` | Screen/camera-fixed | Multiplicative edge darkening | Viewport and phase tuning | May frame edges gently; cannot conceal threats, route exits, or peripheral current continuity | **Live** |
| 8 | ASCII, `src/render/passes/ascii-pass.js`, `src/render/shaders/ascii.glsl.js` | Screen-cell raster sampling a world-anchored phase | Opaque quantization | Source color, velocity, camera/world window, time/shimmer, Inhibitor data | May quantize value into glyphs; shimmer cannot slide texture relative to world | **Live; core product identity** |
| 9 | Composer chromatic, `src/render/passes/chromatic-aberration-pass.js` | Screen/camera-fixed | RGB sample offset | Phase tuning | May fringe the resolved glyph image only when explicitly enabled; never imply world displacement | **Live in graph; zero gameplay, title-only** |
| 10 | Composer scanlines, `src/render/passes/scanlines-pass.js` | Screen/camera-fixed | Multiplicative display texture | Viewport and phase tuning | May modulate final Composer luminance subtly; glyphs and route edges must remain readable | **Live** |
| 11 | Generic Three `background-parallax-field`, `WorldScenePresentation.backgroundGroup` | Declared camera/world scene group | Transparent scene layer | None while empty | None | **Declared, empty** |
| 12 | Generic Three `fabric-source-layer`, `WorldScenePresentation.fabricGroup` | Declared world scene group | Transparent scene layer | None while empty | None; Composer remains fabric owner | **Declared, empty** |
| 13 | Diagnostic semantic well ring, `WorldScenePresentation.semanticGroup` | World through `createWorldProjection()` | Additive, depth off; z `0.01`, render order `15`, before entity backing | Diagnostic-view gate, well snapshot, camera | Diagnostic only; never establishes product truth or ships in ordinary play | **Diagnostic-only** |
| 14 | Entity backing, `entityBackingGroup`, `visual-style.js` | World position, screen-stable family footprint | Normal-alpha dark matte; depth test/write off | Visible/cullable entity snapshot, camera, family treatment | May soften fabric only beneath a visible entity, within its local bounded footprint | **Live** |
| 15 | Landmark entities, `landmarkEntityGroup` and visual families | World | Normal/additive by material; depth off; explicit render order | Stars, portals, planetoids, route anchors, camera | No independent terrain suppression beyond owned contact matte | **Live** |
| 16 | Salvage entities, `salvageEntityGroup`, `WreckVisualFamily` | World | Normal/additive by material; depth off | Wreck/cargo state, camera | Same local-matte rule; amber is value/salvage, not generic focus | **Live** |
| 17 | Active entities, `activeEntityGroup`, player/world sprite families | World | Normal/additive by material; depth off | Player/remote/threat/ecology/Inhibitor snapshots, camera | Same local-matte rule; transparent/absent/cull states must not leave a matte | **Live** |
| 17a | Final-portal state ring, `WorldScenePresentation.semanticGroup`, `PortalVisualFamily` | World anchor through `createWorldProjection()` with screen-stable radius | Additive, depth off; z `0.145`, runtime render order `28`, after entity silhouettes at `27` | Authoritative portal `visualState === 'final'`, camera | One local state accent around a submitted final-portal silhouette; no general terrain suppression | **Live, final portal only** |
| 18 | Immediate VFX, `immediateVfxGroup`, `VfxManager` | World group for event accents | Additive, depth off, bounded render order | Renderer-neutral events, `dt`, time, quality budget | Short-lived accent only; never persistent terrain or gameplay truth | **Declared, empty at this snapshot** |
| 19 | Generic Three `foreground-screen-space-layer` | Declared camera-fixed group | Transparent scene layer | None while empty | None | **Declared, empty; motion lens retired** |
| 20 | Three `screen-vfx-layer`, `VfxManager` | Screen coordinates converted to scene coordinates | Additive, depth off | Explicit renderer-neutral screen events, `dt`, time, quality | May briefly accent an owned screen event; must stay below clean UI and never become ambient terrain | **Live for gated title glyph faults; otherwise empty** |
| 21 | Three RGBA target and copy, `src/render-three/three-renderer.js` | Screen composite of the orthographic scene | Fresh clear; normal-alpha copy; copy depth off | Quality profile; Three target only | Entity-only gain/gamma and restrained scan/vignette allowed; no fabric sampling or camera-motion displacement | **Live** |
| 22 | Three copy motion/chromatic uniforms, same owner | Screen/camera-fixed | Sample displacement | Motion vector is intentionally zero | No terrain or entity displacement is allowed from ordinary camera/player motion | **Live seam; zero in all shipped profiles** |
| 23 | Canvas gameplay/world annotations, `src/main.js` and owned UI/presentation helpers | Mixed explicit world-to-screen and screen pixels | Canvas source-over unless locally declared | Player state, camera, time, authority projections, phase | Explicit local labels/mattes and authored event tints only; no unlabeled repeated terrain masks | **Live** |
| 24 | Canvas menus/results/interrupt surfaces, `src/main.js` and `src/ui/*` | Screen | Explicit panel/matte recipes | Phase, input, UI state, reduced motion | May intentionally dim the world under a named modal surface | **Live, phase-gated** |
| 25 | DOM HUD, `index-a.html`, `src/hud.js`, UI tokens | Screen/browser | CSS surfaces above canvas | Player/sim projection, phase, reduced motion | Explicit bounded HUD panels only; center playfield remains world-owned | **Live, phase-gated** |
| 26 | Browser shell/minimum-window/fatal surfaces, `index-a.html`, bootstrap code | Screen/browser | Opaque or high-z emergency surface | Window/bootstrap state | May cover the game only to explain a real non-playable state | **Live, exceptional** |

### Declared architecture is not shipped imagery

`render-plan.js` still names `voidDepth`, `entityEchoes`, `vfxEvents`, and other
diagnostic seams, and the scene graph retains groups with historical names such
as `background-parallax-field`. Those names are useful extension points. At the
pinned snapshot they do **not** prove a starfield, haze, generic parallax field,
near-camera atmosphere, or separate Three fabric layer is visible.

## Coordinate and camera-stability law

The terrain/current/well field is world-anchored. With authority time and
entities frozen, camera translation changes framing only: a reprojected world
patch retains its current intersections, well influence, large texture
features, and relative entity registration.

- Well, world, fluid-UV, screen, wrapping, radius, and velocity conversions go
  through `src/coords.js`, the shader-side canonical adapters in
  `src/render/shaders/fluid.glsl.js`, or the declared Three projection owner in
  `src/render-three/world-projection.js`. Call sites do not invent a local
  `1.0 - y`, toroidal delta, radius scale, camera offset, or projection formula.
- A camera-following fluid texture is a window onto one global world. It is not
  a second small torus and must not be sampled as one.
- Screen-cell ASCII quantization is permitted; its world-derived phase must
  remain locked to the same world patch as the fabric beneath it.
- World marks may evolve from authority/time. Camera or player translation
  alone may not change their phase, centers, density, or topology.
- Generic camera-reactive overlays over the fabric are forbidden. A future
  source-driven lens or atmosphere effect must name its world source and pass a
  frozen-world camera-motion comparison before becoming product imagery.
- Wells, entities, mattes, trails, and labels consume the shared projection
  owners. A new effect that needs new spatial math extends the canonical owner
  first and then calls it.

## Occlusion and contrast law

The fabric is sovereign. Local contrast is allowed because a readable contact
is part of navigation; broad anonymous suppression is not.

### Allowed suppression

- A gameplay well may own a compact, world-anchored radial dark core and
  bounded shoulder so its lethal body remains legible. Its silhouette must stay
  registered to the authoritative well.
- A visible entity may own one local contact matte shaped and scaled for its
  family. It must sit below the silhouette, remain within the readable entity
  footprint, and disappear whenever that entity is absent, transparent,
  off-screen, expired, reset, or returned to a pool.
- An explicit modal, HUD panel, label backplate, warning matte, or named
  full-screen event may darken its documented screen region. The UI owner and
  player meaning must be obvious.
- Bloom, vignette, grade, scanlines, and ASCII may modulate the already resolved
  image within their readability constraints.

### Aggregate budget

Mattes are a shared frame budget, not an entitlement per object. The renderer
must report matte count and estimated coverage. Review the aggregate and the
local peak at representative density. If contact pockets join into a second
terrain mask, lower low-priority opacity/radius, cull stale/low-priority
contacts, or simplify the family before weakening the fabric. No numeric ceiling
is canonized here until representative desktop and Deck scenes justify one.

### Forbidden suppression

- coarse grid-aligned or threshold-crossing dark tiles;
- stale pooled mattes, empty/off-screen entity slots, or repeated anonymous
  terrain masks;
- transparent render-target history, uncleared alpha/depth, or accumulation
  from previous frames;
- hard rectangular backplates presented as world atmosphere;
- an unlabeled contrast pocket that follows the camera rather than its visible
  world source;
- decorative darkness that interrupts a continuous current or creates a
  phantom well/center.

Every transparent world target is cleared before submission. Rebuild-style
entity, semantic, and line pools begin each frame hidden, then submit only the
current visible entries. `VfxManager` is deliberately different: live particles
persist and age across frames; expired or explicitly reset entries are hidden
and returned to its pool.

## Post-processing law

The rich Composer order is normative because each stage consumes the previous
stage's color domain:

1. **FluidDisplay** establishes HDR world material and topology.
2. **Gain** supplies phase-specific source attenuation.
3. **Accretion** adds the authored title-only HDR well temperature treatment.
4. **Bloom** spreads source highlights while they are still HDR.
5. **Tonemap** compresses HDR into displayable LDR.
6. **ColorGrade** applies the role-bound LDR split tone.
7. **Vignette** frames the world before glyph selection.
8. **ASCII** quantizes the image into the core screen-cell language.
9. **Chromatic** may fringe the resolved glyph buffer in explicitly enabled
   phases; gameplay strength is zero at the snapshot.
10. **Scanlines** apply the final Composer display modulation.

The Three target is composited after this chain and before canvas/DOM UI. Its
copy pass is not a second world-post pipeline: it grades only the transparent
Three pixels. Canvas gameplay/UI and DOM HUD remain crisp above world post.

World post may improve contrast and mood, but may not alter world topology.
Screen-cell ASCII rasterization is distinct from world-anchored shimmer phase.
Vignette, chromatic separation, scanlines, grade, bloom, or future exposure
adaptation may not make currents appear to move, split, vanish, or relocate as
the camera travels. Heavy depth of field is inappropriate for the ordinary
play surface because route continuity and small entity categories outrank lens
spectacle.

## Entity and VFX hierarchy

An entity earns separation through a compact layered read:

1. **Matte:** local, family-shaped, bounded fabric softening.
2. **Silhouette:** pixel-resolved category truth.
3. **Rim/halo:** affiliation, focus, or urgent state.
4. **Trail:** directional/speed evidence, not a permanent smear.
5. **State accent:** a short family-specific event or condition cue.
6. **Label:** name or detail only when proximity/selection requires it.

The stable Three subgroup order is:

`entity-backing-layer -> landmark-entity-layer -> salvage-entity-layer -> active-entity-layer -> immediate-vfx-layer`.

All materials currently avoid depth writes/tests and use explicit normal or
additive blending/render order. If real 3D depth is introduced later, it must
preserve the player-readable order rather than letting incidental geometry
sorting decide it.

Each visual family has one owner and the boring lifecycle
`create -> update(frameState) -> reset -> dispose -> getStats` (or an equivalent
factory surface):

- `create` allocates stable geometry, materials, assets, and bounded pools;
- `update` consumes plain snapshot/presentation data and renderer-neutral
  events from the sole backend frame loop;
- `reset` clears phase/run/event ids and returns every pooled object to a hidden,
  inert state;
- `dispose` releases owned GPU resources and listeners;
- `getStats` exposes bounded counts/coverage when diagnostics need them.

Inactive means no visible mesh **and** no hidden state growth. Rebuild-style
pools hide entries before each rebuild. VFX particles may remain live across
frames only while their bounded lifetime advances; expiration or reset hides
and returns them to the pool. Reused objects cannot leak stale alpha, material,
parent, render order, user data, event ids, or occlusion into a new role. VFX
events contain no Three object references. Visual code does not decide
collision, pickup, death, movement, extraction, inventory, Noise, Heat, or any
other gameplay result.

## Remaining screen-space and time-reactive effects

These shipped effects deserve continued human judgment because they can change
the frame even when world geometry does not:

- the fluid display's subtle screen-edge vignette;
- Composer bloom, grade, vignette, ASCII cell raster, title-only chromatic
  fringe, and scanlines;
- world-anchored but time-reactive fabric strokes, source-bound wave swells,
  Inhibitor corruption, and ASCII shimmer phase;
- Three entity-only copy gain/gamma plus a restrained copy-pass scanline and
  vignette;
- gated title glyph-fault particles in the Three screen VFX group;
- canvas well-proximity edge vignette, short star-consumption tint, ability and
  warning accents, explicit UI mattes, and phase-owned canvas scanline recipes;
- DOM/CSS panel mattes, scanline recipes, and browser emergency overlays.

There is no live generic Three parallax backdrop, near-camera atmosphere, or
camera-motion warp at the snapshot. A remaining setting name such as
`parallaxStrength` or scene-group name is not evidence of pixels.

Greg's review question for each screen-space effect is simple: does it help the
player read the world or the instrument, or does it make the terrain feel less
stable? The latter does not belong.

## Retired and forbidden approaches

- **`motion-lens-depth-cue` is retired.** The passive camera-reactive ring in
  the foreground group made terrain appear to re-phase as the view moved. Do
  not restore it under another name without a source-driven design decision and
  frozen-world evidence.
- **`calmMottle` 12x12 coarse tiles are retired.** Calm space may be alive, but
  not through grid-aligned threshold-crossing darkness that shadows ASCII
  current glyphs.
- Do not describe empty background/fabric/foreground groups as shipped
  starfield, haze, parallax, lens, or atmosphere.
- Do not add generic camera-reactive fabric/world overlays or one-off projection
  and wrapping math.
- Do not use uncleared transparent targets, temporal alpha history, or stale
  pooled occlusion.
- Do not add full-field noise carpets, decorative repeated masks, source-free
  lens flecks, or heavy depth of field that compromises routes.
- Do not move gameplay truth into Three components, VFX events, post passes,
  canvas art, or HUD state.

## Allowed future seams

The following are **future**, not shipped. Each requires its own product need,
owner, gate, and evidence:

- a sparse parallax or near-camera atmosphere group, independently gated and
  proven not to change world topology;
- source-driven lens effects keyed to a visible world light/hazard rather than
  generic camera/player motion;
- a unified final world post after Composer and Three, while keeping canvas/DOM
  UI crisp and preserving the canonical hierarchy;
- continuous route ribbons or richer well/fabric treatments derived from
  authority/coarse flow through canonical projection owners;
- independently gated Inhibitor fabric substitutions and screen faults;
- instanced entity/VFX pools if measured draw-call pressure warrants them.

A future seam does not become a live layer because a group, descriptor, quality
knob, or plan paragraph exists. It ships only after implementation truth and
human-readable evidence agree. Every future effect must pass the same laws:
world stability, route continuity, bounded suppression, role clarity, lifecycle
ownership, one frame loop, and 60 fps target.

## Human review checklist

Review representative ordinary play at laptop scale and at the physical
1280x800 Steam Deck scale. Debug views can diagnose a failure but cannot accept
the product surface.

- **Camera travel:** freeze world time where possible and translate the view.
  Do current intersections, large texture features, wells, mattes, and entities
  stay registered to the same world points?
- **Current continuity:** can the eye follow a route across the frame without
  dark tiles, overlays, bloom, labels, or post breaking it?
- **Well alignment:** does every compact dark core/rim/plume stay attached to
  its actual well with no phantom duplicate?
- **Category read:** with labels off, can the player distinguish ship, threat,
  salvage, route anchor, ecology, and anomaly?
- **Matte coverage:** are contact mattes local and family-shaped? Do dense
  contacts preserve more fabric than they suppress? Do absent/transparent
  entities leave no dark footprint?
- **Event read:** do trails and VFX explain a real source, direction, or state,
  then expire cleanly?
- **HUD clarity:** are canvas instruments and DOM HUD crisp, collision-safe,
  and visually above the world without taking the center playfield?
- **Screen effects:** inspect vignette, bloom, scanlines, chromatic/title faults,
  warning tints, and UI mattes one by one. Does any make stable terrain appear
  to move or hide an input-critical cue?
- **Deck conditions:** inspect at native scale, labels off, small/desaturated,
  and in bright ambient light. Desktop downscaling alone is not acceptance.

## Implementation snapshot: `bd9429eb`

This appendix records exact committed implementation truth at
`bd9429eb07f590e10e12ca8398b38264180cf79e`. The SHA is a snapshot; the laws
above survive later module names and graph changes.

| Concern | Current owner/truth |
|---|---|
| Frame orchestration | `src/main.js` creates one Composer and one selected backend; `ThreeRendererBackend.render()` runs Composer, updates the Three presentation, clears/renders the Three target, and composites it. |
| Composer graph | `src/main.js`, `src/render/composer.js`, and `src/render/passes/*`; rich order is the ten-pass order specified above; minimal is the three-pass baseline. |
| Fabric source | `src/render/passes/fluid-display-pass.js`, `src/render/shaders/fluid.glsl.js`, fluid/coarse textures, and frame inputs from `src/main.js`. |
| ASCII identity | `src/render/passes/ascii-pass.js` and `src/render/shaders/ascii.glsl.js`; screen cells sample a camera/world-aware, world-stable phase. |
| Three target/composite | `src/render-three/three-renderer.js`; full-resolution RGBA8 target, color/depth clear every frame, normal-alpha copy over the shared Composer framebuffer. |
| Three scene graph | `src/render-three/world-scene-presentation.js`; top-down orthographic camera, declared generic groups, diagnostic semantic well rings before entity backing, a live final-portal semantic ring after silhouettes, pooled dynamic content, and explicit lifecycle. |
| Generic Three groups | `background-parallax-field`, `fabric-source-layer`, and `foreground-screen-space-layer` exist but carry no ordinary product content. |
| Entity layer order/material roles | `src/render-three/visual-style.js` and entity visual families; backing -> landmark -> salvage -> active -> immediate VFX, depth off, explicit normal/additive roles. |
| Entity assets/pools | `src/render-three/entity-assets.js`, `src/render-three/entities/*`, `WorldScenePresentation`; generated pixel sprites, stable resources, per-frame hidden pool rebuild, reset/dispose/stats. |
| Known matte residual | `_addSpriteEntity()` currently calls `_addContrastBacking()` before applying the submitted entity opacity. At this snapshot, a submitted zero-opacity entity can therefore retain a contact matte. This is an implementation discrepancy against the visible-only matte law above, not accepted visual behavior. |
| VFX | `src/render-three/vfx/vfx-manager.js`, `vfx-events.js`, `vfx-quality.js`; bounded event consumption and pools. The current concrete screen family is title glyph fault; plans describe more future families. |
| World projection | `src/coords.js`, shader-side coordinate helpers in `fluid.glsl.js`, and `src/render-three/world-projection.js`. |
| Canvas overlay | `overlay-canvas` in `index-a.html`, drawn by `src/main.js` and owned helpers after WebGL; it holds gameplay instruments, labels, local cues, and phase surfaces. |
| Known label-order residual | Because the complete `overlay-canvas` is physically drawn after the Three composite, its current world labels appear above Three entities. That conflicts with UI Style Guide section 5.1's “world labels draw under entities” law. A future ownership/compositing correction is required; this snapshot does not claim the intended order ships or choose its implementation. |
| DOM/browser shell | `index-a.html`, `src/hud.js`, UI layout/primitives/tokens, and bootstrap/minimum-window owners; HUD z-order is above both canvases. |
| Retired camera lens | Commit ancestor `fa0ae4fd`; `_buildForegroundLayers()` retains only the explicit retirement note and adds no mesh. |
| Retired calm mottle | Commit ancestor `a22b6585`; the shader no longer contains the 12x12 `calmMottle` contribution. |
| Remaining inert seams | Three copy `motionWarp` and `chromaticMotion` are zero in all quality profiles. `parallaxStrength`/`backdropReveal` settings and generic group names remain declared without corresponding ordinary product geometry. |

When implementation changes, update this appendix and the affected table rows in
the same committed change. Do not weaken the normative stability, occlusion,
coordinate, lifecycle, or readability laws merely to describe a new effect.
