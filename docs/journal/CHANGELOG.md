# Changelog

> Human-readable version history of design docs.
> Git is authoritative. This is for quick scanning without `git log`.

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
