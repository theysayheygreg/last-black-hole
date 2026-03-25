# Changelog

> Human-readable version history of design docs.
> Git is authoritative. This is for quick scanning without `git log`.

---

## 2026-03-25 Inventory Wiring + Star Visual Fix

### Gameplay
- **Inventory equip/load loop** — confirm on cargo equippable auto-equips to first open slot (or swaps slot 0). Consumables auto-load to hotbar. Action hints show `[equip]`/`[load]`/`[drop]` per item type.
- **showKillRadii effect** (equippable artifact) — dashed red circles at well kill zones during gameplay. First real equippable effect.
- **shieldBurst effect** (consumable) — survive one well contact. Pulsing blue shield ring indicator. First real consumable effect.
- Other consumable effects have stub dispatchers (fire + consume but show "not yet implemented").

### Bug Fixes
- **Star clearing suppressing well rings** — stars injected negative visual density every frame (-0.2 per tick). This accumulated in the visual density buffer and drove `liveSpace` to zero near stars, suppressing ring/halo rendering for nearby wells. W0 and W2 on the 3×3 map were both ~0.67 world units from Star 0 — inside the clearing bubble. Fix: removed the negative visual splat entirely. The star's outward push force already creates a natural low-density clearing zone via physics.

### Why
The star clearing was a visual shortcut that conflicted with well ring rendering. The visual density buffer is a shared channel — negative injectors can stomp on positive signals from other systems. Removing the shortcut and relying on physics for the clearing effect eliminates the cross-talk.

---

## 2026-03-25 Shader Distance & Toroidal Wrapping Fixes

### Bug Fixes
- **Display shader dist calculation wrong** — `dist = length(diff) / uvS` produced reference-scaled values while shape data was in world-space. Fixed to `dist = length(diff) * u_worldScale`. All well rings were 3× oversized on the 3×3 map, making large-mass wells' gradients invisible.
- **Splat shader missing toroidal wrap** — `FRAG_SPLAT` computed straight-line distance instead of toroidal shortest-path. Density/velocity splats near UV boundaries were cut off, creating hard edges in the fluid field. Fixed by adding `diff = diff - round(diff)`.
- **Well force shader missing toroidal wrap** — `FRAG_WELL_FORCE` had same issue. Gravity didn't wrap across texture boundaries, so wells near edges pulled asymmetrically. Fixed identically.

### Hardening
- **TOROIDAL WRAPPING RULE** documented in fluid.js header. All 4 point-to-point shaders now use consistent `// TOROIDAL WRAPPING RULE` comment (greppable). Audited all 11 shaders — the 7 neighbor-sampling shaders correctly rely on GL_REPEAT.
- **Named magic numbers** in `getRenderShapes()`: `CORE_KILL_FRAC` (1/3, visual ratio) and `MIN_ACCRETION_WORLD` (0.036, world-space floor) — distinguished from coordinate conversions.
- **Removed dead `uvS` variable** from display shader (leftover from old dist calculation).

### Design Observation (to revisit)
Ring screen coverage grows with map size: 3×3 wells take 8-23% of screen, 5×5 takes 15-51%, 10×10 mega-well fills 126%. This is mathematically correct (CONFIG accretionRadius is UV-space × WORLD_SCALE) but may need per-map tuning or a different scaling approach.

---

## 2026-03-20 Day Session (Feature Design Sprint)

### New Design Documents
- **SCAVENGERS.md** — AI ship opponents. Two archetypes (drifter/vulture), behavioral state machine, same physics as player, portal consumption on extraction. Full CONFIG section.
- **SLINGSHOT.md** — Gravity slingshot mechanic. Approach → catch → orbit → release → boost. Hybrid input (auto-catch, thrust-to-release). Orbital assist force. 2-3x speed boost. Turns wells from pure threats into movement tools.
- **AUDIO.md** — Jam-scoped audio plan. Layer 1 (drone), Layer 2 (well harmonics), event sounds. All Web Audio API synthesis. ~175 lines total.
- **SIGNATURES.md** — Cosmic signatures for procedural run identity. 6 universe personalities with CONFIG overrides and flavor text.

### Updated Design Documents
- **COMBAT.md** — Updated recommendation section. Non-lethal tools confirmed for jam build. Revised priority: force pulse → signal flare → tether. Detailed designs for all three tools.
- **ENTITIES.md** — Added scavenger, force pulse, signal flare, tether entries to entity overview table and interaction matrix. Added full sections for each new entity type.

### Journal Updates
- **DECISION-LOG.md** — 6 new entries: non-lethal combat tools, AI scavengers, gravity slingshot, cosmic signatures, audio scope, workstream split.
- **DEVLOG.md** — Day 5 entry: the renderer split, the teeth, feature design sprint, build priorities for Fri/Sat/Sun.

### Why
Game needs more verbs. Fly/loot/escape is working but thin. AI opponents create contested extraction, combat tools give player agency, slingshot creates movement skill ceiling, signatures add replay value, audio transforms feel. Building all of these over the final 3 days.

---

## 2026-03-20 (Jam Day 5: Renderer Recovery Planning)

### docs/project/ — New Files
- **RENDERER-RECOVERY-PLAN.md** — New focused rendering workstream plan. Defines the 3-layer renderer contract (physics truth, scene shaping, ASCII presentation), reinterprets density as fabric excitation, defines the four player-facing reads (void, accretion, flow, surf lane), and splits work between Forge, Claude/Orrery, and Orb.

### docs/reference/ — New Files
- **RENDERER-HARNESS.md** — Documents the dedicated renderer capture path. Adds deterministic fixtures, timed captures at multiple moments, and pre-ASCII vs final ASCII outputs so renderer work is judged over time instead of from a single opportunistic frame.

### docs/journal/ — Updated
- **DECISION-LOG.md** — Added renderer recovery entry. Commits the jam-week renderer contract: black-hole readability first, explicit scene shaping, and ASCII as presentation rather than the source of meaning.

### Why
Renderer work had become entangled with feature work and too much meaning was being compressed into one channel. This plan isolates the rendering lane so Forge can stabilize the look while Claude keeps pushing gameplay and content.

---

## 2026-03-17 Night Session (Map Files + UI Flow)

### Map File System
- **coords.js** — `WORLD_SCALE` changed from `const` to `let` with `setWorldScale()` setter. ES module live binding ensures all importers see updates.
- **map-loader.js** — New file. `loadMap(map, systems)` clears all entity arrays, sets world scale, spawns wells/stars/loot/portals/planetoids from map data. Reinitializes fluid sim if map specifies different resolution.
- **maps/shallows-3x3.js** — Current 3×3 layout extracted verbatim from hardcoded init().
- **maps/expanse-5x5.js** — Medium map. 8 wells, 3 stars, 6 loot, 3 portals, 5 planetoids.
- **maps/deep-field-10x10.js** — Large map. 20 wells, 6 stars, 12 loot, 5 portals, 8 planetoids. Fluid resolution 512 for equivalent texel density.

### Force Culling
- Wells, stars, loot, portals all skip force injection for entities beyond `CAMERA_VIEW + 0.5` world-units from camera. Critical for 10×10 (20 wells = 20 GPU passes without culling).

### Fluid Reinitialize
- **fluid.js** — Added `reinitialize(newRes)` method. Destroys old framebuffers, creates new ones at specified resolution. Called automatically by map loader when needed.

### UI Flow (Title Screen + Map Select)
- **Game phases expanded:** `title` → `mapSelect` → `playing` (+ existing `dead`/`escaped`/`paused`).
- **Title screen:** Red "LAST BLACK HOLE" title with pulsing opacity, subtitle, blinking prompt. Fluid sim runs as ambient background with slow camera drift.
- **Map select:** Lists all 3 maps with name, size, and entity counts. Up/Down to navigate, Space to launch, ESC to go back.
- **Phase transitions:** Title→Space→MapSelect, MapSelect→Space→Playing, Dead/Escaped→Space→MapSelect, Paused→ESC→MapSelect.
- **input.js** — Added `upPressed`/`downPressed` getters for d-pad, arrows, and stick menu navigation.
- **main.js** — Restructured game loop: sim runs during menus (ambient background), input always polled, ship/entity rendering skipped during menus.
- **test-api.js** — `triggerRestart()` now calls `startGame()` to ensure playing state (skips title screen).

### Refactoring
- **main.js** — Removed all hardcoded entity creation (~40 lines). `init()` and `restart()` both use `loadMap()`. `STARTING_MASSES` constant replaced with dynamic `startingMasses` from map loader.

---

## 2026-03-17 Day Shift (Controller Overhaul + Playtest Roadmap)

### Controller Input Overhaul
- **input.js** fully rewritten with proper input processing pipeline:
  - Scaled radial deadzone (magnitude-based, no cardinal snapping, remapped 0–1 range)
  - Aim state hysteresis (enter at 0.25, exit at 0.10, 80ms hold timer absorbs spring bounce)
  - Soft tiered angular smoothing (full smoothing <3°, zero smoothing >15°, blend between)
  - Last-known-angle hold on stick release (no jitter, no snap to zero)
- All constants tunable in dev panel under input section
- Patterns from Warhawk/Starhawk (Josh Sutphin) and JoyShockMapper (Jibb Smart)

### Playtest Feedback (3x3 map)
- Larger map works well — wants 10×10 with more objects
- Wakes still imperceptible against ambient fluid density
- ASCII visuals flat — not enough charset variety, fabric feels static
- Controller jitter fixed (above)
- Map files needed for rapid layout iteration

### Roadmap Updated
Today's remaining tasks queued: wake visibility boost, ASCII visual depth, map file format, 5×5 prototype (stretch). 10×10 deferred pending architectural decisions (fluid resolution scaling, spatial force culling).

---

## 2026-03-17 Morning Session (Fixes + Refactor + Comment Pass)

### Fixes
- **Ship spawn location**: Moved from (1.44, 1.65) — which was 0.06 world-units from a star that punted the ship into a well — to (1.5, 0.45) in safe open space.
- **Gravity normalization**: Added distance normalization (÷ 0.25 reference) to ship gravity and star push. Without it, world-space distances made forces ~10× too strong.
- **Parallax between fluid and overlay**: `worldToScreen` was mapping 3 world-units per screen (old scale), but the fluid shader maps 1 world-unit per screen. Fixed to match.
- **Force stability guards**: Raised FORCE_MIN_DIST from 0.1 to 0.15 world-units.

### Refactoring
- **coords.js**: Added `CAMERA_VIEW`, `pxPerWorld(screenDim)`, `worldDirectionTo()`. Eliminated scattered scale calculations across 5 files.
- **physics.js**: New file — centralized all entity→ship force math. `inversePowerForce`, `proximityForce`, `waveBandForce`, `applyForceToShip`. Constants `FORCE_REF_DIST` (0.25) and `FORCE_MIN_DIST` (0.15).
- **config.js**: Moved all bare magic numbers into CONFIG: `fluidClampRadius`, `fluidTerminalSpeed` for each entity system; `camera.lerpSpeed/leadAhead/maxLerp`; `wells.accretionRings[]` data; portal `falloff`/`orbitalStrength`.
- **Gravity max range**: Wells (0.8) and stars (0.6) now fade to zero via quadratic curve. Creates genuine flat empty space.

### Code Comment Pass
- Every scalar, magic number, and tuning value in config.js, coords.js, physics.js, and all entity files now has a human-readable comment explaining what it does, its units, and how changing it affects gameplay.

---

## 2026-03-17 Night Shift (Map Expansion + Portals + Planetoids)

### src/ — New Files
- **portals.js** — PortalSystem class. Exit wormholes with weak inward pull, rotating 3-arm purple spiral density, pulsing overlay ring. Capture radius triggers extraction ("ESCAPED" screen).
- **planetoids.js** — PlanetoidSystem class. Moving terrain with 3 path types: orbit (elliptical around wells), figure-8 (Lissajous between wells), transit (straight line across map). Bow shock + wake vortex fluid injection creates surfable currents. Consumed by wells on contact (adds mass, spawns wave ring).

### src/ — Major Modifications
- **coords.js** — WORLD_SCALE=3.0. New functions: worldToFluidUV, worldToScreen (camera-aware + toroidal), screenToWorld, worldDistance, worldDisplacement. Legacy well-space functions kept.
- **fluid.js** — FBO textures REPEAT wrap (seamless world wrapping). Display shader adds u_camOffset/u_worldScale uniforms — camera controls which slice of the fluid field is visible. Toroidal distance for well proximity coloring.
- **main.js** — Camera state (camX/camY) with smooth lerp + velocity lead-ahead. All entities spread across 3x3 map. Portal/planetoid systems wired. Escaped screen. Restart resets planetoids.
- **ship.js** — World-space position (wx/wy, 0-3 range). Thrust converts px/s² to world-units at use-site. Mouse aim via screenToWorld with camera. Wake splats use worldToFluidUV.
- **wells.js** — World-space positions. checkDeath uses worldDistance. Accretion disk splat radii scaled for 3x UV.
- **stars.js** — World-space positions. applyToShip uses worldDisplacement. Ray/clearing radii scaled.
- **loot.js** — World-space positions. Glow/shimmer radii scaled.
- **wave-rings.js** — World-space. Radius/speed/push in world-units. Render uses worldToScreen with camera.
- **config.js** — Added portals + planetoids sections. Retuned: wells.shipPullStrength 250px→0.6 world-units, events converted to world-units, growth slowed (45s/0.02 mass), fluid dissipation radii tightened.
- **dev-panel.js** — Range hints for portals, planetoids, retuned events/wells values.
- **presets.js** — All preset values converted to world-space.
- **test-api.js** — getShipPos returns world coords, teleportShip takes world coords, getFluidVelAt takes world coords.

### tests/
- **physics.js** — Updated thresholds for world-space, restarts between tests to avoid stale gamePhase.
- **coordinates.js** — Teleport uses well.wx/wy instead of screen coords.

### Entity Placement (3x3 map)
- Wells: (1.0, 1.2), (2.1, 0.9), (1.95, 2.16), (0.6, 2.25)
- Stars: (1.5, 1.65), (0.45, 0.75)
- Loot: (1.5, 1.05), (1.35, 2.1), (2.4, 1.65)
- Portals: (0.3, 0.3), (2.7, 2.7)
- Planetoids: 2 orbiting + 1 figure-8 at init, transits spawn every 15-25s

### Why
Greg's playtest: "world is too cramped, everything on one screen." 3x3 expansion gives room to explore, camera follow makes the world feel large. Portals prototype the extraction loop. Planetoids create moving terrain with surfable wakes and feed wells through consumption.

---

## 2026-03-17 (Jam Day 2: Tuesday — Sim Expansion Experiments 1-5)

### src/ — New Files
- **stars.js** — StarSystem class. Stars push fluid outward (negative gravity via `applyWellForce`), inject rotating radial light rays and bright core, push ship away. Creates equilibrium zones with wells.
- **loot.js** — LootSystem class. Anchored points that obstruct flow via zero-velocity splats. Ambient glow and rotating shimmer. Future loot pickup locations.
- **input.js** — InputManager class. Gamepad API abstraction. Left stick = analog facing, R2 = analog thrust (0-1), L2 = analog brake. Auto-detects gamepad with mouse fallback.

### src/ — Modified
- **config.js** — Ship slowdown: `thrustAccel` 2500→800, `drag` 0.03→0.06, `fluidCoupling` 0.6→1.2. Added `ship.wake` sub-object for bullet wake params. Added `stars`, `loot`, `input` CONFIG sections.
- **ship.js** — Bullet wake: speed-based (not thrust-based), 3 directional splats behind ship, density/force cut to ~30-40% of old values. Analog thrust: `thrustIntensity` (0-1) replaces boolean `thrusting` for gamepad. Analog brake via `brakeIntensity`. Direct facing setter for gamepad stick.
- **fluid.js** — Dissipation shader `u_wellPositions` array expanded from 4 to 12 to support wells + stars + loot as density sources.
- **main.js** — Wired StarSystem, LootSystem, InputManager. Stars placed at (0.50, 0.55) and (0.15, 0.25). Loot at 3 navigable positions between wells/stars. Input polling before ship update. Star push after ship update. All density sources passed to dissipation shader.
- **dev-panel.js** — Added range hints for stars, loot, ship.wake, input sections. Added nested sub-object support (handles `ship.wake.*` sliders).

### docs/design/ — New Files
- **ENTITIES.md** — Entity types, force models, interaction matrix, performance budget.

### Why
L0 physics are working but the world needs more things to navigate around. Ship was too fast to read currents (thrustAccel 2500 → terminal vel ~1333px/s). Five experiments add: deliberate ship movement, speed-based wake, radiant push sources, flow obstacles, and analog controller support. Each produces a visible, playtestable result.

---

## 2026-03-16 (Jam Day 1: Monday — Fluid Diagnostics)

### src/ — Modified
- **fluid.js** — Added `FRAG_DISSIPATION` shader (distance-based density dissipation keyed to well proximity). Added `readDensityAt()` method (GPU readback, same pattern as `readVelocityAt`). Added `setWellPositions()` for passing well UVs to dissipation pass. Wired dissipation pass into `step()` after density advection (step 4b). Advection dissipation set to 1.0 — all density decay now handled by the distance-based pass.
- **config.js** — Added `nearDissipation` (0.998), `farDissipation` (0.985), `dissipationNearRadius` (0.08), `dissipationFarRadius` (0.35) to fluid section. Added `showFluidDiagnostic` debug flag.
- **main.js** — Calls `fluid.setWellPositions()` before `fluid.step()` each frame. Added fluid diagnostic overlay (section 9b) behind `showFluidDiagnostic` flag: density at ship, density+velocity at each well, midpoint between closest wells, min/max across sparse grid.

### Why
Shader tuning session failed because density values accumulated to ~3850x the display range (injection ~7.7/frame / 0.002 decay = 3850 steady-state). Everything > 1.0 clamped to white. We were tuning blind. Distance-based dissipation creates a natural gradient: persistent near wells (accretion zones), fast fadeout in empty space. Diagnostic overlay lets us see actual values before tuning the display shader.

---

## 2026-03-15 (Pre-Jam Day 2: Architecture Day — Late Session)

### docs/design/ — New Files
- **CONTROLS.md** — NEW. Ship control model (turn speed, mass, inertia, gravity response, thrust model). Mouse input schemes (Model 1: distance-thrust recommended, Model 2: binary fallback, Model 3: drag-magnet reject). DualSense controller mapping with adaptive triggers and HD haptics. Input-dependent affordance tuning table. Ship control tuning variables table. Split from MOVEMENT.md — controls/input lives here, surfing metaphor/fabric stays there.
- **TUNING.md** — NEW. Tuning workflow definition: 4 progressive modes (dev panel Monday, sandbox Monday evening, scenario snapshots Wednesday, A/B testing Thursday). Day-by-day tuning guide with slider tables per layer. Plain English to numbers translation guide. Dev panel implementation spec: CONFIG object architecture, progressive slider enhancement, "Commit Tuning" workflow.
- **AGENT-TESTING.md** — NEW. Agent self-testing strategy. The split: machines verify "does it work?", Greg verifies "does it feel right?". Puppeteer test harness. 5 test layers built incrementally (smoke, physics, gameloop, signal, integration, visual regression). `window.__TEST_API` interface spec. When-tests-run protocol for night/morning/day shifts. Implementation budget (~690 lines).

### docs/design/ — Updated
- **MOVEMENT.md** — Split: ship physics model, input schemes, and per-device tuning extracted to new CONTROLS.md. MOVEMENT.md now focuses on surfing metaphor, control affordances (magnetism, forgiveness, stickiness), fabric interactions, and skill progression. Ship control tuning table replaced with cross-reference to CONTROLS.md.
- **DESIGN-DEEP-DIVE.md** — Added cross-reference to CONTROLS.md, TUNING.md, and AGENT-TESTING.md in the Object-Fluid Coupling section.

### docs/project/ — Updated
- **AGENT-PROMPTS.md** — Shared context updated: added CONTROLS.md and TUNING.md to required reading list. Added CONFIG object pattern with example code and explanation. Added __TEST_API requirement. Fixed entry point references to `index-a.html` / `index-b.html` (was `index.html`). File naming sections updated per prototype.
- **ROADMAP.md** — Task numbering updated: N0 (smoke tests), N1a/N1b (parallel physics experiments), N2 (dev panel), N3 (ASCII shader). Fixed N7 dependency reference (was N2, now N1a/N1b winner). Task count corrected to 21.
- **BUILD-PLAN.md** — Layer 0 now lists dev panel, CONFIG object, `window.__TEST_API`, and smoke tests as Monday deliverables.
- **JAM-CONTRACT.md** — Agent prompt template updated with Architecture Requirements section: CONFIG object, `window.__TEST_API`, dev panel slider integration.

### CLAUDE.md — Updated
- "Read These First" L0 entry now includes CONTROLS.md.
- Testing section updated with Puppeteer test runner command and `window.__TEST_API` reference.

### docs/journal/ — Updated
- **DECISION-LOG.md** — New entries: dev panel as mandatory build requirement, CONFIG object as architectural pattern, Puppeteer test harness approach, mouse control model ranking (Model 1 recommended, Model 2 fallback), DualSense as Tuesday/Wednesday stretch.
- **CHANGELOG.md** — This entry. Updated ROADMAP.md task count reference.

---

## 2026-03-20 (Jam Day 5: Renderer Recovery Planning)

### docs/project/ — New Files
- **RENDERER-RECOVERY-PLAN.md** — New focused rendering workstream plan. Defines the 3-layer renderer contract (physics truth, scene shaping, ASCII presentation), reinterprets density as fabric excitation, defines the four player-facing reads (void, accretion, flow, surf lane), and splits work between Forge, Claude/Orrery, and Orb.

### docs/journal/ — Updated
- **DECISION-LOG.md** — Added renderer recovery entry. Commits the jam-week renderer contract: black-hole readability first, explicit scene shaping, and ASCII as presentation rather than the source of meaning.

### Why
Renderer work had become entangled with feature work and too much meaning was being compressed into one channel. This plan isolates the rendering lane so Forge can stabilize the look while Claude keeps pushing gameplay and content.

---

## 2026-03-15 (Pre-Jam Day 2: Architecture Day)

### docs/design/
- **DESIGN.md** — unchanged (the bible holds)
- **DESIGN-DEEP-DIVE.md** — added ASCII shader research (pmndrs/postprocessing as starting point, 4-pass GPU pipeline, font atlas, braille characters), entity IFF system, NERV HUD architecture, universe gen rules, 10-minute match timeline, scavenger AI, fauna types, Inhibitor mechanics, sound direction, camera system. **Late update:** physics architecture section rewritten to reflect parallel experiment decision (dual-sim → two approaches built simultaneously).
- **SIGNAL-DESIGN.md** — NEW. Signal as "the tax on ambition." 6-tier gradient (GHOST→THRESHOLD), per-player in multiplayer, peak-based Inhibitor trigger. Explicit: signal does NOT buy capability.
- **COMBAT.md** — NEW. Full case for/against weapons. Conclusion: no lethal combat for v1. Non-lethal tools (force pulse, signal flare, tether) as stretch goals.
- **MUSIC.md** — NEW. 5-layer procedural soundscape (drone, well harmonics, wave rhythm, signal choir, Inhibitor presence). All Web Audio API, no libraries, no samples.
- **SCALING.md** — NEW. Player scaling (1→10→100), universe scaling (small→vast). Jam target: 4x4 screens with frustum rendering. Multiplayer architecture (authoritative server + client prediction). 5 clean-architecture choices for the jam. **Late update:** Phase 2 multiplayer relabeled as stretch goal per decision log.
- **PILLARS.md** — NEW. 6 design pillars: Art Is Product, Movement Is the Game, Signal Is Consequence, Universe Is the Clock, Dread Over Difficulty, Run It Twice. Ordered by priority. Each has "the test" section.
- **MOVEMENT.md** — NEW. Surfing metaphor (10 concepts mapped from real surfing), control affordances (wave magnetism, well escape assist, wreck stickiness, portal alignment, input buffering with coyote time), fabric interactions (wells, wrecks, mergers, cosmic signatures), skill progression (beginner→expert), tuning variables with starting values.

### docs/project/
- **BUILD-PLAN.md** — updated: added threat priority note (Inhibitor core, fauna stretch, scavengers only if ahead).
- **JAM-CONTRACT.md** — NEW. Day/night shift protocol, checkpoint cadence, Forge's role as architectural brake, task sequencing rules, agent prompt template, scope ratchet triggers. Updated with Forge review gate. **Late update:** added documentation structure (4-folder layout), journal files, ownership table, 7 update triggers, rules.
- **ROADMAP.md** — NEW. Detailed hour-by-hour roadmap for 7-day jam. 21 named tasks (N0, N1a, N1b, N2-N19) with deliverables, dependencies, acceptance criteria. Scope ratchets at every day boundary. **Updated:** task numbering changed to N0/N1a/N1b/N2/N3... to reflect parallel experiments and dev panel insertion. N0 = smoke tests, N1a/N1b = parallel physics experiments, N2 = dev panel, N3 = ASCII shader.
- **FORGE-REVIEW.md** — NEW. Two-pass review brief for Forge (creative + technical).
- **GEMINI-PROMPTS.md** — NEW. 8 image generation prompts (3 key art, 3 game moments, 2 entity concepts).
- **PRE-MONDAY-RESEARCH.md** — updated with pmndrs ASCII shader references, CSS color palette, word lists for procgen. **Late update:** font atlas size corrected to 16×16 (matches DEEP-DIVE/pmndrs).

### docs/reference/
- **EVE-WORMHOLE-REFERENCE.md** — NEW. 6 patterns to steal (dual-depletion, asymmetric info, environmental effects, portal capacity, K162 commitment rule, rolling). Universe type table. Naming inspiration.
- **STELLARIS-REFERENCE.md** — NEW. Crisis escalation, Shroud bargains, environmental hazards, anomaly pity timers, archaeology chapters, precursor archetypes, leviathans, L-Gate mystery, Horizon Signal cosmic horror, naming conventions, Alexis Kennedy narrative principles.
- **reviews/forge-review-2026-03-15.md** — Forge's delivered review. Showstoppers, risks, opportunities, recommendations, cut list. Key phrase: "Fake the theorem, ship the feeling."

### docs/journal/
- **DEVLOG.md** — NEW. Reverse-chronological dev journal. Entries for Mar 14 (The Spark) and Mar 15 (The Architecture Day).
- **CONTENT-PLAN.md** — NEW. Post-jam content plan (Twitter threads, blog posts, YouTube concepts).
- **DECISION-LOG.md** — NEW. Full decision trees for: physics architecture (reopened with parallel experiments option), signal mechanic, combat, threats, multiplayer, visual stack, naming. 8 design forks tracked.
- **CHANGELOG.md** — NEW. This file.

---

## 2026-03-14 (Pre-Jam Day 1: The Spark)

### docs/design/
- **DESIGN.md** — NEW. Core game design document. One-sentence pitch, core loop, universe-as-clock, movement/physics, threat hierarchy, visual design (ASCII dithered fluid), procedural generation, progression stubs, tech stack, open questions.

### docs/project/
- **BUILD-PLAN.md** — NEW. 7-layer build plan (L0 Feel → L6 Ship). Scope ratchets. Pre-Monday prep checklist.

## 2026-03-20 (Jam Day 5: Sim Decoupling Design)

### docs/project/ — New Files
- **SIM-DECOUPLING-PLAN.md** — New architecture plan for splitting authoritative world simulation from the player executable. Defines the process split (Sim Core, Client Runtime, Field Adapter), argues against making the current WebGL fluid sim authoritative, proposes a coarse-field authoritative model with client-side visual reconstruction, recommends a 15 Hz sim tick, and maps the current code seams that must be cut first.

### docs/journal/ — Updated
- **DECISION-LOG.md** — Added sim/client decoupling decision. Gameplay truth moves toward a separate authoritative sim process; visual fluid stays client-side. First milestone is interface decoupling, not running a server.

### Why
Greg wants the world sim prepared for multiplayer and for future scale without tying server cost to render cost. Current architecture review showed the sim, fluid, AI, and rendering are still too entangled. This plan defines the first clean split: authoritative gameplay state and coarse flow truth on one side, high-frequency visual reconstruction on the client.

### src/ — New Files
- **sim/flow-field.js** — New gameplay-facing flow interface. Wraps the current fluid sim behind `sample(wx, wy)` / `sampleUV(u, v)` so movement code can stop asking the GPU texture for truth directly.
- **sim/sim-core.js** — New in-process authoritative world-step shell. Owns the fixed simulation block that used to live inline in `main.js`: fluid step, well/star updates, portal/planetoid/wreck/loot passes, combat, growth, wave propagation, and run timer progression.
- **sim/sim-state.js** — New plain-data run-state container for `growthTimer`, `runElapsedTime`, and `runEndTime`.

### src/ — Modified
- **main.js** — Wires in `FlowField`, `SimCore`, and `SimState`. The render loop still owns input/camera/HUD, but the world-step now crosses an explicit sim boundary. Title/gameplay UI now reads run timing from `simState` rather than ad hoc globals.
- **ship.js** — Ship movement now samples currents through `flowField.sample(wx, wy)` instead of reading the fluid texture directly. Wake injection still writes to visual fluid explicitly.
- **test-api.js** — `getFluidVelAt()` now routes through the gameplay-facing flow-field interface instead of reaching straight into the GPU fluid object.
- **scavengers.js** — Scavenger movement and routing now sample currents through `FlowField` instead of reading the GPU velocity texture directly.
- **loot.js / wrecks.js / portals.js** — Sim-owned updates no longer require camera position; render-time culling stays in the render path instead of leaking into the world step.
- **config.js** — Adds a `sim` block with `fixedHz` and `maxStepsPerFrame` so authoritative tick cadence has a real home.
- **sim/sim-core.js** — Now owns a fixed-step accumulator. The sim advances on its own cadence instead of piggybacking directly on the client frame loop.

### Why
This is the first real decoupling cut. The game still runs in one app, but the client loop is no longer the only owner of simulation truth, and the world update no longer depends on the camera. That makes the next steps possible: move the remaining systems behind `SimCore`, lower the authoritative tick without breaking the client loop, and eventually push the same boundary into a worker or server process without rewriting the whole game.

## 2026-03-20 (Jam Day 5: Dev Server and PID Discipline)

### scripts/ — New Files
- **scripts/static-server.js** — Shared static server for both human playtesting and harness runs. Serves `index-a.html` at `/` and writes pid/meta files when asked.
- **scripts/dev-server.js** — Canonical controller for the long-lived local dev server. Supports `start`, `stop`, `status`, and `restart`.

### tests/ — Modified
- **tests/helpers.js** — Harness now uses the same shared static server implementation on its own dedicated port (`8719`) and writes transient pid/meta files under `tmp/`.

### docs/ — Modified
- **docs/reference/DEV-SERVER.md** — Documents the current LBH process model and canonical ports.
- **docs/project/BACKLOG.md** — Adds explicit future work for a dedicated sim process, local client/server protocol, and headless sim harness.
- **docs/project/SIM-DECOUPLING-PLAN.md** — Adds the current vs future operational process model.
- **docs/design/AGENT-TESTING.md** — Stops telling agents to guess at ad hoc local servers.

### package.json / .gitignore
- Added `npm run dev`, `dev:stop`, `dev:status`, and `dev:restart`.
- Ignored `tmp/` runtime pid/meta files.

### Why
Claude and Codex were guessing at different local ports and different static server processes. LBH now has one canonical playtest server path and one separate transient harness path, which is the minimum operational discipline needed before a real sim/server PID exists.

## 2026-03-20 (Jam Day 5: Client Perf Triage)

### src/ — Modified
- **sim/sim-core.js** — Distance-based density dissipation now tracks only core field anchors (wells + stars) instead of every loot/wreck/portal/planetoid/ship/scavenger position.
- **wells.js** — Removes the accretion-ring splat storm from the sim update path. Wells now keep the actual force field plus the subtractive core signal; the renderer owns the bright accretion band analytically.
- **stars.js** — Removes rotating star ray splats from the sim path. The fluid layer keeps the core read; richer rays remain presentation-side.
- **fluid.js** — Display shader now gives wells an analytic ring-energy baseline from scene data, so readable black holes do not depend on dozens of live splats.

### docs/reference/ — New Files
- **PERF-ANALYSIS.md** — New perf note explaining why `3x3` holds while `5x5`/`10x10` collapse, where the full-screen pass budget was going, what cuts landed, and which levers remain (resolution, tick rate, solver budget).

### docs/project/ — Modified
- **BACKLOG.md** — Adds `Adaptive Sim Budgets by Map Scale` as explicit future work.

### Why
Large-map slowdown was not primarily a camera/frustum problem. The main bottleneck was per-entity full-screen splat work, especially wells and stars, multiplied by fixed 60 Hz sim stepping and the `512`-resolution deep-field map. This pass cuts the worst structural waste first and documents the next safe tuning levers.

## 2026-03-21 (Jam Day 6: Renderer Seam and Tile-Boundary Pass)

### src/ — Modified
- **fluid.js** — Display shader now wraps world-space sampling consistently before reading density, velocity, visual density, and fabric noise. GPU readback helpers also wrap UVs before converting them to pixels.
- **ascii-renderer.js** — ASCII post-process now anchors shimmer and directional velocity reads from wrapped fluid UVs instead of mixing wrapped sim data with unwrapped cell-space noise.
- **sim/flow-field.js** — Flow-field sampling now wraps at world edges instead of clamping, so client-side gameplay reads use the same toroidal topology as the GPU sim.
- **wells.js** — Wells stop writing subtractive visual density every fixed tick. The renderer keeps the well core analytically, which avoids large blocky dark slabs after ASCII quantization.

### Why
The sim was already toroidal, but the renderer and CPU readback path were not fully honoring the same wrap rules. That mismatch could show up as hard seams near world/tile boundaries. A second artifact came from subtractive well splats accumulating every tick, which made black holes flatten into rectangular dark regions once the ASCII pass quantized them. The fix was to make wrapping consistent end-to-end and let the renderer own the well silhouette directly.

## 2026-03-21 (Jam Day 6: Multi-Well Void Regression Fix)

### src/ — Modified
- **fluid.js** — Per-well scene shaping no longer reapplies the global `voidField` inside the well loop. The loop now only blackens each well's own core mask and uses `liveSpace` once as the ambient scene-level darkness term.

### Why
The first seam/topology fix accidentally exposed a second renderer bug on real gameplay maps: the shader was applying the already-computed global void field once per well. On title this mostly hid, but on multi-well maps it stacked the darkness repeatedly and made wells disappear into giant black regions. The fix keeps the global void term global and limits per-well darkening to each well's actual core.

## 2026-03-21 (Jam Day 6: Louder Gameplay Wells)

### src/ — Modified
- **wells.js** — Expands the renderer-facing ring geometry so gameplay wells read from farther out instead of collapsing to tiny hot centers.
- **fluid.js** — Raises accretion-band energy, halo lift, and surf-band contrast while keeping the core dark and the background restrained.

### Why
After the topology and multi-well fixes, gameplay wells were structurally correct but still too quiet. This pass makes them louder tactically — broader visible band, clearer outer read, same black core — without blowing the whole scene back out.

## 2026-03-21 (Jam Day 6: Honest Kill Edge)

### src/ — Modified
- **wells.js** — Visible core sizing now slightly exceeds the real gameplay kill radius instead of undershooting it.
- **fluid.js** — Adds a thin event-horizon rim around the core so low-mass wells still show a readable lethal boundary in motion.

### Why
The remaining gameplay failure was not topology anymore. It was honesty. The ship could still die inside a region that read too softly or too small, especially on smaller wells outside the title screen. This pass makes the visible dark core cover the actual kill zone and adds a narrow horizon rim so the player can see where the danger begins.

## 2026-03-25 (Week 2 Day 1: Review Fixes)

### src/ — Modified
- **wrecks.js** — Dropped-wreck drag now decays by elapsed time instead of by frame count, so ejection behavior stays consistent on slow maps.
- **main.js** — Escape now closes the inventory during play instead of pausing the run behind the panel.
- **test-api.js** — Exposes wreck inspection, test-wreck spawning, and direct pickup helpers so inventory tests can drive real item flows.

### tests/ — Modified
- **inventory.js** — Replaces two placeholder checks with actual wreck-loot validation and a real pickup-to-cargo test.

### Why
Today’s review surfaced two real gameplay bugs and one false-confidence problem. Dropped wrecks were drifting different distances at different frame rates, keyboard Escape did not actually perform the documented inventory-close action, and two inventory tests were claiming coverage they did not provide. This pass fixes the behavior and makes the test suite earn its green status.

## 2026-03-25 (Week 2 Day 1: Renderer Scale Coverage)

### src/ — Modified
- **maps/renderer-fixtures.js** — Adds a `5x5` single-well fixture and a `10x10` interference fixture so renderer captures cover large-map scaling, not just the 3x3 reference view.

### tests/ — Modified
- **renderer.js** — Expands the harness to capture both new fixtures and adds per-fixture FPS floors so large-map captures are judged on honest expectations.

### docs/ — Modified
- **reference/RENDERER-HARNESS.md** — Documents the larger-map fixtures and their purpose.

### Why
The recent shader and coordinate fixes were specifically about UV/world conversion, toroidal wrapping, and large-map behavior, but the renderer harness only exercised 3x3 scenes. This pass adds enough 5x5 and 10x10 coverage to catch scaling regressions before they hide behind a green test run.
