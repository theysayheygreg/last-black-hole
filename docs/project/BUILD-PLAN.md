# Build Plan: Last Singularity

> Originally the jam build plan (March 16-22, 2026).
> Updated to reflect post-jam development through April 20.

---

## Current Build Phase: L5/L6 Bridge — Productized Authority + Renderer Hardening

All jam layers (L0-L4) shipped. L5 is in progress with substantial systems work complete.

### L5 Shipped
- 5 hull classes with abilities (PlayerBrain coefficient resolution, physics wiring)
- Signal system (6 zones, generation/decay, zone crossing events)
- Inhibitor (3 forms with full behavior)
- Fauna (drift jellies, signal blooms) + gradient sentries
- AI players (5 personalities, full game loop, personality-aware navigation)
- Server-authoritative sim (HTTP protocol, snapshots, events)
- Persistence layer (durable profiles, session registry, control plane)
- Overload state machine (NORMAL/THROTTLED/DEGRADED/DILATED)
- Local remote-authority stack (client + sim + control plane, host/join/leave, architecture-aware smoke)
- Sim lifecycle hardening: idle-aware loop, auto-stop, keep-alive mode, stale detached test-process cleanup
- Composer renderer migration with deterministic renderer fixtures
- Standalone title-prototype Composer probe (`FluidDisplayPass -> BloomPass -> ASCIIPass`)
- Nightly Playables workflow with change detection and green web/Windows/macOS artifacts
- Product naming sweep to **Last Singularity** for runtime, packaging, release assets, and user-facing docs
- Loot economy design (tier gates, wreck aging, value scaling)
- Meta-loop design (results screen, vault/rig/loadout, chronicle)
- Rig upgrade tracks (all 5 hulls, 3 tracks × 5 levels)

### L5 Next (Implementation Queue)
- Productize the local stack
  - [x] canonical launcher / runtime modes
  - [x] lightweight structured logs across dev/control/sim
  - [x] desktop-visible stack status / logs
  - [x] first content manifest extraction (server-side hull manifest)
1. Tailscale hardware validation — mini authority + MacBook client
2. Runtime productization — explicit launch modes, stack status, embedded/local/remote docs
3. UI primitive bridge — shared design tokens + HUD primitives instead of inline style drift
4. Item catalog — concrete T1-T4 artifacts with coefficients + affinities
5. Loot economy — tier gates + wreck aging in sim-runtime
6. Meta-loop UI — results screen, vault/rig/loadout panels, chronicle
7. Run result write-back — connect RunResult to persistence layer
8. Hull ability client-side — keybindings, HUD cooldowns, visual effects
9. Map seed system — entity catalog selection per run
10. Continue content manifests — seeded-generation, item catalog, session profiles
11. Decide whether Bloom remains title-prototype-only or becomes a perf-gated production pass after 5x5/10x10 frame budget work

### Current constraints

- The live client contract is still `8 cargo + 2 equipped + 2 consumable`.
- The older `3 artifact slots` design is not live runtime truth yet.
- Packaged desktop artifacts now embed local authority for ordinary local packaged play.
- Browser-based remote play still depends on separate authority processes.
- The control plane can stay lightweight and always-on for local work.
- The sim is now demand-driven and auto-expiring by default; keep-alive is explicit, not accidental.
- The design system exists in docs and has now started bridging into code, but most UI compliance still depends on human discipline.
- Production rendering is intentionally cheaper than the title prototype today: gameplay uses `FluidDisplayPass -> ASCIIPass`, while the title prototype owns the Bloom canary.

### L6: The Ship (Not Yet Started)
- Balance pass (hull coefficients, upgrade costs, loot rarity, signal tuning)
- Deploy (GitHub Pages web build, nightly playables, itch.io)
- Audio for new systems (hull abilities, fauna, sentries, inhibitor forms)
- Polish pass (death screen, extraction screen with new data)

---

## Philosophy

Build in layers. Each layer produces something playable. If we run out of time at any layer, we have a game — just a simpler one.

---

## Layer 0: The Feel (Monday-Tuesday)
**Goal:** Does surfing spacetime feel good?

This is the whole bet. If the fluid sim + thrust control isn't fun to navigate, nothing else matters. Prototype this first, iterate until it clicks.

- [x] WebGL canvas, fullscreen
- [x] Fluid sim running (Navier-Stokes, GPU, 256x256)
- [x] 4 gravity wells with orbital currents + accretion disks
- [x] Ship: triangle, thrust-based mouse control, fluid coupling
- [x] Ship reads fluid velocity at its position, adds to its own velocity
- [x] Drift when not thrusting — feel the current carry you
- [x] V2 physics: steady currents + event-driven wave rings (oscillating injection abandoned)
- [x] Dev panel with live tuning sliders (toggle with backtick)
- [x] CONFIG object, every system reads every frame
- [x] `window.__TEST_API` exposing game state
- [x] Smoke + physics + coordinate tests via Puppeteer
- [x] ASCII dithering post-process shader — the visual identity
- [x] Distance-based dissipation (accretion zones persist, empty space fades)
- [x] Exponential tone mapping in display shader

**L0 Expansion (Tuesday — Experiments 1-5):**
- [x] Ship slowdown: thrustAccel 800, drag 0.06, fluidCoupling 1.2. Deliberate movement.
- [x] Bullet wake: 3 speed-based directional splats (whisper, not shout)
- [x] Stars: radiant outward push, rotating light rays, equilibrium zones with wells
- [x] Loot anchors: flow obstacles with lee zones, shimmer glow, future pickup locations
- [x] Controller support: Gamepad API, analog thrust (R2), analog brake (L2), stick facing

**Playtest question:** Is it fun to just fly around in this? If yes, proceed. If no, fix the physics until it is.

**Night shift (Experiments 6-8) — DONE:**
- [ ] AI traffic ships + well consumption (deferred — planetoids fill this role for now)
- [x] Planetoids: 3 path types (orbit, figure-8, transit), bow shock + wake vortex, well consumption
- [x] Map expansion: 3x3 world, camera follow with lead-ahead, toroidal wrapping
- [x] Exit wormholes (portals): extraction loop prototype, "ESCAPED" screen

**Morning session — architecture cleanup:**
- [x] Centralized physics (physics.js), coordinates (coords.js CAMERA_VIEW + pxPerWorld), config (all magic numbers extracted)
- [x] Gravity finite range (wells 0.8, stars 0.6 world-units — flat empty space exists)
- [x] Comprehensive code comment pass

---

## Layer 1: The Stakes (Tuesday)
**Goal:** Scavenging and extraction — the core loop has a point.

- [ ] Wrecks: static objects in the fluid field. Fly near to loot.
- [ ] Inventory: simple list of collected items (names, no mechanics yet)
- [x] Portals: glowing exit points. Fly into one to extract. (Done in L0 night shift)
- [ ] Portal evaporation: portals blink out over time (random intervals)
- [ ] Black hole growth: attractors slowly increase strength over the run
- [ ] Run end: all portals gone OR swallowed by a black hole = death. Lose everything.
- [ ] Run success: reach a portal = keep inventory. Show summary screen.
- [ ] Basic HUD: signal level, portal count, inventory count

**Playtest question:** Does the push-your-luck tension work? Stay for more loot vs. leave while portals exist?

---

## Layer 2: The Threats (Wednesday)
**Goal:** You are not alone. The universe is hostile.

- [ ] Signal mechanic: thrust, looting, scanning all add to signal level
- [ ] Signal decay: signal drops slowly when you're passive/drifting
- [ ] Fauna: simple entities that patrol near wrecks, move toward signal sources (stretch for Wed — simpler AI)
- [ ] Fauna damage: contact = hull damage, enough damage = death
- [ ] Scavenger AI: other "ships" that navigate the fluid, loot wrecks, head for portals (only if ahead of schedule)
- [ ] Scavengers use portals — a used portal is gone
- [ ] Basic collision/damage model

> **Priority note:** Inhibitor is the only essential threat (see DECISION-LOG.md). Fauna is the stretch goal for Wednesday, scavengers only if ahead. This layer's core is signal + one simpler threat.

**Playtest question:** Does signal management create interesting decisions? Is passive play boring or tense?

---

## Layer 3: The Dread (Thursday)
**Goal:** The Inhibitors. Existential threat.

- [ ] Signal threshold: cross it and they wake up
- [ ] Inhibitor spawn: appears at map edge, moves toward your last known signal position
- [ ] Inhibitor behavior: fast, ignores fluid physics (they're extradimensional), unkillable
- [ ] UI corruption when Inhibitor is near: flickering, false readings, visual noise
- [ ] If Inhibitor reaches you: instant death. No negotiation.
- [ ] Visual: distinct from everything else. Wrong. Something that doesn't belong in this universe's physics.

**Playtest question:** Is the Inhibitor terrifying? Does it make you change how you play from the moment it wakes?

---

## Layer 4: The Look (Friday)
**Goal:** EVA UI + visual polish. Make it feel like the game it is.

- [ ] Full NERV-style HUD overlay
  - Signal meter (green → orange → red)
  - Portal status (count, nearest direction)
  - Hull integrity
  - Inventory panel (collapsible?)
  - Warning text cascade ("SIGNAL DETECTED", "PORTAL EVAPORATING", "INHIBITOR ACTIVE")
- [ ] Background grid with gravity distortion (vertex displacement)
- [ ] Star particle field swirling around mass sources
- [ ] Color shifting near gravity wells (blue/red)
- [ ] Screen-space distortion (UV warp) near black holes
- [ ] Ship trail / thruster particles
- [ ] Wreck visual variety (generated from parts?)
- [ ] Portal visual: pulsing, unstable, beautiful

---

## Layer 5: The Depth (Saturday)
**Goal:** Between-run progression + procedural generation. Replayability.

- [ ] Metagame screen between runs
- [ ] Currency: exotic matter from scavenging
- [ ] Ship upgrades: thrust power, hull, signal dampening, sensor range
- [ ] Wreck name/history generation (procedural flavor text)
- [ ] Universe layout generation: randomized black hole placement, wreck distribution, portal positions
- [ ] Difficulty scaling: later runs have more black holes, faster collapse, more aggressive entities
- [ ] Mutation system (stretch): random passive abilities at run start

---

## Layer 6: The Ship (Sunday — ship day)
**Goal:** Polish, balance, deploy.

- [ ] Title screen (black → grid fades in → gravity well pulses → title in bold serif)
- [ ] Game over screen (universe collapse animation)
- [ ] Extraction success screen (what you brought back)
- [ ] Sound design (even minimal: thrust hum, wave ambience, Inhibitor drone, portal chime)
- [ ] Balance pass: run length, loot density, portal timing, signal thresholds
- [ ] Performance optimization
- [ ] Deploy to itch.io / GitHub Pages
- [ ] README / jam submission

---

## Scope Ratchets

If we're ahead of schedule:
- More entity types (multiple fauna, scavenger variants)
- Richer procedural generation (civilization types, lore fragments)
- Music (generative ambient?)
- Multiplayer prototype (WebSocket, shared universe instance)

If we're behind schedule:
- Cut between-run progression (each run is standalone)
- Simplify AI (scavengers move on fixed paths, no fluid-awareness)
- Reduce visual layers (skip grid distortion, keep fluid sim + HUD)
- One portal per run instead of multiple
- Cut fauna, keep only Inhibitor as single threat type

**Minimum shippable game:** Ship + fluid + black holes + wrecks + one portal + Inhibitor. That's a game.

---

## Pre-Monday Prep (No Code)

What we CAN do before 12:01a Monday:

- [x] Design document
- [x] Build plan
- [ ] Reference collection: EVA UI screenshots, fluid sim examples, gravity visualizations
- [ ] Tech research: test WebGL-Fluid-Simulation fork locally, understand the shader pipeline
- [ ] Asset prep: font selection, color palette CSS variables, HUD layout sketches
- [ ] Sound research: find CC0/royalty-free space ambience, drone samples
- [ ] Study the fluid sim source code — understand how to inject forces, read velocities, modify viscosity
- [ ] Wreck name generator word lists (civilization names, death causes, ship classes)
- [ ] Map out the shader pipeline: fluid sim → gravity grid → post-process distortion → HUD overlay
