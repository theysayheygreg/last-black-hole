# Three Entity Visual Language

> **v0.2 status:** Current design target for the next renderer ownership pass.
> This doc covers world objects that are not primarily expressed by the ASCII
> fluid fabric. Wells and Inhibitors remain fabric-first systems; ships, stars,
> comets, planetoids, wrecks, portals, rivals, fauna, sentries, and future
> megastructures should become first-class Three scene objects.
>
> See also `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md` for the master
> back-to-front layer stack and `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md`
> for implementation order.

## Why This Exists

The Three renderer is now the default presentation path, but the entity layer is
still mostly a bridge: discs, rings, squares, and triangles projected over the
Composer/ASCII frame. That was the right parity step. It is not the final visual
language.

The next visual pass should make non-fluid objects feel like they belong in a
flat-view 3D scene without turning Last Singularity into generic 3D space. The
game should still read as tiny craft and salvage moving through a vast ASCII
ocean, but the objects riding on top of that ocean need richer silhouette,
motion, depth, and material identity.

The palette can widen, but black space remains the organizing lens. The void
should be dark and scary, while interactable objects and UI affordances must be
bright enough to read without squinting. The target is **dark scene, punchy
affordances**, not dark everything.

## Current Implementation Snapshot

| Surface | What exists now | What is missing |
|---------|-----------------|-----------------|
| Three substrate | Orthographic top-down camera, z-layered scene groups, shared WebGL2 context, pooled primitive meshes, motion parallax, screen-space present pass | A reusable style kit for semantic entities, richer geometries, entity-specific materials, fixture coverage for visual identity |
| Wells | Fabric/ASCII-driven voids, accretion, rings, hazard semantics, simple Three ring/core helpers | No change in ownership; wells should stay mostly fabric-first |
| Inhibitor | Sim-owned forms, localized shader corruption, form-specific glyph rows, Swarm tendrils, Vessel death/portal behavior | More audio/screen-space dread polish, but not a normal object-icon pass |
| Player ship | A small white triangle in the Three entity layer, plus canvas velocity readout/trails | Hull-specific silhouettes, depth/roll cues, thrust ports, readable delta-v/signal glow |
| Remote players and scavengers | Blue/red triangles with basic rotation | Personality/hull silhouettes, trail identity, signal/readiness cues, opponent-readable motion |
| Stars | Small additive discs plus fabric pushes/rays | Emissive star miniatures, type-specific corona shapes, orbital landmark scale, consumption/relic states |
| Planetoids/comets | Small triangles oriented by velocity | Shaded miniature bodies, icy tails, wake ribbons, orbit/trajectory legibility |
| Wrecks | Rotated squares, color changes for looted state, canvas proximity labels | Debris clusters, tier/material language, salvage glints, broken-hull silhouettes, drift/consumption tells |
| Portals | Additive rings | Layered apertures, unstable rims, blocked/decaying states, extraction funnel depth |
| Fauna/sentries | Simple discs | Family silhouettes and motion signatures that separate ambient ecology from active threat |
| Labels/HUD | DOM HUD plus canvas world labels and warnings | Keep most text out of Three; migrate only world-anchored non-text affordances |

## Design Rules

1. **Glyph-size, not smooth-miniature.** The player should still read as tiny
   against the universe, but "tiny" now means a pixel-authored or
   pixel-resolved top-down asset with emissive details, not only a literal text
   character and not a smooth low-poly miniature.
2. **Four reads per object:** silhouette, motion, fluid signature, interaction
   affordance. If an object only has one of these, it will feel like a sticker.
3. **The fabric stays sovereign.** Wells, currents, pressure, and Inhibitor
   corruption are the visual terrain. Entity art must not obscure the ASCII
   flow the player is trying to read.
4. **Renderer objects are projections.** Meshes and particles never decide
   pickup, death, extraction, signal, AI, or slingshot truth. They consume
   frame state from the client/sim boundary.
5. **Readable at Deck scale.** Every object family must read at 1280x720 and on
   Steam Deck without relying on tiny labels.
6. **Text is exceptional.** World labels can remain canvas/DOM until there is a
   specific reason to put text in Three. The main pass is shapes, materials,
   trails, and affordances.
7. **The void wins, but contrast carries play.** Keep most of the frame dark,
   then use brighter colors, halos, shadows, and backplates for objects the
   player must read instantly.
8. **Separate before decorating.** If an object disappears in the fabric, add a
   contact matte, rim shell, halo, or local background before adding surface
   detail.
9. **Silhouette is affiliation.** Friend, foe, neutral, loot, route anchor, and
   anomaly must be discernible by shape language before color, label, or HUD
   state helps.

## Scene Ownership And Sublayers

The current Three bridge has one broad `world-entity-layer`. The next pass
should split it into semantic subgroups while keeping one top-down camera:

| Subgroup | Contains | Visual Contract |
|----------|----------|-----------------|
| `landmarkEntityGroup` | stars, portals, planetoids, comets, megastructure anchors | Stable route objects with modest glow, contact matte, and state ticks |
| `salvageEntityGroup` | wrecks, vaults, debris fields, echo remnants | Clustered debris silhouettes, amber value glints, looted desaturation |
| `activeEntityGroup` | player, remote pilots, rivals, scavengers, fauna, sentries | Highest readability, hull or family silhouettes, velocity trails |
| `immediateVfxGroup` | thrust, brake, pickup, release, portal sparks | Short-lived action explanation, pooled and event-driven |
| `nearCameraGroup` | sparse dust, speed flecks, lens motes | Depth cue only; never hides player or input-critical objects |

These subgroups can share the same orthographic camera. Parallax should be
subtle and role-bound: background layers move slower, near-camera atmosphere
moves slightly faster, and gameplay entities stay locked to sim/world truth.

## Separation Stack

Each first-class entity should be built from the same small local stack:

1. **Contact matte:** a dark transparent ellipse, hull shadow, or shard-shaped
   patch rendered just above the fabric and below the object. This knocks down
   high-frequency ASCII behind the entity without erasing the whole field.
2. **Core silhouette:** the family shape. It must be readable in one frame at
   Steam Deck scale.
3. **Rim shell:** a thin additive or emissive outline that separates the object
   from nearby fabric highlights.
4. **Halo/backplate:** optional, but required for critical UI-like affordances
   when the background is black or high-frequency. Use it for player, portals,
   pickup-ready wrecks, dangerous rivals, and final-run hazards.
5. **Motion trail:** a short direction/speed cue. Trails describe current state;
   they are not permanent decorative ribbons.
6. **State accent:** a small family color or spark for salvage, threat,
   extraction, ecology, or anomaly state.

This stack is more important than model detail. A tiny clean hull with a matte,
rim, and tuned brightness will read better than a busy miniature sitting naked
on the ASCII ocean.

## Visual Pillar: Silhouette Affiliation

Every non-fluid entity family needs a strong silhouette that survives background
noise. The first read should answer "what relationship does this object have to
me?" before the player has to parse color, label, or exact type.

| Category | Silhouette Goal | Secondary Cues |
|----------|-----------------|----------------|
| Player/friend | clean forward hull, stable readable nose, least visual noise | blue-white/cyan rim, strongest contact matte, thrust/brake ports |
| Foe | sharper aggressive hull or segmented threat shape, directional pursuit read | red shell, hotter trail, signal sparks |
| Neutral ecology | softer or drifting organic outline, less weapon-like directionality | green/cyan pulse, slower breathing motion |
| Loot/wreck | broken cluster or shard pile, no active nose/facing | amber glints, debris matte, looted desaturation |
| Route anchor | radial, orbital, or aperture silhouette | gold/cyan corona, lane ticks, portal instability marks |
| Anomaly/Inhibitor | wrong geometry, asymmetry, impossible cutout or shard | magenta/violet corruption, fabric bite, unstable halo |

Color reinforces affiliation, but shape owns it. If all colors were temporarily
desaturated, the player should still be able to identify player, threat, loot,
and extraction-route objects at gameplay zoom.

## Palette Roles

Use a wider palette by gameplay role, and bias object colors brighter than the
background. Low-saturation dark colors belong to the void, not to interaction.

| Role | Color Family | Guidance |
|------|--------------|----------|
| Void | black, blue-black | Dominant. Preserve negative space and dread. |
| Flow/player/portal tech | cyan, blue-white | Core continuity with the current renderer; punch player/portal values high. |
| High-energy fabric/wells | bone white | Brightest fabric value. Use sparingly so wells remain dangerous and sacred. |
| Rival/direct danger | warning red | Strong and localized; should read in peripheral vision. |
| Salvage/stars/reward | amber, gold | Warm counterpoint for value and route anchors. |
| Ecology/sentries | green | Living/threat systems without stealing Inhibitor magenta. |
| Inhibitor/anomaly | magenta, violet | Rare, invasive, and unmistakable. |

The palette rule is not "one hue per screenshot." It is "one void, one fabric,
and a few bright, meaningful accents."

## Asset Surface Rule

Ships, enemies, wreck fragments, fauna, sentries, and other discrete entity
assets should use one of two surface styles:

1. **2D pixel assets:** hand-authored pixel sprites, sprite sheets, or small
   pixel masks projected on planes/cards in the Three scene.
2. **3D assets with pixelated top-down surfaces:** simple meshes are allowed
   when their visible top-down texture is pixel-authored or pixelated, with
   nearest-neighbor sampling and no smooth material read. Directional lighting
   can shade the asset, but it should still look like a pixel object under a
   top-down camera.

Avoid smooth low-poly, glossy miniature, or vector-clean entity assets for
ships and threats. Three can own depth, parallax, lighting, shadows, disciplined
bloom, lens flecks, CRT treatment, trails, and post-processing; the entity
surface itself should preserve the pixel/ASCII heritage. This is the HD-2D
lesson to borrow: modern scene staging around deliberately old-school asset
surfaces. Do not copy HD-2D depth-of-field wholesale. In LBH's black negative
space, heavy DOF is more likely to smear emptiness than add depth.

Practical renderer requirements:

- use `NearestFilter` for pixel textures;
- disable mipmap blur unless a specific minification test proves it reads
  better;
- snap sprite-card scale to stable pixel multiples where possible;
- keep normal maps optional and chunky if used;
- light pixel-textured meshes directionally without smoothing their texture
  identity away.

## Object Targets

### Player Ship

The ship should be a small pixel hull silhouette with a clear nose, two side
planes, and one or two emissive ports. It should stay roughly the same screen
footprint as the current triangle, but gain:

- a hull-specific outline for Drifter, Breacher, Resonant, Shroud, and Hauler;
- a slight roll/lean cue when accelerating, braking, or being pulled by flow;
- thrust and brake ports that show delta-v spending without hiding the wake;
- a signal glow that is approximate and readable, not a numeric meter clone.

The ship is still not a detailed model. It is a tactical mark with just enough
3D material identity to feel native to the scene.

### Remote Players And AI Ships

Remote humans, AI players, and scavengers should share the ship-material kit but
separate by role:

- remote humans: cooler blue-white hull glow;
- AI rivals: hull/personality silhouette plus signal/trail intensity;
- old scavenger drones: smaller utilitarian shapes if they remain distinct from
  AI players;
- dead or extracted ships: no active mesh; only a brief trail/remnant event.

The visual question should be "what kind of pilot is that?" before it is "what
exact name is that?"

### Wrecks

Wrecks should become small debris clusters instead of rotated squares. Each
cluster should have a center mass, 3-8 fragments, and a faint salvage glint:

- derelict: irregular cool-gray hull plates with amber salvage edges;
- debris field: multiple small fragments distributed along the drift axis;
- vault: compact bright core with harder geometry and rare gold-white pulses;
- echo wreck: same family, but with a softer chronicle/afterimage treatment.

The cluster should lean with drift velocity where available. Looted wrecks keep
their geometry but lose the bright salvage glints, so "used but still drifting"
remains legible.

### Stars

Stars are not just dots. They are route anchors and local force landmarks. The
Three representation should layer:

- a small emissive core;
- a type-specific corona silhouette;
- subtle rotating flare ticks or arcs;
- optional orbit/consumption state markers when a well is eating nearby matter.

Star type can drive material: yellow dwarf warm-gold, red giant broad amber,
white dwarf blue-white hard core, neutron cyan needle/glint. Keep magenta out
of the star family; that remains Inhibitor territory.

### Comets And Planetoids

Planetoids/comets should read as moving bodies, not arrows. Use a shaded body
plus direction-specific effects:

- body: small disc/rock silhouette with a terminator or rim light;
- comet state: ice-blue tail that bends opposite velocity;
- orbital state: faint arc history or lane tick if it is a slingshot anchor;
- consumption state: trailing fragments or heat as it approaches a well.

The tail should be cheap: pooled line/strip geometry or instanced particles, not
per-frame canvas strokes.

### Portals

Portals should be layered apertures in the scene:

- outer unstable ring;
- inner aperture or funnel;
- small rotating ticks that imply timed instability;
- blocked-by-Inhibitor state that looks sealed, not absent;
- final portal state that is distinct but not UI-loud.

The portal's fluid sink and wave behavior remain sim/fabric truth. The Three
object gives the player a readable extraction target and state machine.

### Fauna And Sentries

Fauna should separate ambient ecology from active hazards by shape and motion:

- drift jellies: soft points/discs that pulse and coast with current;
- signal blooms: cloud clusters around noise sources;
- gradient sentries: segmented green patrol shapes with directional lunges;
- future hunters/wasps/wardens: sharper silhouettes and stronger trail cues.

Do not over-detail these before their gameplay behaviors are selected. A strong
motion signature is more valuable than a busy miniature.

### Slingshot And Route Affordances

Slingshot visuals should move out of "debug ring" territory:

- anchor readiness: subtle orbital lane band around the valid anchor;
- engagement: tether/rail line with energy accumulating along it;
- release: brief vector burst aligned to the exit direction;
- chain: small non-text badge or tick stack, with text kept in HUD/canvas if
  needed.

This pass should make routes visible without drawing a full GPS line through the
game.

### Megastructures

Megastructures are future content, but the visual language should anticipate
them. They should use many small semantic Three parts instead of one huge flat
icon: Dyson panels, stargate pylons, derelict station fragments, beacon beams,
and halo arcs. That lets them feel large while still obeying the same top-down
scale system as wrecks and ships.

## Shared Three Style Kit

Create a small renderer-owned kit before hand-authoring every object:

- shared surfaces: pixel sprite cards, pixel mask cards, and simple
  top-down pixel-textured meshes for hulls, debris shards, bodies, fauna, and
  sentries;
- shared geometries: card planes, wedge/diamond pixel masks, debris shard
  meshes, rounded body cards, ring/aperture meshes, short ribbons, line strips,
  point clusters;
- shared materials: hull white, remote blue, rival red, salvage gold, portal
  cyan/violet, star warm/cold, comet ice, sentry green, muted looted metal;
- shared effects: additive glow shell, velocity trail, pulsed rim, signal tint,
  pickup glint, blocked/disabled desaturation;
- shared sizing helpers that call `coords.js` projection helpers instead of
  inventing local screen/world math.

Use pooling or instancing for repeated stars, debris, particles, tails, and
warning ticks. Avoid one material per entity.

## Implementation Passes

1. **Renderer style kit.** Add shared pixel-card/pixel-textured mesh surfaces,
   geometries, materials, and effects under `src/render-three/` and keep
   `ThreeRendererBackend` as the adapter.
2. **Ship family.** Replace player, remote player, and scavenger triangles with
   pixel hull/personality silhouettes and thrust/brake/signal cues.
3. **Wreck family.** Replace square markers with pooled debris clusters,
   looted/vault/echo variants, and drift-aligned glints.
4. **Route landmarks.** Upgrade stars, planetoids/comets, portals, and
   slingshot affordances as route-reading objects.
5. **Threat ecology.** Give fauna/sentries distinct silhouette and motion
   families after their live behavior set is chosen.
6. **Harness and screenshots.** Add an entity-showcase renderer fixture or
   seeded playtest route that puts each object family on screen and records
   scene/ascii/debug captures.
7. **Legacy cleanup.** Remove canvas overlay drawing only after the Three
   equivalent exists and the renderer fixtures prove the object did not vanish.

## Test And Review Contract

The daily harness should not become subjective art review. It should prove the
mechanical contract:

- Three backend still submits `world-entity-layer` and `semantic-flow-field-layer`.
- The entity-showcase fixture has nonzero counts for ships, wrecks, portals,
  stars, planetoids/comets, and at least one threat family.
- Screenshots are nonblank and have visible signal in scene/ascii/debug modes.
- Renderer stats show pooled/instanced resources instead of per-frame material
  churn.
- No world object can render as `undefined`, invisible black-on-black, or
  renderer-only state that disagrees with sim snapshots.

Human review then answers the aesthetic questions: silhouette quality, scale,
readability, dread, and whether the object feels native to the ASCII ocean.

## Open Questions

- Should the first ship silhouettes be hand-authored pixel sprites, generated
  pixel masks projected onto small planes, or pixel-textured top-down meshes?
- How much hull-specific shape should exist before hull ability tuning is done?
- Do stars and planetoids need true 3D lighting, or are emissive/rim materials
  enough for the top-down camera?
- Should world labels remain canvas text permanently, or should rare labels use
  a generated atlas in Three once the object pass is stable?
- Which objects should visibly bite into the ASCII fabric through visual-density
  splats versus staying purely on the Three entity layer?
