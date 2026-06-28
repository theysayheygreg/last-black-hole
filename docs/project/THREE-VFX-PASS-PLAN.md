# Three VFX Pass Plan

> **v0.2 status:** Planning document for adding a reusable Three.js VFX kit to
> Last Singularity. This sits beside the UI motion exploration and builds on
> `THREE-SCENE-VISUAL-HIERARCHY.md`, `THREE-ENTITY-VISUALS.md`, and
> `THREEJS-MIGRATION-PLAN.md`.

## Executive Position

Build rich Three.js VFX now, but do not make Three.js the gameplay architecture.

The current product-facing path is PC/web/Steam Deck. Three is the right tool
for that path because it gives us pooled meshes, instancing, screen-space
passes, depth layering, additive sprites, shader materials, render targets,
diagnostics, and a sane way to make a flat top-down view feel staged and alive.

Future Switch, iPad-native, Metal, Godot, or other console targets should not
force the v0.2 renderer into a lowest-common-denominator shape. Instead, VFX
should be described through renderer-neutral events and presentation contracts.
The Three renderer implements those events now. A future renderer can implement
the same events differently later.

The correct bargain is:

- **Now:** make the Three/Deck/web version beautiful, readable, and expressive.
- **Always:** keep sim, input, authority, and game rules outside Three objects.
- **Later:** port the VFX event vocabulary, not the literal Three scene graph.

## North Star

VFX should make the game easier to read and harder to look away from.

Effects are not decoration first. They explain action, state, motion, threat,
value, and dread:

- thrust and brake effects explain delta-v spending;
- wave-catch effects explain movement affordances;
- pickup glints explain salvage reward;
- portal sparks explain extraction and route urgency;
- Inhibitor faults explain that the screen itself is being compromised;
- title corruption sells the product fantasy before the first run starts.

The black void remains dominant. The ASCII fabric remains the gameplay ocean.
VFX lives around and between those layers, never over them so loudly that the
player stops reading currents, hazards, or ship motion.

## Non-Negotiables

1. **Simulation state never lives in VFX.**
   Particles, trails, sparks, shader faults, and lens effects do not decide
   death, pickup, extraction, signal, AI, collision, route logic, or hull
   coefficients.

2. **VFX consumes events and frame state.**
   VFX can be driven by sim events, client presentation events, phase state,
   and local input presentation. The data should be plain objects, not Three
   object references.

3. **Renderer-neutral event names come first.**
   Prefer `thrusterBurst`, `portalCollapse`, `titleGlyphFault`,
   `pickupGlint`, and `inhibitorScreenFault` over names such as
   `spawnThreeParticles`.

4. **Effects are pooled and bounded.**
   No per-frame allocation storms. No unbounded particle arrays. No title,
   death, or menu idle path that slowly grows forever.

5. **Quality tiers are real.**
   Minimal, default, rich, and capture/high modes should change budgets and
   materials without changing game behavior.

6. **Readability beats spectacle.**
   If an effect hides the player, portal, loot, warning state, or ASCII flow
   information, the effect loses.

7. **The UI stays clean by default.**
   Most world and lens VFX belong below HUD and menus. CRT/display-shell
   treatments may sit above everything only if text remains readable.

8. **Coordinates stay centralized.**
   World effects use the same world/camera conversions as the Three entity
   layer. Screen effects use explicit screen/canvas coordinates. No local
   y-flip folklore.

## Current Renderer Starting Point

The default Three renderer already gives us a useful staging ground:

- `ThreeRendererBackend` shares the Composer WebGL2 context with the ASCII
  fabric chain.
- The visible view is an orthographic top-down 3D scene over the Composer frame.
- Current groups include background, fabric, semantic, entity, entity
  subgroups, and foreground/lens layers.
- Dynamic world meshes are pooled.
- Entity separation diagnostics already track matte count, coverage, and
  visual object counts.
- Renderer fixtures and UI captures already produce deterministic screenshots.

What is missing:

- a real VFX event queue;
- a central VFX manager;
- particle and trail pools;
- VFX-specific materials;
- effect lifetimes and cleanup;
- VFX stats in renderer diagnostics;
- motion capture tests for effects that cannot be judged in a single still.

## Target Data Flow

```text
authoritative sim / local presentation / UI phase code
  emits plain VFX events
    -> frame-state or event queue
      -> renderer adapter
        -> Three VfxManager
          -> pooled particles, trails, lines, sprites, shader impulses
            -> renderer diagnostics + visual harness
```

Example event:

```js
{
  type: 'thrusterBurst',
  sourceId: 'player',
  wx: 1.42,
  wy: 0.83,
  vx: 0.12,
  vy: -0.34,
  facing: 1.9,
  intensity: 0.72,
  role: 'flow'
}
```

Example screen-space event:

```js
{
  type: 'titleGlyphFault',
  glyph: 'S',
  screenX: 186,
  screenY: 214,
  intensity: 0.84,
  seed: 'title-burst-31',
  role: 'inhibitor'
}
```

Those same events can later be implemented by a native renderer, a Godot port,
or a platform-specific Metal path. They should not require Three.js vocabulary.

## Proposed File Shape

Start small and keep the first kit vanilla ES modules:

```text
src/render-three/vfx/
  vfx-manager.js          # owns lifecycle, update, queues, stats
  vfx-events.js           # event shape docs, validators, helper emitters
  vfx-pool.js             # pooled sprite/line/mesh particles
  vfx-materials.js        # additive, normal, matte, glyph-spark materials
  vfx-quality.js          # budgets and feature toggles per quality tier
  effects/
    title-corruption-vfx.js
    ship-motion-vfx.js
    portal-vfx.js
    pickup-vfx.js
    inhibitor-vfx.js
    atmosphere-vfx.js
```

`src/main.js` should eventually stop knowing the details of each effect. It
should gather or emit events, then hand them to the renderer through the frame
context.

## Layer Placement

The visual hierarchy already names the important locations. The implementation
should make them explicit:

| Layer | Use | Notes |
|-------|-----|-------|
| `semanticVfxGroup` | wave catch cues, slingshot lanes, hazard pulses | Low opacity, information-first. |
| `landmarkVfxGroup` | portal sparks, star corona flecks, comet tails | Stable world positions, often below active ships. |
| `activeVfxGroup` | ship thrust, brake sparks, rival trails, fauna pulses | Highest gameplay value. Never hides the player. |
| `immediateVfxGroup` | pickup glints, release bursts, impacts, extraction pulls | Short-lived and event-driven. |
| `nearCameraVfxGroup` | speed flecks, sparse lens motes, foreground dust | Depth and speed only. Strict density cap. |
| `screenVfxGroup` | title glyph faults, scan tears, screen-space Inhibitor hits | Camera-fixed. Most useful for UI/title and dread. |

Most groups render below HUD and menus. If a title/menu effect needs to feel
above UI, start by putting the effect behind the clean text with local glow and
particles. Only move the text itself into Three if that first path is not
expressive enough.

## Implementation Options

### Option A - Pooled Sprite And Mesh Particles

Use small `THREE.Mesh` planes, circles, sparks, and line segments from pools.
Each particle stores position, velocity, age, lifetime, color, size, role, and
blend mode.

Pros:

- easiest to build and debug;
- fits the current pooled mesh style;
- good enough for title sparks, thrust ports, pickup glints, and portal motes;
- straightforward to quality-scale.

Cons:

- draw calls can climb if every particle is a mesh;
- material switching can get expensive;
- not ideal for dense smoke, dust, or thousands of points.

Use first.

### Option B - Instanced Particles

Use one geometry per particle shape and update instance attributes:
position, scale, rotation, age, color, alpha, frame, role. Draw many particles
with one material.

Pros:

- much better draw-call scaling;
- better fit for rich/capture mode;
- good for trails, sparks, motes, and burst fields.

Cons:

- more complex attribute management;
- harder to inspect one particle in a debugger;
- needs careful buffer update ranges.

Use after Option A proves the effect language.

### Option C - Shader-Driven Fullscreen Effects

Use screen-space passes for scan tears, chromatic slips, compression blocks,
Inhibitor screen punches, and title/rift disturbances. Feed them compact
impulse arrays rather than particle meshes.

Pros:

- powerful for title and Inhibitor dread;
- can affect the whole screen without spawning many objects;
- can be made very distinctive.

Cons:

- easy to hurt readability;
- harder to port directly;
- harder to test with still screenshots;
- can overlap badly with ASCII, bloom, and scanlines.

Use sparingly. Effects should be keyed to meaningful events, not idle time.

### Option D - Three Text/CanvasTexture Surfaces

Move some large title or UI text into Three as a `CanvasTexture` plane or
future text/SDF surface so particles can travel in front of, behind, and
through letters.

Pros:

- best integration for title corruption as a spatial event;
- allows glow, masking, and local particles in the same scene;
- can make the title screen a real Three showcase.

Cons:

- bigger UI architecture move;
- risks text readability and font-loading complexity;
- not needed for normal HUD/menu text.

Do not start here. Revisit if behind-text screen VFX is not enough.

### Option E - GPGPU Or Texture-Driven Particle Sim

Use render targets to update particle positions on GPU.

Pros:

- huge particle counts;
- fluid-like motion fields;
- good for future cosmic storms or field visualizers.

Cons:

- too much machinery for v0.2 VFX;
- not needed for title, ship, portal, pickup, or inhibitor first passes.

Backlog this until a specific effect demands it.

## Effect Families

### 1. Title Corruption VFX

Current state: the title wordmark stays clean underneath and
`corruptGlyphText()` selects glyph slots for pink overlay faults.

Goal: keep that logic layer, but add a VFX layer so large title text feels
attacked rather than merely typo-swapped.

Concepts:

- **glyph embers:** tiny magenta/bone fragments emit from corrupted slots and
  drift into the local matte;
- **symbol motes:** small `Psi`, `Delta`, `x`, slash, or hash-like glyph
  sprites spawn and fade quickly;
- **scan splinters:** one to three short horizontal strips shear across the
  corrupted glyph row;
- **afterimage halos:** a pink ghost of a corrupted slot expands 3-8 px behind
  the clean wordmark, then dissolves;
- **baseline static:** a few particles crawl along the word baseline and fall
  into the ASCII fabric behind the matte.

Implementation path:

1. Keep canvas title text as canonical.
2. Expose measured glyph positions from `drawTitleCorruptionOverlay()` as
   screen-space VFX events during title faults.
3. Let `screenVfxGroup` spawn particles behind the overlay canvas text first.
4. Add a `title-vfx` and `title-vfx-heavy` fixture.
5. Capture short clips, because the effect is mostly temporal.

Open question:

- If particles behind canvas text feel too disconnected, promote the title
  wordmark to a Three screen-space surface later.

### 2. Ship Motion VFX

This is the most important gameplay proof. Movement is the game, so VFX should
make movement feel physical without lying about control.

Effects:

- **thrust ports:** cyan-white sparks emitted opposite facing while thrust is
  active;
- **brake sparks:** sharper side/front particles when active brake or reverse
  thrust fires;
- **delta-v spend flash:** a brief cell/port blink when fuel is consumed;
- **velocity ribbon:** a very short trail that describes direction and speed,
  never a long decorative smear;
- **wave-catch shimmer:** subtle ship rim/particle change when a catch or
  slingshot affordance is active;
- **slingshot release burst:** short streaks along the release vector.

Event sources:

- local input presentation for thrust/brake intent;
- authoritative snapshot for ship velocity/facing;
- slingshot engagement/release events;
- future fuel/delta-v spend events.

Acceptance:

- the player reads thrust/brake state without looking at HUD;
- the player remains visible in bright well fabric;
- the effect makes motion feel faster without implying a different hitbox;
- particle count returns to baseline when the ship idles.

### 3. Portal And Extraction VFX

Portals are route anchors and emotional relief. They need more than rings.

Effects:

- **rim sparks:** cyan/magenta flecks orbit the aperture;
- **state ticks:** tiny marks around the rim show decay, blocking, or charge;
- **inward pull:** particles curve into the aperture during extraction;
- **collapse wink:** short radial implosion when a portal evaporates;
- **title rift beat:** the title rift uses the same family so title and
  gameplay teach each other.

Acceptance:

- standard, unstable, and rift portals separate by motion and color;
- portal decay reads without a paragraph of UI;
- extraction feels like passing through an aperture, not touching a ring icon.

### 4. Pickup And Salvage VFX

Salvage should punch through black and cyan fabric without becoming generic
coins.

Effects:

- **amber glints:** pickup-ready wrecks emit occasional sparse glints;
- **collection burst:** small fragments lift from the wreck toward the ship;
- **looted dim:** after pickup, glints stop and wreck rim desaturates;
- **tier accent:** higher-tier loot gets rare bone/gold sparks, not larger UI.

Acceptance:

- player can tell reward-ready wrecks from looted wrecks at a glance;
- pickup confirmation is satisfying but short;
- salvage effects do not visually compete with stars.

### 5. Inhibitor VFX

The Inhibitor remains fabric-first. Three VFX should not turn it into a normal
monster icon. It should make the screen feel wrong.

Effects:

- **localized corrupted motes:** magenta/violet symbol shards around the
  active form or warning location;
- **impossible shards:** angular particles that do not align with normal
  velocity or flow;
- **screen faults:** rare short scan tears or chromatic slips when form state
  advances;
- **glyph leakage:** small symbol particles shed from Inhibitor-owned text and
  vanish into the ASCII field;
- **Vessel pressure:** near-camera particles thin out, then snap back, implying
  the display is being suppressed.

Rules:

- rare, not constant;
- keyed to form/proximity/events;
- no corruption on normal prompts, timers, cargo counts, or controller hints;
- title-scale identity text may be attacked, but primary CTA stays readable.

### 6. Stars, Comets, And Landmarks

These effects support route reading and world character.

Effects:

- star corona flecks that stay sparse;
- comet tails aligned to velocity;
- planetoid dust/shock hints;
- star consumption events that emit a readable but brief relic pulse.

Acceptance:

- stars do not collapse into salvage orange dots;
- comet motion reads before labels;
- landmark VFX remains quieter than player/portal VFX.

### 7. Death, Collapse, And Extraction Results

Run-ending moments need their own motion language.

Effects:

- **well death:** inward bone/red collapse, then silence;
- **Inhibitor death:** magenta shard/screen fault with minimal gore;
- **extraction:** cyan aperture pull plus amber cargo echoes;
- **collapse result:** background VFX can continue beneath the results panel,
  but the result text stays readable.

These are also promo candidates, so harness clips matter.

### 8. Near-Camera Atmosphere

Use this carefully. The void should not fill with snow.

Effects:

- sparse dust/flecks at high speed;
- lens motes near bright portal/star sources;
- very subtle foreground particles during title attract mode.

Rules:

- strict count cap;
- fade out near critical UI and player-centered action;
- never cover the player or current route objective.

## Quality Budgets

Initial budget proposal:

| Quality | Particles | Fullscreen VFX | Trails | Use |
|---------|-----------|----------------|--------|-----|
| `minimal` | 120 active | off except required fade/wipe | shortest | perf baseline, fragile GPUs |
| `default` | 350 active | rare event-only | short | normal desktop and Deck target |
| `rich` | 700 active | event-only plus title | richer | default capture/high-end desktop |
| `capture` | 1200 active | allowed for deterministic promo clips | rich | offline/social capture only |

These are starting caps. Real caps should be based on `npm run test:perf`,
Deck measurements, and the renderer stats after the first implementation.

Budget stats to report:

- active particles;
- active emitters;
- pool capacity;
- dropped particles;
- VFX draw calls;
- VFX triangles/points/lines;
- approximate overdraw or screen coverage if cheap;
- per-effect counts.

## Dev Panel And Runtime Controls

Add a collapsed `vfx` section:

- `vfx.enabled`
- `vfx.quality`
- `vfx.globalIntensity`
- `vfx.particleBudget`
- `vfx.titleCorruption`
- `vfx.shipMotion`
- `vfx.portalSparks`
- `vfx.pickupGlints`
- `vfx.inhibitorFaults`
- `vfx.nearCameraAtmosphere`
- `vfx.debugBounds`
- `vfx.freezeSeed`

Keep this separate from gameplay config. Turning VFX off must not change sim,
movement, signal, pickup, portal, or death behavior.

## Implementation Passes

### Pass 0 - Contract And Harness Prep

Status: this document.

Tasks:

- add this plan and link it from roadmap/docs;
- define the first VFX event names and data shapes in comments or a small
  `vfx-events.js` helper;
- decide where `frameContext.three.vfxEvents` lives;
- add renderer stats placeholders before complex effects land.

Acceptance:

- future agents know VFX is event-driven presentation;
- no implementation starts by adding gameplay truth to Three objects.

### Pass 1 - Minimal VFX Manager

Tasks:

- create `VfxManager`;
- create a pooled sprite/mesh particle primitive;
- add `screenVfxGroup` and `immediateVfxGroup` to `ThreeRendererBackend`;
- update manager per frame and clear expired particles;
- expose stats through `getRendererBackendStats()`;
- add a leak guard test for idle title and playing fixtures.

Acceptance:

- particles can be spawned and expire;
- no unbounded growth over a title/menu idle loop;
- disabling `vfx.enabled` submits zero VFX particles.

### Pass 2 - Title Corruption VFX Prototype

Tasks:

- emit `titleGlyphFault` events from corrupted title glyph positions;
- spawn glyph embers, symbol motes, and scan splinters behind the clean title;
- add `title-vfx` and `title-vfx-heavy` fixtures;
- capture short MP4/GIF clips for review.

Acceptance:

- large title corruption reads as an animated anomaly, not only a glyph swap;
- CTA/subtitle/status copy remains clean and readable;
- screenshot still passes, but motion clip is the real review artifact.

### Pass 3 - Ship Motion VFX

Tasks:

- emit thrust/brake events from local presentation and ship state;
- add thrust port sparks, brake sparks, and a short velocity ribbon;
- add a wave-catch/slingshot affordance shimmer if the state is available;
- add a `ship-motion-vfx` visual fixture or playtest harness lane.

Acceptance:

- motion feels more tactile;
- player silhouette remains the strongest active-entity read;
- VFX particle count returns to baseline after idling.

### Pass 4 - Portal And Pickup VFX

Tasks:

- portal rim sparks, decay ticks, collapse wink, extraction pull;
- pickup-ready wreck glints, collection burst, looted dim handoff;
- make `visualReference` or a new fixture show portal/pickup VFX beside the
  same fabric background.

Acceptance:

- route and reward states read without relying on labels;
- star/salvage/portal color roles remain distinct.

### Pass 5 - Inhibitor Event VFX

Tasks:

- add rare form/proximity/event-driven screen faults;
- add corrupted motes and impossible shards;
- route title and HUD Inhibitor-owned faults through the same role palette;
- add a heavy-stress fixture for review, not default gameplay density.

Acceptance:

- the Inhibitor feels wrong without corrupting normal UI;
- rare magenta/violet moments remain invasive because they are not constant.

### Pass 6 - Lens And Screen-Space Experiments

Tasks:

- test one compact fullscreen impulse pass for scan tears or chromatic slips;
- keep it disabled in minimal/default until measured;
- compare event-driven shader impulses against particle-only title faults.

Acceptance:

- shader VFX earns its cost with a visible, readable difference;
- no always-on full-screen effect hides readability regressions.

### Pass 7 - Unified Post And Capture Polish

Tasks:

- revisit the split Composer/Three post stack once VFX exists;
- decide whether bloom/entity gain needs one global pass after all world
  layers combine;
- add promo capture presets for title VFX, ship motion, portal extraction, and
  Inhibitor dread.

Acceptance:

- the VFX system supports normal play, Deck review, and social capture without
  separate one-off capture hacks.

## Testing And Validation

VFX needs both still and motion validation.

Automated/static:

- `node --check` for new modules;
- event-shape validation if `vfx-events.js` has validators;
- pool lifecycle tests: spawn, update, expire, recycle;
- config validation for quality budgets.

Renderer fixtures:

- `title-vfx`;
- `title-vfx-heavy`;
- `ship-motion-vfx`;
- `portal-pickup-vfx`;
- `inhibitor-vfx-heavy`;
- update `visualReference` only when the fixture is stable enough not to become
  a noisy catch-all.

Harness stats:

- active particles return near zero after an idle period;
- no dropped particles at default quality in standard fixtures;
- draw calls and active counts stay under budget;
- screenshot capture remains nonblank and readable;
- couch proxy stays readable for title/critical UI.

Motion review:

- capture 3-5 second clips for title VFX and ship motion;
- use representative player-reachable captures for promo;
- keep dev-only VFX arrays/reference scenes out of default promo batches.

Manual/playtest:

- check if movement VFX changes perceived control;
- check if title corruption reads better in motion than in a still;
- check Deck readability under normal handheld conditions;
- check minimal quality for low-end and platform probes.

## Portability Plan

Do not water down the Three implementation for hypothetical ports. Do define
the contract ports will need.

Portable:

- event names and data shapes;
- effect roles and palettes;
- timing/lifetime/intensity semantics;
- quality tiers;
- source-of-truth rules about sim versus renderer;
- test fixtures and expected readability outcomes.

Not portable by design:

- Three scene graph objects;
- `THREE.Material` and `THREE.Geometry` choices;
- WebGL blend-state details;
- current Composer/Three shared-context bridge;
- exact shader wrappers.

Future native/Godot/Metal renderers should implement the same effect families
from the same event stream. They should not try to preserve every Three class.

## Risks

| Risk | Why It Matters | Mitigation |
|------|----------------|------------|
| VFX hides gameplay | Effects can obscure ship, portals, or ASCII flow | Keep effects short, local, and below UI; add readability fixtures. |
| Particles leak over long sessions | Title/death/menu idles can run forever | Pool everything, cap everything, test expiry. |
| Three becomes gameplay truth | Portability and authority break | Events in, stats out; no game decisions in meshes/materials. |
| Bloom mush | Bright VFX plus ASCII can lose shape | Use mattes, rims, short lifetimes, and quality tiers. |
| Deck perf drops | Particles and post can be costly | Default budget targets Deck, rich/capture gets extra. |
| Title VFX fights UI readability | Large text needs stable identity | Clean wordmark underneath; corrupt only title-scale identity text. |
| Future port anxiety stalls art direction | We underbuild the visual target | Port behavior later, not Three internals now. |

## Open Decisions For Review

- Should title corruption eventually move the wordmark into Three, or is
  behind-canvas screen VFX enough?
- Should VFX events be assembled in `main.js`, `FrameState`, or a new
  presentation-event module?
- Should `visualReference` expand to include VFX, or should VFX get its own
  reference fixture so readability gates remain stable?
- What is the first Deck particle budget after real hardware measurement?
- Which effect earns the first fullscreen shader impulse: title corruption,
  Inhibitor form change, portal collapse, or none yet?
- How much VFX belongs in normal gameplay versus capture/high mode?

## First Implementation Slice

Recommended tomorrow slice:

1. Add `VfxManager`, particle pool, and two groups:
   `screenVfxGroup` and `immediateVfxGroup`.
2. Add stats and a small expiry/leak test.
3. Emit `titleGlyphFault` events from the existing title corruption overlay.
4. Implement glyph embers plus scan splinters only.
5. Add `title-vfx` and `title-vfx-heavy` captures.
6. Capture one short clip and one screenshot for review.
7. If the title path works, implement ship thrust/brake next.

This gives us a small, reviewable proof without pretending the whole VFX
language is solved.

