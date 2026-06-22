# Three.js Migration Plan

> A staged plan for moving Last Singularity from the current raw WebGL/canvas renderer to a Three.js client renderer while preserving the same simulation, controls, game features, and public aesthetic.

## Executive Position

Migrate LBH to Three.js as a **client renderer runtime**, not as a new game engine. The sim remains authoritative and separate. The client renderer consumes snapshots, local visual state, input state, and content manifests, then renders the world through a Three-managed scene and multi-pass post pipeline.

The migration should preserve the current identity first: ASCII fluid, dark cockpit HUD, route-reading movement, delta-v economy, slingshot affordances, and terminal dread. Three.js is valuable because it gives the renderer a better graph, cleaner resource ownership, stronger 2.5D/3D layering, easier shader pass composition, instancing, asset loading, and better diagnostics. It is not valuable if it turns the game into generic 3D space with the ASCII shader tacked on afterward.

Recommended migration style: **strangler bridge**. Keep the legacy renderer working behind `?renderer=legacy`, make `?renderer=three` the default product-facing path as parity evidence lands, and continue removing legacy ownership in stages.

## Current Implementation Status (2026-06-22)

- **Shipped:** `?renderer=three` boot path, hidden legacy source canvas, visible Three-owned canvas, Three as the default automated renderer target, static build packaging for `three.module.js`, backend diagnostics, fixture coverage, and a first-class top-down Three scene.
- **Three scene contract:** the visible renderer now uses an orthographic top-down camera, z-separated `background-parallax-field`, `fabric-source-layer`, and `foreground-screen-space-layer`, a depth-backed render target, motion-driven parallax, and a screen-space present pass. The viewpoint remains visually flat; the renderer substrate is now 3D.
- **Still legacy-owned:** fluid simulation, Composer shader chain, ASCII pass internals, and most overlay/HUD drawing.
- **Legacy status:** `?renderer=legacy` remains available as an explicit compatibility/fallback lane, but it is no longer the default harness target.
- **Harness:** use `npm test` for the Three core gate, `npm run test:three` for smoke + infra + renderer canary, and `npm run test:legacy` only when touching the bridge/fallback.

## Non-Negotiables

1. **Sim and client renderer remain separate processes.**  
   The authoritative sim continues to run outside the browser/Electron renderer process. The client sends normalized inputs and receives snapshots/events. Renderer-side objects are never gameplay truth.

2. **Control plane remains outside the renderer.**  
   Session lifecycle, host/join/reset, persistence, and stack status stay in Node/control-plane land. Three.js does not own sessions.

3. **Simulation state never lives in Three objects.**  
   Meshes, materials, particles, and cameras are projections of game state. They do not decide deaths, pickups, extraction, signal, AI, hull coefficients, or slingshot authority.

4. **Aesthetic continuity comes before graphical novelty.**  
   The ASCII-over-fluid substrate must survive the migration before new 3D upgrades land.

5. **Controls must remain identical at the action level.**  
   Keyboard, mouse, and gamepad still map through `InputManager` into action state. Three may consume pointer coordinates for camera/ray helpers, but not invent a new control contract.

6. **Coordinate conversion stays centralized.**  
   `src/coords.js` remains the conversion authority. No inline y-flips, no renderer-only coordinate dialect.

7. **The test API survives.**  
   `window.__TEST_API` remains the automation contract for smoke, renderer, perf, remote-authority, and gameplay tests.

## Target Process Topology

```text
Dev/static server
  serves renderer bundle, assets, and test pages

Control plane process
  owns profiles, sessions, registry, launch metadata, stack health

Authoritative sim process
  owns gameplay truth, AI, movement, signal, inventory, events, snapshots

Client renderer process
  browser/Electron window
  owns Three.js renderer, local visual fluid reconstruction, DOM HUD,
  input collection, audio, interpolation, prediction, diagnostics
```

Local standalone play may still run a client-only visual/gameplay mode for development, but the strategic architecture should treat remote-authority as the primary truth model.

## Current Architecture Inventory

Important current files:

- `scripts/sim-runtime.cjs` - authoritative sim and server-owned gameplay.
- `scripts/control-plane-runtime.cjs`, `scripts/session-registry.cjs`, `scripts/stack.cjs` - lifecycle and process orchestration.
- `src/sim/sim-client.js` - browser client HTTP protocol.
- `src/sim/sim-core.js` - local visual/client-mode stepping over existing systems.
- `src/fluid.js` - raw WebGL2 Navier-Stokes solver and fluid display shader.
- `src/render/composer.js` - raw WebGL multi-pass composer.
- `src/render/passes/*` - existing display, bloom, tone, grade, vignette, ASCII, scanline passes.
- `src/main.js` - phase flow, input, local/remote update loop, render frame assembly, and a large amount of overlay drawing.
- `src/hud.js`, `src/ui/*` - DOM HUD and UI primitives.
- `tests/renderer.cjs`, `tests/perf-probe.cjs`, `tests/remote-authority.cjs` - migration gates to preserve.

The package already depends on `three`, but the current no-build browser path cannot safely import bare package specifiers in shipped static output without either a bundler, import map, or vendored module copy.

## End-State Client Module Shape

Keep vanilla ES modules at first. Add TypeScript only after renderer parity, or use JSDoc typedefs during the migration. Do not combine "port to Three" with "convert the whole codebase to TypeScript" in the same pass.

Recommended end-state layout:

```text
src/
  app/
    client-app.js              # boot, phase flow, lifecycle
    frame-state.js             # render-frame snapshot assembled from sim/client state
  render-three/
    app/
      three-renderer.js        # WebGLRenderer, canvas, context loss, resize
      render-loop.js           # render-only orchestration
      cameras.js               # orthographic/topdown camera and parallax cameras
      render-bridge.js         # consumes frame-state, exposes draw(frame)
    graph/
      render-graph.js          # pass ordering and targets
      fullscreen-pass.js       # shared quad/triangle helper
      targets.js               # WebGLRenderTarget ownership
    fluid/
      three-fluid-field.js     # Three-owned render targets and solver passes
      fluid-materials.js       # shader materials for advect, pressure, splat, display
      coarse-field-bridge.js   # fixed-grid/coarse-field integration
    passes/
      fluid-display-pass.js
      accretion-pass.js
      bloom-pass.js
      tonemap-pass.js
      color-grade-pass.js
      ascii-pass.js
      glitch-pass.js
      scanlines-pass.js
    scene/
      world-layer.js           # stars/wells/wrecks/portals/planetoids/ships
      entity-projectors.js     # sim entities -> render objects
      instancing.js            # shared geometry/material pools
      slingshot-layer.js       # affordance rings, tether, chain badges
      inhibitor-layer.js       # wrongness/glitch forms
    hud/
      canvas-overlay-bridge.js # temporary bridge while overlay code migrates
    diagnostics/
      gpu-capture.js
      perf-stats.js
      render-fixtures.js
```

Existing `src/sim`, `src/content`, `src/input`, `src/profile`, `src/audio`, and `src/ui` can remain outside this renderer tree.

## Migration Phases

### Phase 0 - Baseline and Parity Contract

Goal: freeze what "same game" means before changing the renderer.

Deliverables:

- Capture current renderer fixture screenshots with `npm run test:renderer`.
- Run `npm run test:perf` and store the current FPS/pass/payload numbers in a migration note.
- Add a renderer parity checklist covering title, profile select, home, map select, loading, playing, paused, dead, escaped, meta, and remote-authority play.
- Add `window.__TEST_API.getRendererBackend()` returning `legacy` or `three`.
- Add `?renderer=legacy|three` flag plumbing, defaulting to `legacy`.
- Add `?renderQuality=minimal|default|rich` as the forward-compatible version of `?minimalrender=1`.

Risks:

- Existing build health is stale, so the baseline may reveal unrelated failures.
- Screenshot fixtures are useful but not sufficient for aesthetic approval.

Performance implications:

- No runtime cost yet.
- Establishes the before/after numbers that prevent "Three feels slower" from becoming vague.

### Phase 1 - Renderer Bridge Extraction

Goal: decouple `main.js` from the concrete renderer before introducing Three.

Deliverables:

- Extract a `FrameState` builder from `main.js`. It should gather:
  - camera center, grid window, world scale
  - player ship presentation state
  - wells, stars, wrecks, portals, planetoids, scavengers, AI players
  - inhibitor state, signal state, slingshot state, ability VFX state
  - current phase, transition/glitch intensity, render tuning
  - fluid textures or fluid field handles
- Extract a `RendererBridge` interface:
  - `init({ canvas, overlayCanvas, hudRoot })`
  - `resize(width, height, cssRect)`
  - `render(frameState)`
  - `setViewMode('ascii' | 'scene' | 'debug')`
  - `dispose()`
  - `getPerfStats()`
- Move the existing Composer path behind `LegacyRendererBridge`.
- Keep all behavior identical and run the same tests.

Risks:

- `main.js` currently interleaves update and render heavily. Pulling render data out can accidentally change phase timing or remote presentation smoothing.
- Overlay drawing functions rely on module globals. They need read-only frame data instead.

Performance implications:

- A small object-allocation risk if `FrameState` creates fresh deep structures every frame.
- Mitigation: reuse arrays and typed buffers for high-cardinality objects.

### Phase 2 - Three Shell With Legacy Interop

Goal: boot a Three renderer in the client process without rewriting every shader at once.

Status: shipped as the current `ThreeRendererBackend`. The implementation uses a hidden legacy source canvas as a temporary compatibility bridge, then presents that frame inside a real Three scene rather than a fullscreen copy-only pass.

Deliverables:

- Create `ThreeRendererBridge`.
- Construct `THREE.WebGLRenderer` on the existing visible canvas.
- Preserve fixed 1280x720 backing render resolution and letterboxed CSS sizing from `src/render/viewport.js`.
- Implement context-loss and context-restore handling.
- Render a top-down 3D scene with an orthographic camera, z-layered backdrop/fabric/foreground groups, and a screen-space present pass.
- Add SpectorJS-friendly capture hooks and `getPerfStats()` fields:
  - draw calls
  - geometries
  - textures
  - render targets
  - pass count
  - scene kind, camera kind, world layer names, and parallax state
  - GPU/CPU frame timings where available
- Keep legacy raw WebGL fluid/composer available as a fallback.

Interop choice:

- Short-term compatibility can share the same WebGL2 context between Three and the legacy raw WebGL passes. This requires explicit state boundaries:
  - call `threeRenderer.state.reset()` before raw GL work
  - restore viewport, framebuffer, blending, depth, VAO, and texture bindings
  - keep this as a temporary bridge, not the final architecture
- Do not use separate WebGL contexts and upload fluid pixels to Three every frame. Readback plus texture upload would be too expensive and would destroy the reason for the migration.

Risks:

- Shared-context state contamination is real. It can cause flickering, missing textures, or broken post passes.
- Three may assume ownership of state that raw GL currently mutates.

Performance implications:

- Three shell overhead should be small if it only renders a fullscreen quad and no extra scene.
- Shared-context reset calls may add overhead, but the bigger cost is debugging fragility.
- This phase is a bridge only. The final performance target requires Three-owned render targets and passes.

### Phase 3 - Three Multi-Pass Render Graph

Goal: replace `src/render/composer.js` with a Three-managed render graph.

Deliverables:

- Implement `RenderGraph` around `THREE.WebGLRenderTarget`.
- Port fullscreen pass helper using `THREE.RawShaderMaterial` with GLSL3 where needed.
- Preserve current production chain:
  - `FluidDisplay -> FluidGain -> Accretion -> Bloom -> Tonemap -> ColorGrade -> Vignette -> ASCII -> ChromaticAberration -> Scanlines`
- Preserve minimal chain:
  - `FluidDisplay -> Tonemap -> ASCII`
- Port pass toggles:
  - `?disable=bloom,color-grade,vignette,chromatic-aberration,scanlines`
  - new `?renderQuality=minimal|default|rich`
- Match `ASCIIPass.setViewMode('ascii' | 'scene')` for renderer fixtures.
- Keep pass parameters driven by `CONFIG` and phase-specific tuning.

Benefits:

- Render target ownership becomes explicit and disposable.
- Pass ordering becomes easier to inspect and mutate.
- Future 2.5D layers can render into intermediate buffers before ASCII.
- Three diagnostics can report draw calls, texture counts, and render target pressure.

Risks:

- Three's color management and framebuffer defaults can change the look. Lock output color space, tone mapping, and clear behavior explicitly.
- Half-float render target support must be checked and downgraded cleanly if unavailable.
- Bloom/tonemap parity can drift even if the shader code is textually similar.

Performance implications:

- A 1280x720 RGBA16F render target is about 7 MiB. Two ping-pong targets are about 14 MiB before bloom mips and fluid buffers.
- Bloom and ASCII remain the expensive visual passes. Keep minimal chain as a hard diagnostic path.
- Three pass overhead is acceptable if passes reuse render targets and materials. It becomes a problem if passes allocate targets/materials per frame.

### Phase 4 - Three-Owned Fluid Field

Goal: move `src/fluid.js` from raw WebGL resource ownership to Three-managed render targets and shader materials.

Deliverables:

- Port fluid buffers:
  - velocity ping-pong
  - density ping-pong
  - visual density
  - pressure ping-pong
  - divergence
  - curl
  - coarse field texture or upload path
- Port solver passes:
  - advect
  - divergence
  - pressure Jacobi
  - gradient subtract
  - vorticity
  - splat
  - well force
  - translate/fixed-grid camera window
  - visual density fade
  - display
- Keep `FluidField` API compatible with callers:
  - `step(dt)`
  - `splat(...)`
  - `visualSplat(...)`
  - `getVelocity(...)`
  - `translate(...)`
  - `setWellPositions(...)`
  - `updateCoarseField(...)`
- Avoid GPU readback for ordinary gameplay. Test-only readback may remain behind `__TEST_API`.

Risks:

- This is the highest technical risk phase. Fluid sim correctness, toroidal wrapping, coordinate transforms, and fixed-grid translation can drift.
- Three render target sampling defaults must match the legacy solver: filtering, wrapping, precision, and texture format all matter.
- GPU state bugs can look like gameplay bugs because the ship reads the fluid.

Performance implications:

- If implemented cleanly, performance should be comparable to legacy raw WebGL because the same number of fullscreen passes run on the same GPU.
- Three adds CPU overhead per pass, but this should be smaller than shader cost at 720p.
- Fluid resolution must stay profile-driven. Do not silently raise from 256 to 512 because Three makes it easier.
- Consider half-resolution visual-only buffers for bloom/accretion experiments, but keep gameplay velocity at the tuned resolution.

### Phase 5 - Entity Scene Projection

Goal: move clean overlay geometry into Three while preserving legibility over ASCII.

Deliverables:

- Build an orthographic world scene aligned to LBH world units.
- Project current entity systems into render objects:
  - ship triangle/trails
  - wells and kill radii
  - stars and consumption events
  - wreck markers and cargo shimmer
  - portals and evaporation rings
  - planetoids/comets and wake cues
  - scavengers and remote players
  - fauna, sentries, phantom, haunt, Inhibitor forms
  - force pulse cooldown/readiness
  - slingshot affordance rings, tether, energy arc, chain badge
  - hull ability VFX
- Use instancing for repeated markers, dots, particles, glyph fragments, stars, debris, and warning ticks.
- Keep DOM HUD for text-heavy panels.
- Keep a temporary 2D canvas overlay bridge until every feature has a Three equivalent.

Migration order:

1. Static-ish rings and markers: wells, stars, portals.
2. Ship and velocity readout anchor.
3. Wrecks, planetoids, scavengers, remote players.
4. Slingshot affordances and ability VFX.
5. Inhibitor and corruption layers.
6. Menus/end screens only if DOM/canvas remains insufficient.

Risks:

- Clean geometry can become too slick and fight the terminal aesthetic.
- Text labels in Three are a trap unless they need world anchoring. Keep most text in DOM/canvas until there is a specific visual reason.
- Overlay parity is broad. Missing one small affordance can make the game feel broken even if the main scene renders.

Performance implications:

- Instancing should reduce repeated 2D canvas draw cost on large maps.
- Avoid one mesh/material per entity. Pool objects and use shared materials.
- Text rendering in WebGL can become expensive. Prefer DOM/HUD for UI text and canvas-generated atlases for rare world labels.

### Phase 6 - Input and Camera Parity

Goal: preserve the feel of the current controls while giving the renderer a cleaner camera model.

Deliverables:

- Keep `InputManager` as the physical-input-to-action layer.
- Preserve mouse aim, click thrust, right-click brake, keyboard controls, gamepad stick/trigger controls, pulse, slingshot, inventory, consumables, ability1/ability2.
- Convert pointer positions through the same `screenToWorld` and `worldToScreen` helpers.
- Preserve camera follow, lead-ahead, title drift, map selection camera, remote presentation smoothing.
- Add a Three camera adapter:
  - primary orthographic gameplay camera
  - optional parallax/background camera
  - optional 2.5D accent camera for depth layers
- Keep camera state serializable and test-readable.

Risks:

- Three's normalized device coordinates can tempt renderer-specific coordinate math. Route every conversion through `coords.js`.
- Any change to mouse coordinate mapping changes flight feel immediately.

Performance implications:

- Camera itself is cheap.
- Parallax/depth layers add pass cost only if they render into separate targets. Keep them optional and measurable.

### Phase 7 - Sim/Protocol Hardening For Renderer Independence

Goal: make the renderer replaceable without weakening authority.

Deliverables:

- Document the snapshot fields the renderer needs:
  - world entities
  - local player state
  - rival players
  - signal/inhibitor state
  - inventory/loadout/ability state
  - recent events for one-shot VFX/audio
  - sim clocks and map profile
- Add renderer-facing selectors/adapters so Three does not reach into raw snapshot shapes everywhere.
- Keep slingshot remote behavior honest:
  - until server-side slingshot ships, Three renderer must hide remote-authority affordances exactly like the legacy renderer
  - once server slingshot ships, render from authoritative engagement state
- Preserve local visual fluid reconstruction in remote-authority mode. The visual fluid can be client-side, but gameplay consequences are server-owned.

Risks:

- Renderer work can accidentally mask server/client divergence by drawing local-only affordances.
- Snapshot payloads are already large on 10x10. Do not add renderer-only payload bloat without interest filtering.

Performance implications:

- Client interpolation and projection should use compact derived frame state.
- Large-map remote play still needs snapshot interest filtering and delta payloads eventually, but that is independent of Three.

### Phase 8 - HUD, Menus, and UI Surfaces

Goal: preserve the cockpit UI while reducing inline style drift.

Deliverables:

- Keep HUD and menus in DOM unless a surface must live in the world.
- Move repeated UI patterns onto `src/ui/design-tokens.js` and `src/ui/hud-primitives.js`.
- Preserve:
  - title
  - profile select and name sanitization
  - home tabs
  - vault/loadout/rig/chronicle
  - map select and seed preview
  - in-run HUD
  - inventory panel
  - warnings
  - pause
  - death/extraction/run-result screens
- Make DOM layout resize from the same viewport rect used by the Three canvas.
- Add renderer backend badges only in debug/test modes.

Risks:

- Rebuilding menus in Three would slow migration and hurt accessibility/readability.
- Current menus include canvas-drawn pieces in `main.js`; extracting them without changing behavior will take care.

Performance implications:

- DOM HUD cost is usually lower than WebGL text-heavy UI if updates are batched.
- Avoid updating every DOM node every frame. Only write text/style when values change.

### Phase 9 - Build and Packaging

Goal: make Three imports and assets work in local dev, web builds, and packaged desktop builds.

Recommended path:

- Introduce a renderer-only Vite build after the bridge exists.
- Keep Node sim/control scripts as `.cjs` and outside the browser bundle.
- Output static renderer assets into the existing web staging directory.
- Update `scripts/build.cjs` to:
  - run the renderer build
  - copy content JSON and assets
  - preserve `src/build-flags.js` behavior or replace it with generated env constants
  - package desktop apps with the built renderer output
- Keep a no-bundle dev fallback only if it does not complicate shipping.

Alternatives:

- Import map plus copied `node_modules/three/build/three.module.js`: lower initial tooling cost, higher packaging fragility.
- Vendor Three modules directly: simple but easy to forget updates and example loader paths.

Risks:

- A bundler can blur runtime boundaries if server files are accidentally imported into browser code.
- Current harness launches `index-a.html` directly. Tests need to know whether to hit source dev HTML or built output.

Performance implications:

- Bundling improves load time and caching versus many native module fetches.
- Build step cost is irrelevant at runtime but affects jam-speed iteration. Keep `npm run dev` fast.

### Phase 10 - Test Harness Migration

Goal: make the harness prove renderer parity instead of only proving that a page loads.

Deliverables:

- Update smoke tests to run both backends while `legacy` exists:
  - `index-a.html?renderer=legacy`
  - `index-a.html?renderer=three`
- Update renderer fixtures to capture:
  - raw scene view
  - ASCII view
  - debug overlay view
  - minimal render quality
  - rich render quality
- Add canvas-pixel checks for:
  - non-black render
  - glyph quantization present
  - velocity-direction glyph mix present
  - title accretion highlight present
  - no `undefined` labels in world overlays
- Extend perf probe with Three-specific stats:
  - `rendererBackend`
  - draw calls
  - triangles
  - texture count
  - render target count
  - pass list
  - GPU extension support
- Keep remote-authority tests focused on process truth:
  - sim process runs separately
  - client renderer consumes snapshots
  - input posts to sim
  - slingshot affordance remains gated until server authority exists
- Add a migration-only visual comparison command:
  - capture legacy and Three frames for the same fixture/seed
  - write side-by-side contact sheets for human review

Risks:

- Pixel-perfect comparisons are not appropriate for a deliberate render migration.
- Need perceptual or threshold checks, plus human screenshots, not brittle exact diffs.

Performance implications:

- Running both backends in CI-like health gates doubles renderer test time while legacy remains. Use `test:fast` for ordinary work and full parity before default switch.

## Feature Parity Plan By Area

### Movement and Controls

Keep unchanged at the action/state level:

- mouse aim
- click thrust
- right-click brake
- W/S/Space/Ctrl keyboard equivalents
- gamepad analog thrust/brake/stick facing
- pulse
- slingshot engage/release
- inventory and consumable hotkeys
- ability1/ability2

Three work:

- Use the same action state to orient/render ship and aim affordances.
- Preserve velocity readout placement and tier labels.
- Keep slingshot input local-only until server authority exists.

Main risk: coordinate drift changes feel. Treat this as a hard blocker.

### Fluid, Fabric, and ASCII

Keep unchanged first:

- 256 fixed-grid visual field and profile-driven budgets
- camera-anchored fluid window
- coarse-field translation
- toroidal wrapping
- velocity/density/visual-density distinction
- directional ASCII glyphs
- shimmer, glitch, scanlines

Three upgrades after parity:

- render depth-layered fabric before ASCII, then quantize the combined scene
- add optional lensing/displacement pass near wells
- add separate corruption pass for Inhibitor that can replace glyph vocabulary
- add half-res volumetric glow buffers for portals and accretion without touching physics

Main risk: breaking the visual language by making effects too smooth before ASCII. Every upgrade should still read as LBH footage in 10 seconds.

### Entities and World Objects

Keep all entities and behaviors:

- wells
- stars
- planetoids/comets
- wrecks and cargo
- portals
- scavengers and AI players
- fauna and sentries
- Inhibitor forms
- Phantom/haunt glimpses
- slingshot anchors and rings
- hull ability VFX

Three work:

- Project sim entities into pooled render objects.
- Use instanced geometry for repeated markers and particles.
- Use simple custom shaders for rings, wakes, tethers, and glitch forms.
- Keep textual labels sparse and world-anchored only when useful.

Main risk: 3D models or smooth primitives can make entities feel detached from ASCII. They should look like clean instrumentation layered over corrupted fabric.

### Progression, Inventory, and Meta Flow

Keep unchanged:

- profiles
- sanitized pilot names
- loadout contract
- vault
- rig upgrades
- chronicle
- run results
- EM/cargo writeback

Three work:

- None required for gameplay.
- DOM menus should continue to own text-heavy screens.
- Optional background Three scene can animate behind menus.

Main risk: spending renderer migration time rebuilding menu UI for no gameplay gain.

### Remote Authority and Multiplayer-Ready Path

Keep unchanged:

- `SimClient` protocol
- separate sim server
- local-host and remote-client modes
- snapshot polling and interpolation
- remote input posting
- server-owned PlayerBrain coefficients
- server-owned delta-v, brake, speed cap, fuel cells

Three work:

- Render snapshots through the same `FrameState` adapter as local state.
- Do not render client-only mechanics in remote mode unless the snapshot says they exist.
- Add renderer tests that open with `?simServer=` and verify Three backend works against the real sim process.

Main risk: Three visual prediction can make remote mode look more capable than the server truth.

### Audio

Keep `AudioEngine` separate from Three.

Three work:

- Feed audio the same world/camera state as before.
- Optionally use Three vectors internally for spatial math later, but do not require Three for audio correctness.

Main risk: none large. Avoid coupling audio events to mesh lifecycle.

## Benefits

- Cleaner render graph and render target ownership.
- Easier shader pass composition and future visual experiments.
- Better diagnostics through Three renderer info and SpectorJS capture workflow.
- Easier instancing for large-map entity markers, particles, and glyph fragments.
- More room for 2.5D depth, parallax, lensing, and staged composition while keeping ASCII as the final product layer.
- Better asset path if the project later wants GLB cockpit props, menu backdrops, or 3D title objects.
- More maintainable separation between gameplay frame state and visual projection.

## Risks

- **Authority erosion:** renderer objects accidentally become game state. Mitigation: frame-state adapter is read-only, sim remains process-owned.
- **Shared WebGL context instability:** temporary interop can cause hard-to-debug state bugs. Mitigation: keep it short-lived and port to Three-owned targets.
- **Aesthetic drift:** smooth 3D visuals can erase the terminal-fluid identity. Mitigation: ASCII parity first, upgrades second.
- **Performance regression:** Three pass overhead plus extra scene layers can push 10x10 below budget. Mitigation: minimal chain, render-quality flags, instancing, Spector captures.
- **Build complexity:** adding Vite can complicate desktop packaging and harness URLs. Mitigation: renderer-only build, server scripts stay CJS.
- **Main loop extraction risk:** `main.js` mixes update, phase, input, and render. Mitigation: bridge extraction before renderer swap.
- **Test brittleness:** exact screenshot diffs will fail for intentional visual change. Mitigation: threshold checks plus human contact sheets.

## Performance Budget

Target: 60fps interactive, with 20fps headless harness floor remaining a catastrophic-regression gate.

Frame budget at 60fps: 16.67ms.

Suggested client budget:

| Area | Target |
|------|--------|
| Input, phase flow, frame-state assembly | < 1.0ms |
| Local visual sim / fluid update | 2.0-5.0ms |
| Three render graph and post | 3.0-6.0ms |
| Entity scene projection | < 1.5ms |
| DOM HUD updates | < 1.0ms |
| Audio update | < 0.5ms |
| Headroom / GC / browser variance | 2.0-4.0ms |

Hard rules:

- No per-frame material creation.
- No per-frame geometry creation.
- No ordinary gameplay GPU readback.
- No full-resolution extra post targets without a visible reason.
- No per-entity draw calls for common repeated markers.
- No client-side renderer payload bloat in authoritative snapshots.
- Keep `minimal` render quality working forever.

Memory notes:

- One 1280x720 RGBA16F render target is about 7 MiB.
- Two ping-pong HDR targets are about 14 MiB.
- Bloom mips, ASCII input/output, and any extra depth/parallax targets add quickly.
- Fluid 256x256 RGBA16F targets are relatively cheap, but many solver buffers still add up.

## Aesthetic Upgrade Opportunities

Only after parity:

- **Depth-layered fabric:** multiple subtle planes of grid, dust, and fluid response before the ASCII pass.
- **Gravity lensing pass:** screen-space warp around wells and late-run merged masses.
- **Inhibitor glyph corruption:** form-specific alien glyph replacement rather than generic noise.
- **Slingshot route preview:** faint Three-rendered arc/tether that still gets bitten by the ASCII layer.
- **Instanced debris fields:** wrecks shed tiny readable fragments that become part of route visibility.
- **Portal instability volumes:** layered rings and shimmer buffers that the ASCII pass quantizes.
- **Title scene upgrade:** 2.5D accretion disk and parallax starfield, still ending in ASCII.

Avoid:

- realistic spaceship models as the core read
- cinematic camera tilt during gameplay if it harms route-reading
- dense in-scene text
- bloom that hides glyph readability
- particle counts that make the fabric unreadable

## Recommended Milestone Gates

### Gate A - Bridge Exists

- Legacy renderer still passes current tests.
- `RendererBridge` exists.
- `FrameState` exists.
- No behavior changes.

### Gate B - Three Boots

- `?renderer=three` loads.
- Non-black canvas.
- DOM HUD still works.
- Context loss does not permanently kill the page.
- Smoke tests pass.

### Gate C - Three Render Graph Parity

- Fluid display, tone, ASCII, scanlines render in Three.
- Renderer fixtures capture scene/ascii/debug views.
- Minimal and rich chains work.
- Perf probe reports pass list and Three stats.

### Gate D - Fluid Field Port

- Ship reads the Three-owned fluid velocity correctly.
- Wells, stars, splats, visual density, camera translation, and coarse field match legacy behavior.
- Physics/flow tests pass.
- 3x3/5x5/10x10 perf is within agreed tolerance.

### Gate E - Entity Overlay Parity

- Every gameplay overlay feature is visible in Three or intentionally left in DOM/canvas bridge.
- Slingshot affordance, velocity readout, ability VFX, Inhibitor, and run results are accounted for.
- No `undefined` labels or missing remote player markers.

### Gate F - Three Becomes Default

- `?renderer=legacy` remains available for one development cycle.
- Full `npm test`, renderer, title-prototype equivalent, perf probe, and remote-authority tests pass or have explicitly accepted docs.
- Greg playtests movement feel and signs off that the renderer did not change control feel.

### Gate G - Legacy Removal

- Remove raw Composer only after the Three renderer has survived real playtesting.
- Keep useful shader code history and migration notes.
- Refresh build health and docs.

## Implementation Sequence

1. `Docs: lock Three migration parity plan`
2. `Refactor: extract renderer frame state`
3. `Refactor: wrap legacy composer in renderer bridge`
4. `Feat: add Three renderer shell behind flag`
5. `Feat: port fullscreen render graph to Three`
6. `Feat: port ASCII pass to Three render graph`
7. `Feat: port fluid display pass to Three render graph`
8. `Feat: port fluid solver targets to Three`
9. `Feat: project world overlays through Three scene`
10. `Feat: port slingshot and ability VFX overlays`
11. `Refactor: move menu canvas draws to DOM or Three bridge`
12. `Test: add renderer backend parity harness`
13. `Build: add renderer bundle path for Three client`
14. `Tune: restore visual parity and perf budgets`
15. `Docs: mark Three renderer default and legacy fallback`

Each step should be small enough to commit independently.

## Open Decisions

- Should the renderer build move to Vite immediately after the bridge, or should the first Three shell use an import map?
- Should gameplay remain strictly orthographic top-down, or can the title/menu use 2.5D first?
- How long should the legacy renderer remain after Three becomes default?
- What is the acceptable perf delta during parity: same FPS, within 10 percent, or "subjectively equal on target hardware"?
- Should the Three fluid field preserve exact shader text first, or use the migration as a chance to clean shader interfaces?

## Recommendation

Do the migration, but do it as a renderer replacement with hard process boundaries. Three.js should own the visual pipeline, post-processing, render targets, camera layers, and entity projection. It should not own the game.

The first visible success should not be "new 3D." It should be "the same LBH footage, now running through a cleaner Three render graph." Once that is true, the fun upgrades become much safer: lensing, depth-layered fabric, richer title composition, instanced debris, and Inhibitor corruption that looks genuinely wrong.
