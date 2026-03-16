# Roadmap: Last Black Hole — Hour-by-Hour Game Jam Plan

> March 16-22, 2026. Code starts 12:01a Monday.
> This is the execution document. Agents build from this. Greg playtests against this.

---

## Key Constraints

- Vanilla JS, no framework, no TypeScript
- Single HTML file if possible
- WebGL fluid sim (PavelDoGreat fork as starting point)
- ASCII dithering post-process shader
- 4x4 screens with frustum rendering
- 60fps target on integrated GPUs
- Deploy to itch.io
- Physics approach TBD Tuesday AM — two parallel experiments run Monday night (Pillar 6: Run It Twice)
- Minimum shippable game: ship + fluid + wells + wrecks + one portal + Inhibitor
- Parallelize exploration, serialize adoption. Run many probes if agent capacity allows. Only one lane is the integration mainline. Probes promote into mainline if they clearly win, get backlogged immediately if they don't. See `BACKLOG.md`. (Forge Review #2)

## Dependency Graph

```
                    ┌─ ASCII Shader ─────────────┐
                    │                             │
Fluid Sim ──────── ┤                             ├── Entity Rendering ── Signal ── Inhibitor
(winner from       │                             │
 Tue AM review)    └─ Ship Controls ─────────────┘

                                                  HUD (independent, DOM-based)
                                                  Sound (independent, Web Audio)
                                                  Procgen text (independent, pure JS)
```

---

## Monday, March 16 — L0: The Feel

### Night Shift (Sun→Mon, 12:01am-10am) — FIRST AGENT SHIFT

**Goal:** Two parallel physics prototypes, each with a ship flying through fluid. Pillar 6: Run It Twice. Agent compute is cheap, design regret is expensive.

#### Monday Night Priority Ranking

If time collapses, this is the priority order: **N1a > N2 > N3 > N1b**. The mainline is: single-sim + live tuning + ASCII. N1b is a probe. (Forge Review #2)

Orb should pull these in priority order. N1a starts immediately. N2 and N3 can start as soon as N1a has a running FBO. N1b runs in parallel if a second agent is available. The test harness is pre-built — Corb just runs `node tests/run-all.js` after building.

#### Task N1a: Approach A — Single Fluid Sim + Oscillating Force Injection (Large, 3-5hr)
- **Lane:** `mainline`
- **What:** Fork PavelDoGreat WebGL-Fluid-Simulation into a single HTML file. Strip the demo UI. Get the sim running fullscreen on a canvas. Fake gravity waves via oscillating force injection from wells. Wire up ship controls. Expose test API.
- **Files:** `index-a.html`, `src/fluid.js`, `src/ship.js`, `src/wells.js`, `src/main.js`, `src/config.js`, `src/test-api.js`
- **Dependencies:** None — this is the foundation
- **Approach:** Navier-Stokes only. Waves are created by oscillating force injection amplitude at well locations: `source(t) = amplitude * sin(frequency * t)` applied as periodic radial pulses. Simpler, proven, shippable. (Forge's recommendation.)
- **Deliverables:**
  - Single HTML file opens in browser, fullscreen WebGL canvas
  - Fluid sim running at 60fps on a 256x256 grid (or 128x128 if 256 chokes)
  - One gravity well at map center injecting radial force: `F = G * mass / r^2` (clamped)
  - Fluid visibly drains toward the well, forming accretion-like patterns
  - Oscillating force injection from the well to fake gravity waves
  - Visible wave-like ripples propagating outward from the well through the fluid
  - Ship that reads fluid velocity and adds thrust (mouse-aim, click-to-thrust)
  - Ship rendered as clean vector geometry on a separate layer ABOVE the fluid (see VISUAL-SCALE.md). Ship thrust creates a visible wake disturbance in the fluid layer below.
  - Ship carried by currents when not thrusting, pulled toward well by inflow
  - Surfing a wave crest should feel like a speed boost
  - Tier 1 affordances implemented: wave magnetism (catch window + lock strength), thrust smoothing (facing lerp), input buffering (coyote time for wave catch). See MOVEMENT.md and BACKLOG.md affordance priority queue.
  - `CONFIG` object with all tunables (see TUNING.md for structure and CONTROLS.md for starting values)
  - `window.__TEST_API` exposed (see AGENT-TESTING.md for interface): getShipPos, getShipVel, getFluidVelAt, getFPS, getConfig, teleportShip, setTimeScale, setConfig
- **Acceptance Criteria:**
  - [ ] `index-a.html` loads in Chrome/Firefox without errors
  - [ ] Fluid sim renders colored density field
  - [ ] Gravity well creates visible inward flow
  - [ ] Oscillating pulses create visible outward-propagating ripples
  - [ ] Ship renders on a separate layer above the fluid (not embedded in the fluid texture)
  - [ ] Ship responds to fluid: drift, thrust, surf
  - [ ] Wave magnetism engages when ship is within catch window of a wave crest
  - [ ] Steady 60fps (check with `requestAnimationFrame` timestamp delta)
  - [ ] Console logs sim resolution and frame time
  - [ ] `CONFIG` object exists, all tunables are in it, systems read from it every frame
  - [ ] `window.__TEST_API` is accessible and returns valid data
  - [ ] Committed per CLAUDE.md rules (atomic commits per system)
- **Self-test before handoff:** Run `node tests/run-all.js` if N0 is complete. Otherwise manually verify all acceptance criteria and document in the commit.
- **Scope:** Large

#### Task N1b: Approach B — Dual Solver (Large, 3-5hr)
- **Lane:** `probe-a` — only if a parallel agent is available. Not mainline.
- **What:** Build a dual-solver physics prototype: Navier-Stokes for local fluid flow + wave equation solver for gravity wave propagation on separate grids, coupled together.
- **Files:** `index-b.html`, `src/fluid.js`, `src/waves.js`, `src/ship.js`, `src/wells.js`, `src/main.js`, `src/config.js`, `src/test-api.js`
- **Dependencies:** None — parallel track
- **Approach:** Two physics systems. Navier-Stokes handles local flow (advection, diffusion, pressure). Wave equation (`u(t+1) = 2*u(t) - u(t-1) + c^2*nabla^2*u(t) - damping*u(t)`) handles gravity wave propagation. Wave amplitude feeds into the fluid sim as a force multiplier — where waves crest, fluid velocity increases. Physically accurate surfing. Research-level complexity.
- **Deliverables:**
  - Single HTML file opens in browser, fullscreen WebGL canvas
  - Navier-Stokes fluid sim running on a 256x256 grid (or 128x128)
  - Wave equation solver running on a separate grid, coupled to fluid sim
  - One gravity well generating periodic perturbations into the wave solver
  - Wave amplitude visibly feeds back into fluid velocity
  - Surfable wavefronts propagating outward from the well
  - Ship that reads fluid velocity and adds thrust (mouse-aim, click-to-thrust)
  - Ship rendered on separate layer above fluid (same pattern as N1a)
  - Ship carried by currents when not thrusting, surfable wave crests
  - Same Tier 1 affordances, `CONFIG` object, and `__TEST_API` as N1a
- **Acceptance Criteria:**
  - [ ] `index-b.html` loads in Chrome/Firefox without errors
  - [ ] Fluid sim renders colored density field
  - [ ] Wave equation produces visible propagating wavefronts
  - [ ] Waves visibly affect fluid velocity (coupling works)
  - [ ] Ship renders on separate layer above fluid
  - [ ] Ship responds to fluid: drift, thrust, surf
  - [ ] Steady 60fps — if not achievable, note the perf cost
  - [ ] Console logs sim resolution, wave grid resolution, and frame time
  - [ ] `CONFIG` and `__TEST_API` match N1a interface
  - [ ] Committed per CLAUDE.md rules
- **Decision rule:** If Approach B is not clearly better in feel by Tuesday 10am, backlog it immediately. See `BACKLOG.md`. (Forge Review #2)
- **Scope:** Large

#### Task N2: Dev Panel (Small, 1-2hr)
- **Lane:** `support` — starts as soon as N1a has a running prototype
- **What:** Floating dev panel with sliders bound to the CONFIG object. Monday version is minimal: sliders + debug toggles + copy config + reset. No presets, no localStorage. (Forge Review #2)
- **Files:** `src/dev-panel.js` (or inline in prototype HTML)
- **Dependencies:** N1a (or N1b) running with CONFIG object
- **Deliverables:**
  - Floating DOM panel, toggle with backtick (`` ` ``), top-right corner, collapsible
  - Sliders grouped by system: Ship, Fluid, Wells, Affordances, ASCII, Debug
  - L0 sliders (see TUNING.md for full list): thrust, fluid coupling, turn rate, turn curve, drag, mass, viscosity, gravity strength/falloff, wave amplitude/frequency, catch window, lock strength, shoulder width, ASCII cell size, color temperature
  - Debug toggles: velocity field overlay, well radii visualization, catch window highlight, FPS counter
  - "Copy Config" button → dumps CONFIG as JSON to clipboard
  - "Reset" button → restores defaults
  - Changes apply instantly — no reload required
- **Acceptance Criteria:**
  - [ ] Panel toggles with backtick key
  - [ ] All L0 tunables have sliders with labeled ranges
  - [ ] Dragging a slider changes the game feel immediately (no reload)
  - [ ] "Copy Config" produces valid JSON of current settings
  - [ ] "Reset" restores all values to code defaults
  - [ ] Panel doesn't obscure critical game area (collapsible, semi-transparent)
  - [ ] Panel works in both prototype HTML files
- **NOT Monday:** presets, localStorage, fancy grouping. Those are Tuesday+ if they come cheap.
- **Scope:** Small (but critical)

#### Task N3: ASCII Dithering Post-Process (Medium, 2-3hr)
- **Lane:** `signature-visual` — starts as soon as either prototype has a working FBO
- **What:** The signature visual. Render fluid to FBO, post-process into ASCII characters. Implement the layered rendering pipeline (see VISUAL-SCALE.md, DESIGN-DEEP-DIVE.md).
- **Files:** `src/ascii-renderer.js`, font atlas generation code
- **Dependencies:** N1a or N1b (fluid renders to FBO). Can start as soon as either prototype has a working render target. Should be portable between both.
- **Deliverables:**
  - Font atlas texture generated at init: rasterize density ramp characters (`. : ; = + * # % @ █`) onto a 1024x1024 canvas, upload as GPU texture
  - Post-process shader: divide screen into character cells (~8x12px each), sample fluid density per cell, look up character from atlas by luminance, tint with sampled color
  - Color mapping: cold void = deep blue, warm radiation near well = amber/red, neutral = teal
  - Layered rendering pipeline:
    - Layer 0: ASCII substrate renders the fluid
    - Layer 1: Entity overlay renders ship (and later wrecks/portals) as clean geometry above ASCII
    - Layer 2: VFX overlay for thrust trail, shockwaves (additive blend)
    - Layer 3: HUD (DOM, handled separately)
  - Ship is always readable against the ASCII background — the layer separation ensures this
  - The fluid world should look like a flowing field of colored ASCII characters
  - ASCII cell size and color temperature added as CONFIG tunables (dev panel can adjust)
- **Acceptance Criteria:**
  - [ ] Screen shows ASCII characters, not smooth fluid gradients
  - [ ] Character density visually tracks fluid density (dense flow = heavy chars, vacuum = sparse)
  - [ ] Colors shift from blue (void) through teal to amber/red (near well)
  - [ ] Ship is clearly visible on Layer 1 against ASCII Layer 0 background
  - [ ] Character grid is readable (not a blurry mess)
  - [ ] 60fps maintained with the ASCII post-process pass added
  - [ ] ASCII cell size is tunable via CONFIG (dev panel can adjust if N2 is done)
  - [ ] Looks distinctly different from any existing browser game
- **Scope:** Medium

#### Test Harness (PRE-BUILT — not a Corb task)

The test harness is already in the repo. Corb just runs it after building.

```
npm install                              # first time only (installs puppeteer)
node tests/run-all.js index-a.html       # run all tests against Approach A
node tests/run-all.js index-b.html       # or against Approach B
node tests/smoke.js index-a.html         # smoke only
node tests/physics.js index-a.html       # physics only
```

**Smoke tests** (~10s): page loads, canvas exists, WebGL context, no JS errors, CONFIG exists, FPS above 30.

**Physics tests** (~30s): ship moves on thrust, ship drifts when thrust stops, well pulls ship toward it, fluid velocity oscillates (waves exist). Requires `window.__TEST_API`.

Tests will gracefully skip physics checks if `__TEST_API` isn't exposed yet. Smoke tests work even without the test API.

**Tests grow with the game** — new test files (gameloop.js, signal.js, etc.) get added as features land. See AGENT-TESTING.md for the full progressive plan.

#### Night Report
- Agent writes `docs/journal/reports/2026-03-16-night.md` — MUST include: comparative notes on both prototypes (feel, performance, surfability, visual quality, implementation complexity) AND test pass/fail summary.

---

### Morning Review (10am) — PHYSICS COMPARISON + MERGE DECISION

Greg checks:
1. `git log --oneline --since="midnight"` — what shipped
2. Open BOTH `index-a.html` and `index-b.html` in browser. Play each for 10+ minutes.
3. Read the night report's comparative notes.
4. **THE COMPARISON:**
   - Which feels better to surf? Which produces better wave patterns?
   - Which runs at 60fps more comfortably? What's the perf overhead of the dual solver?
   - Does the dual solver's physical accuracy produce a noticeably different (better?) feel, or does the single sim's force injection fake it well enough?
   - Could the wave equation be layered onto the single sim later, or are the architectures incompatible?
5. **THE DECISION (one of three outcomes):**
   - **Pick A:** Single sim wins. Rename `index-a.html` to `index.html`, archive Approach B. Proceed with proven path.
   - **Pick B:** Dual solver wins. Rename `index-b.html` to `index.html`, archive Approach A. Accept the complexity.
   - **Merge:** Both have value. Integrate the wave equation as an optional layer on top of the single sim. Spec the merge as a Day Shift task.
6. All downstream work builds on whichever approach wins this review.

**If both feel wrong:** Choose Approach A anyway (simpler). Cut all new feature work Tuesday. Spend the day only on movement tuning, wave readability, and well danger. Do not proceed to L1 until the movement fantasy is alive. A jam can survive a lost day. It cannot survive building five layers on bad movement. (Forge Review #2)

### Day Shift (10am-midnight)

**Greg priorities (in order):**
1. **Tune the winning prototype using the dev panel.** Open the panel (`` ` ``), play for 30+ minutes, adjust sliders live. Focus on: does surfing feel like surfing? Is thrust responsive? Are wells dangerous but escapable? When something feels right, "Copy Config" and commit.
2. **If "Merge" was chosen:** spec and oversee the merge — integrate the wave equation layer into the winning sim. This is the Day Shift's top agent task.
3. **Art-direct the ASCII shader via dev panel.** Cell size slider, color temperature, character density ramp. Iterate live — this is the visual identity.
4. **Test mouse control models.** The dev panel should include a dropdown for mouse model (distance-thrust vs binary-click vs drag-magnet). Play each for 10 minutes. See CONTROLS.md.
5. **Confirm the wave feel.** Is it good enough to proceed to L1 Tuesday, or does the physics need more work?
6. **If ahead:** Add 2-3 gravity wells and see how wave interference feels. Add directional character variants (horizontal flow = `~ -`, vertical = `| !`).

**Parallel agent work (while Greg tunes):**
- **Sandbox mode:** Pause/resume sim, click-to-teleport ship, click-to-spawn-well, drag-to-move-well, slow motion (0.25x-2x), wave visualizer overlay. See TUNING.md Mode 2. This lets Greg test specific situations without playing full runs.
- Stub out the game state module: entity data structures for wrecks, portals, ship state, signal level. Plain data objects, no rendering yet. This is the "clean data boundary" that makes everything else composable.
- Stub the HUD as DOM elements over the canvas: signal meter placeholder, portal count placeholder, hull bar placeholder. No real data yet — just the layout. Use NERV-style colors (`#58F2A5` green, `#F0903A` orange, `#E81900` red). Monospace font for data, bold serif for warnings.

### Evening Handoff (midnight)

Greg writes the Mon→Tue night prompt:
- **If feel is good:** Spec L1 tasks: wrecks, portals, extraction, black hole growth. Include Greg's tuning notes from the day.
- **If feel needs work:** Spec specific physics tuning: what to change, what to try, what "good" looks like. Hold L1.
- Commit any constant changes and design notes from the day.
- Archive the losing prototype (if one was picked) with a commit message documenting why.

### Scope Ratchet (end of Monday)

| Status | Action |
|--------|--------|
| **Ahead** (both prototypes done + feel confirmed good + winner chosen) | Add multi-well, directional ASCII chars, feedback buffer (motion trails) |
| **On track** (both prototypes working, comparison done, winner chosen, feel promising) | Stay the course. Proceed to L1. |
| **Behind** (only one prototype working, or ASCII not in yet) | ASCII is critical — it IS the product. Night shift finishes ASCII before starting L1. Use whichever prototype works. |
| **Crisis** (neither fluid sim working) | All hands on fluid. Nothing else matters until the sim runs and feels good. |

---

## Tuesday, March 17 — L1: The Stakes

### Night Shift (Mon→Tue, midnight-10am)

**Goal:** The core extraction loop exists. Wrecks to loot, portals to escape through, a universe that's dying around you. All work builds on the physics approach chosen in Tuesday AM review (now consolidated into `index.html`).

#### Task N4: Wrecks + Loot Pickup (Medium, 2-3hr)
- **What:** Static wreck objects in the world. Fly near to loot.
- **Files:** `index.html` (entity system, wreck rendering)
- **Dependencies:** Ship controls from winning physics prototype (chosen Tue AM)
- **Deliverables:**
  - 10-15 wrecks spawned at init, placed in clusters between gravity wells (not inside danger radius)
  - Wrecks rendered as dense ASCII character clusters (gold/amber `#D4A843`, distinct from fluid colors)
  - Wrecks act as obstacles in the fluid sim — deflect flow, create eddies and sheltered zones (boundary conditions in pressure solve)
  - Fly-over pickup: when ship center is within N pixels of wreck center, auto-loot. Wreck dims to gray `#555555`.
  - Inventory: simple array of collected items. Each wreck yields 1-3 items with generated names.
  - Wreck tiers: 60% surface (safe zones, low value), 30% deep (closer to wells), 10% core (near well danger zone, high value)
- **Acceptance Criteria:**
  - [ ] Wrecks visible as gold ASCII clusters, clearly distinct from fluid
  - [ ] Flying near a wreck triggers loot pickup (visual + console feedback)
  - [ ] Looted wrecks change to dim gray
  - [ ] Wrecks deflect fluid flow (visible eddies behind them)
  - [ ] Sheltered zone behind a wreck is calm relative to surrounding current
  - [ ] Inventory tracks collected items
  - [ ] Core wrecks near wells are visibly riskier to reach
  - [ ] 60fps maintained
- **Scope:** Medium

#### Task N5: Portals + Extraction (Medium, 2-3hr)
- **What:** Extraction points. Fly to a portal to escape with your loot. Portals evaporate over time.
- **Files:** `index.html` (portal entity, extraction logic, run end state)
- **Dependencies:** Ship controls from winning physics prototype (chosen Tue AM)
- **Deliverables:**
  - 3-5 portals spawned at map edges/midpoints, never within 30% radius of a well
  - Portal rendering: pulsing cyan-green (`#58F2A5`) ring of ASCII characters, size oscillates every 2-3 seconds
  - Portals act as fluid sinks — visible vortex pattern in ASCII around active portals
  - Portal evaporation: portals blink out over time at semi-random intervals (first at ~2min, accelerating). When a portal dies: sink disappears, fluid rebounds outward (visible shockwave), portal count decrements.
  - Extraction: fly into portal center → run ends → success screen showing inventory collected
  - Death: all portals gone = death. Show failure screen with "universe collapsed" message.
  - Run start → run end is a complete loop. Player can restart.
- **Acceptance Criteria:**
  - [ ] Portals visible as pulsing cyan-green rings
  - [ ] Portal count visible (even if just console — HUD wires later)
  - [ ] Portals evaporate over time, with visible shockwave on death
  - [ ] Entering a portal ends the run with success
  - [ ] Losing all portals ends the run with failure
  - [ ] Player can restart a new run from the end screen
  - [ ] Fluid visibly swirls around portal locations (sink effect)
  - [ ] 60fps maintained
- **Scope:** Medium

#### Task N6: Black Hole Growth + Universe Clock (Medium, 1-2hr)
- **What:** The universe dying is the timer. Wells grow, space shrinks, viscosity increases.
- **Files:** `index.html` (well growth logic, viscosity ramp)
- **Dependencies:** Fluid sim (winning approach from Tue AM review)
- **Deliverables:**
  - Black hole mass increases over time (~1% per 10 seconds). Force injection scales with mass.
  - Playable space visibly shrinks as wells pull harder
  - Wave amplitude grows with well mass (bigger waves late-game) — implementation depends on winning physics approach (force injection amplitude for Approach A, wave equation source amplitude for Approach B/Merge)
  - Viscosity increases over the run (+5%/min). Late-game movement feels heavier, sluggish.
  - Optional: wave frequency decreases with mass (slower, more powerful waves)
- **Acceptance Criteria:**
  - [ ] Wells are noticeably stronger at 4 min than at start
  - [ ] At 8 min, navigating near wells is significantly harder
  - [ ] Fluid feels thicker/sluggish in late game (viscosity increase perceptible)
  - [ ] Waves are larger and more dramatic late-game
  - [ ] A run naturally becomes "impossible" at ~10 min if player hasn't extracted
  - [ ] 60fps maintained (growth doesn't change computational cost)
- **Scope:** Medium

#### Night Report
- Agent writes `docs/journal/reports/2026-03-17-night.md`

---

### Morning Review (10am)

Greg checks:
1. Play a full run start-to-finish. Time it.
2. **THE QUESTION:** Does the push-your-luck tension work? Do you feel the pull between "one more wreck" and "portal's about to go"?
3. Is the universe dying legible? Can you feel the viscosity change? The wells growing?
4. Are wrecks interesting as terrain (eddies, shelter) or just loot piñatas?
5. Is extraction satisfying or anticlimactic?

### Day Shift (10am-midnight)

**Greg priorities:**
1. **Play 3-5 complete runs using dev panel to tune extraction feel.** New L1 sliders: wreck count, loot radius, approach cone, decel assist, portal count, evap timing, well growth rate, viscosity curve. Tune live, "Copy Config" when it feels right.
2. **Use sandbox mode** to test specific interactions: place ship near a wreck and tune approach stickiness. Place ship near portal and tune alignment magnetism. Drag wells closer together to test late-game feel without playing for 8 minutes.
3. **Art-direct wreck appearance.** Do they read as "dead civilizations"? Is the loot feedback satisfying?
4. **Wire up real HUD data.** The DOM stubs from Monday's parallel work should now show real signal (placeholder), portal count, and inventory. Spend 30 min making this feel EVA/NERV.
5. **Write wreck name generator.** Pure JS string generation: civilization name + death cause + age. `"Wreck of the Ascending Chorus — collapsed attempting dimensional transit — 4.7B years"`. This is independent work Greg can do while the loop gestates.

**Parallel agent work:**
- **Add L1 sliders to dev panel** — wreck, portal, and universe tunables (see TUNING.md Tuesday section)
- Wreck-as-fluid-obstacle polish: ensure eddies form cleanly behind wrecks, tune boundary condition implementation
- Add second and third gravity wells. Place them at 40-70% map radius. Test wave interference patterns. Tune force injection (or wave equation sources, depending on winning approach) so the multi-well flow field creates interesting navigation decisions.
- If HUD stubs exist: wire real data into them (portal count, inventory count, placeholder signal bar)
- **If Monday's controller decision went "yes":** Add Gamepad API support (basic: stick aim + trigger thrust, no haptics yet). See CONTROLS.md.

### Evening Handoff (midnight)

Greg specs Tue→Wed night shift:
- Signal mechanic implementation
- Inhibitor (if the core loop is solid — skip directly to the main threat per Forge's ladder)
- Include tuning notes: what run length felt right, what constants work

### Scope Ratchet (end of Tuesday)

| Status | Action |
|--------|--------|
| **Ahead** (extraction loop tight + multi-well working) | Pull signal implementation into tonight's agent work. Start audio stubs. |
| **On track** (extraction loop works, needs tuning) | Proceed. Signal is Wed core. |
| **Behind** (portals or wrecks not working) | Night shift finishes L1 before touching signal. Cut portal evaporation animation if needed — just make them disappear. |
| **Crisis** (fluid feel still not right) | Freeze features. All time goes to feel. L1 can be minimal: one wreck, one portal, instant extraction. |

---

## Wednesday, March 18 — L2: Signal + Threat Foundation

### Night Shift (Tue→Wed, midnight-10am)

**Goal:** Signal as consequence. Plus the Inhibitor — the one threat that matters.

#### Task N7: Signal System (Medium, 2-3hr)
- **What:** Every action emits signal. Signal attracts consequences. This is the core risk/reward dial.
- **Files:** `index.html` (signal module, ship signal tracking, HUD signal display)
- **Dependencies:** Ship controls, wreck looting (Tasks N1a/N1b winner, N4)
- **Deliverables:**
  - Global signal level tracked as 0-100% float
  - Signal sources:
    - Thrusting: +1-2%/sec while holding thrust
    - Thrusting against current: +3-4%/sec (velocity dot product check)
    - Looting a wreck: +10-15% spike (surface), +20-25% (deep), +35-40% (core)
    - Collision with anything: +5% spike
  - Signal decay: exponential, ~3%/sec when silent/drifting. Faster in wreck wakes (masked).
  - Surfing (riding wave in flow direction) generates minimal signal — reward for skilled movement.
  - Signal tiers displayed in HUD: GHOST (0-15%), WHISPER (15-35%), PRESENCE (35-55%), BEACON (55-75%), FLARE (75-90%), THRESHOLD (90-100%)
  - Visual feedback: ship thruster trail brightens with signal. At BEACON+: subtle halo around ship. ASCII cells near ship shift warmer at high signal.
  - HUD signal bar with color transitions: green → orange → red
- **Acceptance Criteria:**
  - [ ] Signal level visible in HUD, updates in real-time
  - [ ] Thrusting raises signal, drifting drops it
  - [ ] Looting causes visible signal spike
  - [ ] Signal decays to near-zero in ~5-10 seconds of silent drifting
  - [ ] Signal tier name displayed (GHOST, WHISPER, etc.)
  - [ ] Visual feedback on ship scales with signal level
  - [ ] Surfing with current generates less signal than thrusting against current
  - [ ] 60fps maintained
- **Scope:** Medium

#### Task N8: Inhibitor (Large, 3-5hr)
- **What:** The existential threat. Cross the signal threshold, it wakes, it hunts, it kills.
- **Files:** `index.html` (Inhibitor entity, hunting AI, visual corruption, death trigger)
- **Dependencies:** Signal system (Task N7)
- **Deliverables:**
  - Signal threshold at ~90% (exact value hidden from player, randomized ±10% per run)
  - Crossing threshold: 5-second warning. HUD distortion starts — flicker, false readings, visual noise increases. Warning text: `INHIBITOR ACTIVE` in red.
  - Inhibitor spawns at map edge farthest from player
  - Appearance: glitch characters, wrong Unicode (`Ψ Ω ∞ ⌁`), magenta `#FF2D7B`, flickering/unstable. Visually alien — does not belong in this universe's physics.
  - Movement: straight-line toward player's last known signal position. Speed = 1.5x player max thrust. Ignores fluid physics entirely (no drag, no current effect). Updates target position every 3 seconds based on accumulated signal.
  - Contact = instant death. No negotiation. Run ends with a distinct death screen.
  - Countermeasure: stop thrusting, drift silently. If signal drops near-zero for 5+ seconds, Inhibitor pauses and searches in a pattern around last known position. It never leaves.
  - UI corruption when Inhibitor is near: ASCII character substitution rate jumps to 15-20%. HUD panels jitter 1-3px. Random color bleeds. Increasing as Inhibitor gets closer.
  - Near a wreck: signal partially masked (wreck's residual signature provides cover)
  - In well's accretion disk: signal masked by well radiation (but you're in a death spiral)
- **Acceptance Criteria:**
  - [ ] Inhibitor does not appear until signal crosses threshold
  - [ ] 5-second audio/visual warning before spawn
  - [ ] Inhibitor visually distinct — glitch chars, magenta, alien motion
  - [ ] Inhibitor moves toward player, faster than player can thrust
  - [ ] Inhibitor ignores fluid (moves in straight lines through currents)
  - [ ] Contact = instant death, distinct game-over screen
  - [ ] Drifting silently for 5+ sec causes Inhibitor to lose track and search
  - [ ] Hiding near a wreck reduces signal (Inhibitor tracks less accurately)
  - [ ] UI corruption scales with Inhibitor proximity
  - [ ] The Inhibitor is terrifying (subjective — Greg validates at morning review)
  - [ ] 60fps maintained (Inhibitor is one entity, should be negligible)
- **Scope:** Large

#### Night Report
- Agent writes `docs/journal/reports/2026-03-18-night.md`

---

### Morning Review (10am)

Greg checks:
1. Play a run deliberately going loud. Does signal ratchet feel right?
2. Cross the threshold on purpose. **THE QUESTION:** Is the Inhibitor terrifying? Does the 5-second warning create dread? Does the hunt change how you play?
3. Play a run trying to stay quiet. Is it boring or tense? (Forge's concern: "do less" failure mode)
4. Does the signal-as-tax model work? Are there enough reasons to take loud actions? If tiptoeing feels optimal, Forge may be right about signal needing upside.
5. Try hiding near a wreck while the Inhibitor searches. Does the stealth mechanic feel skill-based?

### Day Shift (10am-midnight)

**Greg priorities:**
1. **Playtest signal using dev panel + scenario snapshots.** New L2 sliders: signal emission rates, decay curve, loot spikes, threshold, variance, Inhibitor speed/tracking. Save scenarios: "pre-threshold" (signal at 80%), "chase" (Inhibitor hunting), "silent hide" (drifting near wreck). Replay scenarios with different tuning to A/B the feel.
2. **Playtest the Inhibitor.** Use sandbox to spawn the Inhibitor manually at different distances. Tune speed, tracking interval, search pattern. It should feel inevitable but not instant. The 1.5x speed ratio is a starting point — adjust via slider.
3. **If signal works:** Write DECISION-LOG entry confirming signal-as-tax or pivoting to signal-buys-capability. This decision gates Thursday's work.
4. **Art-direct Inhibitor appearance.** Is the glitch effect readable? Too subtle? Too over-the-top? Tune UI corruption rate via dev panel slider.

**Parallel agent work:**
- **Add L2 sliders to dev panel** — signal, Inhibitor tunables (see TUNING.md Wednesday section)
- **Scenario snapshot system** (TUNING.md Mode 3): save/load game state, named scenarios for rapid A/B testing of signal balance
- Basic audio: Web Audio API drone layer + thrust sound + loot chime + Inhibitor warning tone. See MUSIC.md Layer 1 (drone) and Layer 5 (Inhibitor presence). Even placeholder audio massively improves feel testing.
- Wreck name/history generator: civilization name + death cause + age + one visual differentiator (per Forge's "one memorable detail" recommendation). Show on loot pickup in HUD.

### Evening Handoff (midnight)

Greg specs Wed→Thu work based on signal playtest results:
- If signal works as-is: spec HUD polish + visual effects + audio deepening
- If signal needs upside: spec the chosen upside mechanic (e.g., high signal reveals nearby wreck locations)
- If Inhibitor needs tuning: spec exact parameter changes

### Scope Ratchet (end of Wednesday)

| Status | Action |
|--------|--------|
| **Ahead** (signal + Inhibitor both land clean) | Add fauna (Signal Moths — attracted by signal, amplify your footprint). Add force pulse as panic button. Start audio Layers 2-3. |
| **On track** (signal works, Inhibitor needs tuning) | Night shift tunes Inhibitor. Push fauna to stretch. |
| **Behind** (signal feels off) | All hands on signal tuning. Inhibitor can ship with rough values. Cut fauna entirely. |
| **Crisis** (extraction loop still broken) | Signal goes to WHISPER/THRESHOLD only (binary). Inhibitor simplified to fixed-timer spawn. All effort on making wrecks + portals + wells feel right. |

---

## Thursday, March 19 — L3/L4: Polish the Core

### Night Shift (Wed→Thu, midnight-10am)

**Goal:** HUD, visual juice, and audio bring the game to life. Everything up to this point is gameplay-first. Now we add the look and sound.

#### Task N9: NERV/EVA HUD (Medium, 2-3hr)
- **What:** Full heads-up display. DOM over canvas. The contrast between messy ASCII spacetime and crisp UI IS the aesthetic.
- **Files:** `index.html` (HUD HTML/CSS section)
- **Dependencies:** Signal system, portal system, inventory (Tasks N7, N5, N4)
- **Deliverables:**
  - DOM overlay with `z-index` above canvas
  - Corner panels (small footprint, semi-transparent dark background):
    - Top-left: Signal meter (bar + percentage + tier name + trend arrow)
    - Top-right: Portal status (count + nearest direction indicator + distance)
    - Bottom-left: Hull integrity bar (placeholder 100% for now — no damage system yet unless Inhibitor contact added)
    - Bottom-right: Inventory (count + collapsible item list with wreck names)
  - Center warnings (transient, attention-grabbing):
    - Fade in 0.3s, hold 2-3s, fade out
    - Stack if multiple
    - `SIGNAL DETECTED` (orange) at PRESENCE tier
    - `PORTAL EVAPORATING` (red) when a portal dies
    - `INHIBITOR ACTIVE` (red, with HUD scan-line distortion)
    - `WRECK SCANNED` (green) on loot pickup
    - `EXTRACTION AVAILABLE` (cyan) near a portal
  - Fonts: `Chakra Petch` or `Orbitron` for headers/warnings, `JetBrains Mono` for data. Load from Google Fonts or inline.
  - Color scheme: background `#000053`/black, nominal `#58F2A5`, warning `#F0903A`, critical `#E81900`, data `#54A2D4`
  - CRT/scan-line effect via CSS on the HUD container (`mix-blend-mode`, subtle scan lines)
  - HUD degradation: when Inhibitor active, panels jitter position (CSS transform), false readings flash, color bleeds between panels
- **Acceptance Criteria:**
  - [ ] All four corner panels display real-time data
  - [ ] Signal bar animates smoothly, color transitions at tier boundaries
  - [ ] Warning messages appear at correct triggers
  - [ ] Warnings stack and don't overlap illegibly
  - [ ] HUD does not obscure critical gameplay area (panels are compact)
  - [ ] HUD degrades visually when Inhibitor is active
  - [ ] CRT/scan-line effect is subtle, not distracting
  - [ ] Fonts load and render crisply
  - [ ] HUD updates don't affect canvas framerate (DOM updates are cheap but verify)
  - [ ] 60fps maintained
- **Scope:** Medium

#### Task N10: Visual Juice Pass (Medium, 2-3hr)
- **What:** Ship trail, entity glow/halos, screen shake, color refinement. One killer visual move (ASCII over fluid) is done — this is the polish.
- **Files:** `index.html` (shader tweaks, entity rendering, camera shake)
- **Dependencies:** ASCII shader, entity rendering (Tasks N3, N4, N5)
- **Deliverables:**
  - Ship thruster trail: particles or fading ASCII characters behind ship when thrusting, length/brightness scales with signal
  - Entity halos: 2-3 cell glow around wrecks (gold), portals (cyan), Inhibitor (magenta) at low opacity
  - Local dimming: ASCII cells within N cells of an entity reduce to 30-50% brightness for readability
  - Screen shake: on portal evaporation (medium, 0.5s), Inhibitor spawn (large, slow, 1s), well merger if implemented (large, 1s)
  - Color refinement: ensure entity colors never conflict with fluid zone colors (no amber wrecks lost in amber radiation — radiation is red-orange, wrecks are gold)
  - Portal death animation: shockwave of bright characters expanding outward for 0.5s
  - Black hole visual: absence in center (empty/sparse chars), dense bright ring around it
- **Acceptance Criteria:**
  - [ ] Ship trail visible when thrusting, fades when drifting
  - [ ] Entities "pop" against fluid background (halos + local dimming)
  - [ ] Screen shake fires on correct triggers, feels impactful not nauseating
  - [ ] Portal death is a visible, dramatic moment
  - [ ] Black holes look like black holes (void center, bright ring)
  - [ ] No color confusion between entity types and fluid zones
  - [ ] 60fps maintained with all visual effects active
- **Scope:** Medium

#### Task N11: Audio Foundation (Medium, 2-3hr)
- **What:** Web Audio API soundscape. The universe should be audible.
- **Files:** `index.html` (audio module)
- **Dependencies:** Fluid sim state, signal level, Inhibitor state (reads game data, doesn't modify it)
- **Deliverables:**
  - Layer 1: Drone — low oscillator (~60Hz sine), pitch drops with viscosity increase. Always on after first user interaction.
  - Layer 2: Gravity harmonics — one oscillator per well, pitch proportional to mass, stereo-panned by position relative to player
  - Layer 3: Wave rhythm — filtered noise, amplitude-modulated by wave height at player position. Swell and ebb.
  - Layer 4: Signal choir — 3-5 detuned sine oscillators, volume proportional to signal level. Ethereal at low signal, dense/claustrophobic at high.
  - Layer 5: Inhibitor tone — ring-modulated drone with wrong-frequency carrier (drone * sqrt(2)). Fades in on Inhibitor spawn. Louder as Inhibitor approaches.
  - Event sounds (Web Audio synthesis, no samples):
    - Thrust: filtered noise burst
    - Loot pickup: ascending crystalline chime (3 notes)
    - Portal evaporation: descending glissando + static
    - Inhibitor warning: rising sinusoidal alarm (5-sec warning)
    - Extraction: ascending harmonic series resolving to major chord
    - Death: all layers pitch-shift down, distort, cut to silence
  - Audio gated behind first click (browser autoplay policy)
- **Acceptance Criteria:**
  - [ ] Drone plays continuously after first interaction
  - [ ] Well harmonics audible, stereo-positioned correctly
  - [ ] Signal choir volume tracks signal level
  - [ ] Inhibitor tone is unsettling and distinct
  - [ ] Event sounds fire on correct triggers
  - [ ] Extraction and death sounds feel emotionally distinct
  - [ ] Audio does not cause frame drops (Web Audio runs on separate thread, but verify)
  - [ ] Volume levels balanced (no one layer drowning others)
- **Scope:** Medium

#### Night Report
- Agent writes `docs/journal/reports/2026-03-19-night.md`

---

### Morning Review (10am)

Greg checks:
1. Play with audio. **THE QUESTION:** Does the soundscape make the game feel deeper? Can you hear the waves, the wells, the danger?
2. HUD: does it feel EVA/NERV? Is it too much screen real estate? Too little info?
3. Visual juice: do entities read clearly? Is the ship trail satisfying?
4. Play a full run with all systems. How does it feel as a complete experience?

### Day Shift (10am-midnight)

**Greg priorities:**
1. **Full playtest session with all dev tools.** This is the first time the game has all its core systems. Play 5-10 runs. Use the full dev panel (now 50+ sliders across all systems). Use scenario snapshots to A/B specific moments.
2. **Art-direct the HUD via dev panel.** New sliders: panel opacity, warning hold time, corruption intensity, font sizes. The HUD should feel alive — tune the degradation rate when Inhibitor is active.
3. **Audio mixing via dev panel.** New sliders: master volume, per-layer volumes (drone, harmonics, signal choir, Inhibitor). Make sure the wave rhythm teaches surfing (can you hear the crest?). Make sure the Inhibitor tone creates dread.
4. **Make the design call on signal.** After playing many runs: is signal-as-tax working? Write the definitive DECISION-LOG entry. If it needs upside, spec exactly what.
5. **Name the Inhibitor.** "The Silence"? "The Threshold"? "The Warden"? Decision needed for HUD text.

**Parallel agent work:**
- **Add L3/L4 sliders to dev panel** — HUD, audio, visual tunables (see TUNING.md Thursday section)
- Between-run flow: title screen → run → success/failure → title screen. Simple but complete.
- Procgen wreck names displayed in HUD on loot pickup
- If ahead: feedback buffer (motion trails) — blend previous frame's ASCII output with current at 85-95% decay
- **If controller is in:** Add Gamepad API rumble (basic vibration via `navigator.getGamepads()` haptic actuators). Map wave crests, well proximity, Inhibitor to vibration patterns. See CONTROLS.md HD haptics section.

### Evening Handoff (midnight)

Greg specs Thu→Fri work:
- Balance pass priorities
- Any remaining visual/audio polish
- Between-run progression (if on track) or cut list (if behind)

### Scope Ratchet (end of Thursday)

| Status | Action |
|--------|--------|
| **Ahead** (HUD + audio + visuals all land, game feels complete) | Add fauna (Signal Moths). Add force pulse. Feedback buffer. Start between-run progression. |
| **On track** (most systems in, needs tuning) | Friday is tuning + balance. No new systems. |
| **Behind** (audio or HUD incomplete) | Cut audio to drone + 2 event sounds. Simplify HUD to signal bar + portal count only. No visual juice beyond what's in. |
| **Crisis** (core loop still has issues) | Cut HUD to minimal. Cut audio entirely. All effort on making the game loop fun. Ship a game, not a tech demo. |

---

## Friday, March 20 — L4/L5: Depth + Balance

### Night Shift (Thu→Fri, midnight-10am)

**Goal:** Between-run progression, procedural identity, balance pass. Make it replayable.

#### Task N12: Between-Run Progression (Medium, 2-3hr)
- **What:** Meta-screen between runs. Spend salvage on ship upgrades. Give players a reason to run again.
- **Files:** `index.html` (metagame screen, currency tracking, upgrade system)
- **Dependencies:** Inventory/loot system (Task N4), run success/failure flow
- **Deliverables:**
  - Metagame screen after extraction success (not after death — you lose everything on death)
  - Currency: Exotic Matter, accumulated from successfully extracted loot
  - 4-5 ship upgrades, each with 3 levels:
    - Thrust Power (faster acceleration)
    - Hull Integrity (survive one fauna hit — future-proofing)
    - Signal Dampening (reduce signal generation by 10/20/30%)
    - Sensor Range (edge markers show entity type, not just direction)
    - Current Reader (visual indicator of fluid flow direction around ship)
  - Upgrades persist across runs (localStorage)
  - Simple UI: grid of upgrade cards, cost displayed, click to buy
  - "New Run" button launches a fresh universe with upgrades applied
- **Acceptance Criteria:**
  - [ ] Metagame screen appears after successful extraction
  - [ ] Exotic Matter accumulates correctly from extracted loot
  - [ ] All upgrades purchasable and persist across page refresh
  - [ ] Upgrades have visible/felt effect in-game
  - [ ] Signal Dampening doesn't break the signal system (still meaningful, just reduced)
  - [ ] "New Run" starts a fresh universe correctly
  - [ ] Death = lose all loot from that run (extraction game standard)
- **Scope:** Medium

#### Task N13: Procedural Universe Identity (Small, 1-2hr)
- **What:** Each run feels like a unique dead universe, not a random level.
- **Files:** `index.html` (universe generation, wreck text, per-run signature)
- **Dependencies:** Universe layout generation (well placement, wreck placement)
- **Deliverables:**
  - Per-run cosmic signature (pick one dominant trait):
    - Long slow tidal currents (low-frequency force oscillation)
    - Violent merger pulses (high-amplitude, high-frequency)
    - Thick and viscous from the start (high base viscosity)
    - Rich in wrecks, poor in portals (or vice versa)
  - Signature shown at run start: "Entering Universe: The Slow Tide" / "Entering Universe: The Shattered Merge"
  - Wreck names include per-run civilization thematic (one dominant civ per wreck cluster)
  - 3-5 wreck silhouette classes: use different ASCII character patterns to distinguish wreck types visually
  - Randomized well placement (1 central ± offset, 2-4 satellites at 40-70% radius with jitter)
  - Randomized wreck/portal placement per the rules in DESIGN-DEEP-DIVE.md
- **Acceptance Criteria:**
  - [ ] Each new run has a named cosmic signature
  - [ ] Signature visibly affects gameplay (thick universe feels different from merger universe)
  - [ ] Wreck clusters have distinct visual silhouettes
  - [ ] Well placement varies between runs
  - [ ] Three consecutive runs feel like three different universes
- **Scope:** Small

#### Task N14: Balance Pass (Medium, 2-3hr)
- **What:** Tune every number in the game. Target: 8-12 minute runs, escalating tension.
- **Files:** `index.html` (constants section / config object)
- **Dependencies:** All gameplay systems
- **Deliverables:**
  - All tunable constants extracted into a single config object at top of file
  - Run timing targets per DESIGN-DEEP-DIVE.md timeline:
    - 0:00-2:00 Exploration (all portals, wells weak, fluid responsive)
    - 2:00-4:00 Escalation (first portal dies, wells growing, viscosity rising)
    - 4:00-6:00 Tension (second portal gone, wells strong, signal threshold approachable)
    - 6:00-8:00 Crisis (1-2 portals remain, wells doubled, fluid thick)
    - 8:00-10:00 Collapse (last portal flickering, wells dominant, extract or die)
  - Tuned values for: thrust force, wave amplitude, well growth rate, viscosity curve, signal rates, signal decay, portal evaporation intervals, loot value distribution, Inhibitor speed, Inhibitor tracking interval
  - Test each tuning target by playing through the timeline
- **Acceptance Criteria:**
  - [ ] Average run length is 8-12 minutes
  - [ ] Tension clearly escalates over the run (early = calm, late = desperate)
  - [ ] Signal threshold is reachable but not guaranteed (depends on playstyle)
  - [ ] Inhibitor is avoidable through skill (drifting, hiding) but terrifying
  - [ ] The "one more wreck" temptation is real at 4-6 minute mark
  - [ ] Portal evaporation creates genuine urgency
  - [ ] Config object is clean and well-commented
- **Scope:** Medium

#### Night Report
- Agent writes `docs/journal/reports/2026-03-20-night.md`

---

### Morning Review (10am)

Greg checks:
1. Play 3 runs with the progression system. Does upgrading feel good? Too fast? Too slow?
2. **THE QUESTION:** Do runs feel replayable? Does the cosmic signature make each universe feel distinct?
3. Is the balance right? Is 8-12 minutes the right run length?
4. With all systems in place: would you play this for 30 minutes? An hour?

### Day Shift (10am-midnight)

**Greg priorities:**
1. **Extended playtest session.** Play for 1-2 hours straight. This is the game-feel validation. Note everything.
2. **Upgrade balance.** Are upgrades meaningful? Is Signal Dampening too strong (breaks the system) or too weak (not worth buying)?
3. **Wreck text quality.** Read the procedural names and histories. Do they evoke "dead civilization" or "random word generator"? Edit the word lists.
4. **Stream / record a run.** This is content. Capture the best run for jam submission materials.

**Parallel agent work:**
- Title screen: black → grid fades in → gravity well pulses → title in bold serif → "Click to begin"
- Game over screen: universe collapse animation (wells consume everything, ASCII chars drain to center)
- Extraction success screen: loot summary, Exotic Matter gained, return to metagame
- **Player primer / "How to Play" doc** — write for someone who's never seen the game. What are you? What do you do? What kills you? What are the controls? Keep it short (fits on an itch.io page). Covers: surfing concept, thrust/drift, signal, portals, the Inhibitor. This goes on the itch.io page and optionally as an in-game first-run overlay.
- If ahead: fauna (Signal Moths — simple entities near wrecks, attracted by signal >15%, swarm behavior, contact adds +5% signal)

### Evening Handoff (midnight)

Greg specs Fri→Sat work:
- Final polish list (ranked by impact)
- Known bugs to fix
- Cut list for anything that's not landing
- Deployment prep tasks

### Scope Ratchet (end of Friday)

| Status | Action |
|--------|--------|
| **Ahead** (progression + balance + all screens done) | Add fauna. Add force pulse. Deeper audio (dynamic mixing per MUSIC.md). Difficulty scaling across runs. |
| **On track** (progression works, balance close) | Saturday is final polish + deploy prep. No new systems. |
| **Behind** (progression incomplete) | Cut upgrades to 2-3 (thrust + signal dampening only). Cut cosmic signatures. Ship what plays well. |
| **Crisis** (balance is off, game isn't fun) | Cut progression entirely (each run standalone). All effort on making a single run feel good. Deploy that. |

---

## Saturday, March 21 — L5/L6: Polish + Deploy Prep

### Night Shift (Fri→Sat, midnight-10am)

**Goal:** Everything that makes the game shippable. Title, game over, performance, edge cases.

#### Task N15: Title + Flow Screens (Small, 1-2hr)
- **What:** First and last impressions. Title screen, game over, extraction success.
- **Files:** `index.html` (screen states, transitions)
- **Dependencies:** Core game loop, metagame screen (Task N12)
- **Deliverables:**
  - Title screen: black background, fluid sim running at low intensity in background (ASCII visible), title "LAST BLACK HOLE" in bold serif, "Click to drop" prompt. A gravity well pulses in the center.
  - Game over (death): screen distorts — ASCII chars drain toward center, colors shift to red, then black. "UNIVERSE COLLAPSED" text. "Drop again" button returns to title (or metagame if upgrades exist).
  - Game over (Inhibitor death): distinct from collapse. Flash of magenta, all chars glitch, cut to black. "YOU WERE SEEN." Different feeling from collapse.
  - Extraction success: fluid calms, colors shift to cool blue, "EXTRACTION SUCCESSFUL" in green. Fade to metagame/loot summary.
  - Smooth transitions between all states (no jarring cuts)
- **Acceptance Criteria:**
  - [ ] Title screen is visually striking (fluid + ASCII running behind title text)
  - [ ] Each death type has a distinct game-over moment
  - [ ] Extraction feels like relief (visual + audio calm)
  - [ ] All screen transitions are smooth (fades, not cuts)
  - [ ] Full loop works: title → run → end → title/metagame → run
  - [ ] No state leaks between runs (all game state properly reset)
- **Scope:** Small

#### Task N16: Performance Optimization (Medium, 1-2hr)
- **What:** Hit 60fps on mid-range hardware. Identify and fix bottlenecks.
- **Files:** `index.html` (rendering pipeline, sim loop)
- **Dependencies:** All rendering + sim code
- **Deliverables:**
  - Profile with Chrome DevTools: identify frame time breakdown (sim vs ASCII post vs HUD update)
  - Frustum rendering verified: ASCII shader only processes visible viewport + 1 screen buffer
  - Entity update runs for all entities; entity rendering only in frustum
  - If fluid sim is the bottleneck: reduce grid to 128x128 (ASCII dithering hides the lower resolution)
  - If ASCII shader is bottleneck: increase cell size (10x16) or reduce character variety
  - Ensure no memory leaks across runs (allocations cleaned up on run end)
  - Test on Chrome and Firefox
- **Acceptance Criteria:**
  - [ ] Consistent 60fps in Chrome on a mid-range laptop (verify with performance overlay)
  - [ ] No frame drops during Inhibitor spawn (heaviest moment: corruption effects + entity + audio)
  - [ ] No frame drops when 3+ wells are active late-game
  - [ ] No memory growth across 5 consecutive runs
  - [ ] Works in Firefox (may have lower perf, but functional)
- **Scope:** Medium

#### Task N17: Edge Cases + Bug Fixes (Medium, 2-3hr)
- **What:** Everything that breaks when a real player touches it.
- **Files:** `index.html` (various)
- **Dependencies:** All systems
- **Deliverables:**
  - Window resize handling (fluid sim + ASCII grid recalculate)
  - Browser tab hidden → resumed (requestAnimationFrame pauses — game state must handle time gap)
  - All portals evaporate at exact same moment edge case
  - Ship thrust while at map boundary
  - Inhibitor pathing when player is at map edge
  - localStorage save/load error handling (quota exceeded, private browsing)
  - Audio context resume on re-focus (browsers suspend audio on tab switch)
  - No console errors in normal gameplay
  - Mobile: display a "Desktop required" message, don't attempt to run (touch controls not supported)
- **Acceptance Criteria:**
  - [ ] Resize works without crashing or visual glitches
  - [ ] Tab switch + return doesn't break game state
  - [ ] No console errors during normal play
  - [ ] localStorage failures handled gracefully (game still works, just no save)
  - [ ] Mobile browsers see a clear message
- **Scope:** Medium

#### Night Report
- Agent writes `docs/journal/reports/2026-03-21-night.md`

---

### Morning Review (10am)

Greg checks:
1. Play on a second device/browser. Does it work?
2. Resize test, tab-switch test, rapid-restart test
3. **THE QUESTION:** Is this ready to show someone? Would you be proud to share this link?
4. Note any remaining polish that would make the biggest difference in 12 hours

### Day Shift (10am-midnight)

**Greg priorities:**
1. **Final balance tuning.** Play 5+ runs. Adjust any constants that feel off. This is the last tuning pass.
2. **itch.io page creation.** Upload build. Write description. Add screenshots. Set up page with the ASCII aesthetic.
3. **README and jam submission text.** What is this game? How do you play? What inspired it?
4. **Record gameplay clips.** 30-60 second clips for social media / jam page.
5. **Bug triage.** Fix anything that would embarrass you in front of judges. Accept anything that only appears in edge cases.

**Parallel agent work:**
- Minify / bundle if needed for itch.io upload
- Generate screenshots at interesting moments (can be done via canvas.toDataURL)
- If ahead: add whatever single feature would improve the game most (Greg's call)

### Evening Handoff (midnight)

Greg specs Sat→Sun work:
- Final bug fix list (if any)
- Deploy checklist
- Anything left for Sunday

### Scope Ratchet (end of Saturday)

| Status | Action |
|--------|--------|
| **Ahead** (game polished, deployed, looks good) | Sunday is stretch goals: fauna, force pulse, deeper procgen, audio polish, difficulty scaling |
| **On track** (game works, needs final fixes) | Sunday morning: fixes. Sunday afternoon: deploy + submit. |
| **Behind** (performance issues or major bugs) | Cut progression (standalone runs). Cut cosmic signatures. Fix bugs. Deploy minimal viable game. |
| **Crisis** (game doesn't feel fun) | Radical scope cut. Ship the fluid sim + ship + wells + 3 wrecks + 1 portal. Make THAT feel good. Deploy. |

---

## Sunday, March 22 — L6: Ship Day

### Night Shift (Sat→Sun, midnight-10am)

**Goal:** Final fixes and stretch goals. Everything committed by 10am is what ships.

#### Task N18: Final Fixes (from Greg's Saturday notes) (Small-Medium, 1-3hr)
- **What:** Whatever Greg flagged Saturday evening. Bug fixes, balance tweaks, polish items.
- **Files:** As specified in Greg's notes
- **Dependencies:** As specified
- **Scope:** Variable — should be clearly scoped by Greg's evening spec

#### Task N19: Stretch Goals (if time allows) (Variable)

Priority-ordered stretch goals — do them in order, stop when time runs out:

1. **Fauna: Signal Moths** (Medium, 2-3hr)
   - Simple entities spawning near wrecks when player signal > 15%
   - Move toward player, swarm behavior (flock algorithm)
   - Contact adds +5% signal to player (they amplify your footprint)
   - Rendered as pale blue-white (`#B8D4E8`) shifting blobs (`~∽≈`)
   - Acceptance: fauna appear when loud, swarm feels organic, contact punishes

2. **Force Pulse** (Small, 1-2hr)
   - Click + key (spacebar) injects massive force into fluid at ship position
   - Creates visible shockwave pushing everything outward
   - Costs: +25% signal spike
   - Uses: emergency escape from wells, push fauna away, create a wave to surf
   - Acceptance: force pulse creates visible fluid disturbance, signal spike is dramatic

3. **Difficulty Scaling** (Small, 1hr)
   - After 3 successful extractions: +1 well, faster portal evaporation, higher base viscosity
   - After 6: Inhibitor threshold drops 10%, wells start larger
   - Simple multiplier on config values based on successful extraction count
   - Acceptance: later runs are noticeably harder

4. **Dynamic Audio Mixing** (Small, 1hr)
   - Signal ducking: high signal reduces other layer volumes
   - Inhibitor override: Inhibitor tone progressively takes over the mix
   - Proximity priority: nearest entity is loudest
   - Acceptance: audio mix responds to game state dynamically

#### Night Report
- Agent writes `docs/journal/reports/2026-03-22-night.md`

---

### Morning Review (10am)

Greg checks:
1. Final play session. Is this the game we're shipping?
2. Any last critical fixes (30 min max)
3. Test the deployed build on itch.io (not just local)

### Day Shift (10am-6pm) — SHIP IT

**Greg priorities (in strict order):**
1. **10am-11am:** Final playtest of deployed build. Fix any deploy-specific issues.
2. **11am-12pm:** Write itch.io page description, controls guide, credits.
3. **12pm-1pm:** Take final screenshots at the best moments. Record a 60-second gameplay gif/clip.
4. **1pm-2pm:** Final upload to itch.io. Verify it works in incognito browser.
5. **2pm-3pm:** Submit to jam. Post on social media.
6. **3pm onward:** Done. Play the game. Celebrate. Write a DEVLOG entry about the week.

**No new code after 2pm.** The game is shipped.

---

## Parallel Work Matrix

Tasks that CAN run simultaneously (with two agents):

| Time Slot | Agent 1 | Agent 2 |
|-----------|---------|---------|
| Mon night | N1a: Approach A (single sim + force injection + ship) | N1b: Approach B (dual solver + ship). N3: ASCII shader (once either FBO exists). N2: Dev panel (once either prototype runs). |
| Mon morning | **PHYSICS COMPARISON** — Greg plays both prototypes, tunes via dev panel, picks winner or merges | |
| Mon day | Greg tunes winner via dev panel + sandbox | Sandbox mode + stub game state + HUD layout. Merge task if needed. |
| Tue night | N4: Wrecks → N5: Portals | N6: Well Growth (independent of entities) |
| Tue day | Greg tunes extraction loop | Multi-well + wreck-fluid polish |
| Wed night | N7: Signal → N8: Inhibitor | Audio foundation (reads game state, doesn't modify) |
| Wed day | Greg playtests signal | Wreck name generator + procgen text |
| Thu night | N9: HUD | N10: Visual Juice + N11: Audio (parallel, touch different systems) |
| Thu day | Greg playtests full game | Title/flow screens + wreck text display |
| Fri night | N12: Progression → N13: Procgen Universe | N14: Balance Pass (reads everything, modifies constants) |
| Fri day | Greg extended playtest | Capture content + polish |
| Sat night | N15: Title Screens | N16: Perf Optimization + N17: Edge Cases |
| Sun night | N18: Final Fixes | N19: Stretch Goals |

---

## Minimum Shippable Game Checklist

If everything goes wrong and we have to ship the absolute minimum:

- [ ] Single HTML file loads in browser
- [ ] WebGL fluid sim running with ASCII dithering
- [ ] 1-2 gravity wells with force injection
- [ ] Ship with mouse-aim thrust + fluid coupling
- [ ] 3+ wrecks with fly-over loot
- [ ] 1+ portal with extraction
- [ ] Signal level tracking (even if just visual, no threshold)
- [ ] Inhibitor spawns at high signal, hunts, kills
- [ ] Any HUD (even just text overlays)
- [ ] Restart loop (title → run → end → title)
- [ ] Deployed to itch.io

That is a game. Everything else makes it a better game.

---

## Daily Decision Gates

| Day | Gate Question | If Yes | If No |
|-----|-------------|--------|-------|
| Mon AM | Do both prototypes work? Which feels better? | Pick winner (or merge). Proceed to L1. | Use whichever works. Fix the other or abandon it. |
| Mon PM | Does surfing feel good in the winning sim? | Proceed to L1 | Fix physics. Hold everything. |
| Tue | Does push-your-luck work? | Proceed to L2 | Tune extraction timing. Simplify. |
| Wed | Is signal interesting (not punitive)? | Proceed to L3/L4 | Add signal upside per Forge. Re-tune. |
| Thu | Is this game fun to play for 15 minutes? | Proceed to L5 | Cut scope. Polish what works. |
| Fri | Would you play this for an hour? | Add depth. | Cut progression. Ship core loop. |
| Sat | Would you share this link? | Deploy. Polish. | Fix the thing that embarrasses you. |
| Sun | Is it submitted? | Celebrate. | Submit it anyway. Done beats perfect. |
