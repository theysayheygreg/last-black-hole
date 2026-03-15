# Build Plan: Last Black Hole

> Code starts 12:01a Monday March 16. Ship by Sunday March 22.
> 2x Claude usage available — lean on overnight sessions hard.

---

## Philosophy

Build in layers. Each layer produces something playable. If we run out of time at any layer, we have a game — just a simpler one.

---

## Layer 0: The Feel (Monday)
**Goal:** Does surfing spacetime feel good?

This is the whole bet. If the fluid sim + thrust control isn't fun to navigate, nothing else matters. Prototype this first, iterate until it clicks.

- [ ] WebGL canvas, fullscreen
- [ ] Fluid sim running (forked WebGL-Fluid-Simulation or built from GPU Gems approach)
- [ ] Black hole as gravity source / fluid attractor (inject force into sim)
- [ ] Ship: triangle/arrow, thrust-based mouse control
- [ ] Ship reads fluid velocity at its position, adds to its own velocity
- [ ] Drift when not thrusting — feel the current carry you
- [ ] One black hole pulling, waves propagating — can you surf them?

**Playtest question:** Is it fun to just fly around in this? If yes, proceed. If no, fix the physics until it is.

**Stretch:** Add 2-3 black holes. See how wave interference patterns feel to navigate.
- [ ] ASCII dithering post-process shader (render fluid to framebuffer → character lookup by density → color tint). This IS the visual identity — get it in early.

---

## Layer 1: The Stakes (Tuesday)
**Goal:** Scavenging and extraction — the core loop has a point.

- [ ] Wrecks: static objects in the fluid field. Fly near to loot.
- [ ] Inventory: simple list of collected items (names, no mechanics yet)
- [ ] Portals: glowing exit points. Fly into one to extract.
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
