# Backlog: Post-Jam and Deferred Work

> Things that aren't in the jam week but are worth building.
> Not a graveyard — a queue. Items here got backlogged for scope, not because they're bad ideas.
> If we continue development past March 22, this is the starting menu.

---

## How Items Get Here

- Forge says "not this week" → backlogged with rationale
- Greg defers a decision → backlogged with context
- Agent builds a probe that doesn't win adoption → backlogged with learnings
- Scope ratchet cuts something → backlogged with the state it was in when cut

## How Items Leave

- Greg pulls them into a sprint/cycle
- They get superseded by a better idea (mark as `SUPERSEDED` with pointer)
- They turn out to be wrong after playtesting (mark as `REJECTED` with reason)

---

## Physics & Simulation

### Dual-Solver (Wave Equation + Navier-Stokes)
- **From:** Monday night parallel experiment (N1b), if single-sim wins
- **What:** Separate wave equation solver coupled to the fluid sim for physically accurate wave propagation
- **Why backlogged:** Forge: "If not clearly better by Tuesday AM, backlog it immediately. The jam cannot afford architectural sentimentalism."
- **Value if revisited:** More accurate surfing physics, better wave interference patterns, distinct wave behavior from fluid eddies
- **State when backlogged:** Full design in DESIGN-DEEP-DIVE.md, agent prompt ready in AGENT-PROMPTS.md (Prompt B), comparison criteria defined
- **Prerequisite to revive:** Single-sim must be stable and fun first. This is an upgrade, not a replacement.

### Fast sqrt Approximation for Ring Scaling
- **What:** Replace `Math.sqrt()` in `accretionScale()` (coords.js) with a cheaper approximation or precomputed value
- **Why backlogged:** Currently 4-20 CPU-side calls per frame — not hot. But sqrt in rendering math gets expensive fast if the pattern spreads to GPU shaders or per-pixel calculations.
- **Options:** Precompute on map load (value only changes when WORLD_SCALE changes), lookup table for the 3 map sizes we ship (`{3: 3.0, 5: 3.873, 10: 5.477}`), Quake fast inverse sqrt if it moves to shader, or just cache the result in a module-level variable that resets on `setWorldScale()`.
- **Simplest fix:** Cache in coords.js — recompute only when WORLD_SCALE changes. Zero per-frame cost.
- **Added:** 2026-03-26

### Profile Name Text Input Sanitization
- **What:** The profile name input accepts player-typed text. Needs sanitization: strip HTML/script, cap length (16 chars), handle edge cases (empty, whitespace-only, emoji, non-ASCII).
- **Why deferred:** Text input is working. Sanitization is a polish/security concern, not a gameplay blocker.
- **Added:** 2026-03-27

### Death Penalty Design
- **What:** Death loses all cargo + equipped artifacts. Survival bonus reduced by 50%. No EM loss beyond lost items. No insurance (loss is loss).
- **Status:** Designed in META-LOOP.md. Earnings calculation implemented in design, not yet in code.
- **Open:** EM percentage loss on top of cargo loss? Hardcore mode (pilot deletion on death)? Deferred to playtesting.
- **Added:** 2026-03-27, updated 2026-03-31

### ~~Upgrade Respec~~ — DECIDED: NO RESPEC
- **Status:** No respec. Rig upgrades are permanent. Delete pilot to start over. Decided 2026-03-31.
- **See:** CLASSES-AND-PROGRESSION.md, DECISION-LOG.md

### Server-Side Save
- **What:** Persist player profiles to a server API instead of (or in addition to) localStorage. Enables cross-device play, backup, anti-cheat.
- **Why deferred:** localStorage is sufficient for single-device play. Server save is a multiplayer/deployment concern.
- **First revival step:** Define a REST API shape for profile CRUD. The save format is already JSON-serializable.
- **Added:** 2026-03-27

### Comet Tail Fluid Wake Injection
- **What:** Inject comet tail density into the visual density buffer (and optionally velocity field) so tails interact with the fluid sim, not just the canvas overlay.
- **Why deferred:** More splats = more GPU load. Canvas-only tails are cheap and look good enough for now. Need to profile before adding fluid injection.
- **Value if revisited:** Comet tails that distort the ASCII field, interact with wells, and leave visible trails in the fluid. Much richer visual.
- **First revival step:** Profile current splat budget, then add 3-5 trail splats per comet per frame behind the body.
- **Added:** 2026-03-26

### Spatially-Varying Fluid Parameters
- **What:** Viscosity texture, damping texture, temperature texture that vary across the map and degrade over time
- **Why backlogged:** Adds complexity to fluid sim tuning. Core viscosity ramp (uniform) is enough for jam.
- **Value if revisited:** Regions of thick/thin spacetime, localized danger zones, visual variety in the ASCII field

### Adaptive Sim Budgets by Map Scale
- **What:** Per-map or per-mode fluid resolution, pressure iterations, and fixed sim tick profiles.
- **Why backlogged:** Jam week needed a stable default first. The current perf cuts remove the worst pass explosion, but large-map tuning still needs a deliberate profile pass.
- **Value if revisited:** Lets `3x3`, `5x5`, and `10x10+` maps keep different cost envelopes without pretending one solver budget fits all scales.
- **First revival step:** Promote `fluidResolution`, `fixedHz`, and pressure-iteration overrides into explicit map/runtime profiles once gameplay feel is stable.

### Advanced Fabric Anomalies
- **What:** Rift currents, density pockets, resonance fields, null zones, feedback loops
- **From:** MOVEMENT.md "Future Anomaly Types"
- **Why backlogged:** Each is a new movement verb. Too many verbs for week one.
- **Value if revisited:** Dramatically expands navigation vocabulary. Each could be a run modifier.

### Tidal Effects on Ship
- **What:** Differential gravity — closer side of ship pulled harder, creating rotational torque near wells
- **Why backlogged:** Complex physics, subtle effect, may confuse more than it adds
- **Value if revisited:** Makes close well approaches physically destabilizing. Expert-level danger.

---

## Controls & Input

### DualSense Controller (Full)
- **From:** CONTROLS.md, Forge Review #2
- **What:** Adaptive trigger resistance (heavy near wells, light on waves), HD haptic patterns, full button mapping
- **Why backlogged:** Forge: "Basic controller input is fine if it comes for free. Adaptive triggers and haptics are post-jam candy."
- **Jam version:** Basic Gamepad API (stick aim + trigger thrust) if time allows Tuesday/Wednesday
- **Post-jam version:** WebHID for adaptive triggers, haptic motor patterns per game state
- **Value if revisited:** Physical feedback makes the fluid state tangible. Could be the definitive way to play.

### Mouse Model 1 (Distance-Modulated Thrust)
- **What:** Cursor distance from ship modulates thrust intensity
- **Why potentially backlogged:** Forge: "If not obvious in 5 minutes, fall back to Model 2." May not survive Monday playtesting.
- **State if backlogged:** Full design in CONTROLS.md with distance curve formula, dead zone, ramp range

### Reverse Thrust / Active Brake
- **What:** Dedicated brake input (Space on keyboard, L2 on controller) for active deceleration
- **Why backlogged:** Need to determine if 180° turn-and-thrust is sufficient. Brake may be unnecessary forgiveness.
- **Value if revisited:** More accessible for beginners, cleaner escape maneuvers

---

## Affordances (Priority Queue)

> These are ordered by expected impact. Start with the top few Monday, add more as the game matures. "Next best knob" lens: which affordance would improve feel the most given what we've already shipped?

### Tier 1 — Ship Monday (in the physics prototype)
1. **Wave magnetism** — catch window + lock strength. THE core surfing affordance.
2. **Thrust smoothing** — facing lerp. Prevents jitter, makes the ship feel physical.
3. **Input buffering** — coyote time for wave catching. Invisible, high impact.

### Tier 2 — Add Tuesday (with entities)
4. **Wreck approach stickiness** — deceleration assist + approach cone. Makes looting feel good.
5. **Portal alignment** — approach magnetism + entry confirmation. Makes extraction reliable.
6. **Well escape assist** — soft shoulder. Makes wells dangerous-but-fair instead of binary death.

### Tier 3 — Add Wednesday-Thursday (with signal + polish)
7. **Near-miss correction** — wreck/portal/wave nudging. Quality-of-life.
8. **Counter-steer damping** — escape oscillation smoothing. Forge: start conservative.
9. **Visual affordances** — ASCII density cues for catch zones, well danger, active assists.

### Tier 4 — Backlog (post-jam or if ahead)
10. **Beginner drift guard** — Forge: cut first if over-managed. Well shoulder may be enough.
11. **A/B config toggle** — hotkey to swap tuning presets. Useful but not essential.
12. **Turn rate speed scaling** — slower turning at high speed. Committed feel, but may frustrate.

---

## Threats & Entities

### ~~Fauna: Signal Moths~~ — SHIPPED
- **Status:** Implemented as drift jellies + signal blooms in sim-runtime.js (2026-03-30)
- **What shipped:** Ambient tier fauna with signal-zone-scaled spawning, bump signal, canvas rendering

### ~~Scavenger AI~~ — SHIPPED
- **Status:** Implemented in sim-runtime.js (jam week) + AI players added (2026-03-30)
- **What shipped:** Drifter + Vulture scavengers, plus 5-personality AI player system (Prospector/Raider/Vulture/Ghost/Desperado) with full game loop, decision system, personality-aware flow sampling

### ~~Force Pulse~~ — SHIPPED
- **Status:** Implemented in sim-runtime.js (jam week)
- **What shipped:** Area impulse, hull-scaled radius/cooldown/signal cost, entity push, scavenger/planetoid interaction

### Signal Flare (Decoy System)
- **What:** Deploy a signal decoy at current position. +0.04 spike, half decay rate, 8-10s duration. AI tracks flare instead of player.
- **Why backlogged:** Partially superseded by Shroud's Decoy Flare ability. Could still exist as a consumable item available to all hulls.
- **Value if revisited:** Tactical misdirection for non-Shroud hulls. Consumable item, not a class ability.
- **Added:** from SIGNAL-SYSTEM.md, deferred during implementation

### Signal Equipment
- **What:** Dampened Thrusters (slow signal ramp), Signal Sink (+30% decay), Resonant Hull (-40% loot spikes), Wake Cloak (doubled wreck masking radius), Harmonic Damper (shift zone thresholds +0.05)
- **Why backlogged:** Now superseded by the hull coefficient system + artifact items. These effects should be individual T2-T3 artifacts in the item catalog, not a separate equipment system.
- **Value if revisited:** Fold into item catalog as specific artifact designs.
- **Added:** from SIGNAL-SYSTEM.md, superseded by hull/artifact system

### Rook Mode (Zero-Risk Entry)
- **What:** A zero-risk run mode inspired by Marathon's Rook shell. Bring nothing, risk nothing, spawn with disadvantages (late timing, worse starting position, no rig bonuses). Pure scavenging — anything you extract is profit.
- **Why backlogged:** LBH's loss curve is softer than Marathon's (you lose cargo/salvage, not your hull/rig/profile). The current risk structure may not need a zero-risk escape valve. But Marathon's Rook does a lot of things right for onboarding and gear-poor players.
- **Value if revisited:** onboarding path for new players, recovery option after catastrophic loss, creates a natural risk gradient (Rook → light loadout → full kit). Could pair with a "Rook hull" that has unique scavenging abilities but no rig progression.
- **Design reference:** Marathon's Rook spawns late, brings nothing, can disguise as AI enemies. Pure profit on extraction. See CLASSES-AND-PROGRESSION.md research notes.
- **Added:** 2026-03-31

---

## Multiplayer & Architecture

### ~~Dedicated Sim Process~~ — SHIPPED
- **Status:** sim-runtime.js + sim-server.js run as separate node process (2026-03-25+)
- **What shipped:** HTTP-based authoritative sim server, snapshot/event protocol, input handling

### ~~Client / Server Protocol~~ — SHIPPED
- **Status:** sim-protocol.js + sim-client.js define the contract (2026-03-25+)
- **What shipped:** Input envelope (movement, pulse, abilities, consumables), snapshot schema, event stream, inventory actions

### ~~PlayerBrain / Derived-State Boxing~~ — SHIPPED
- **Status:** resolvePlayerBrain() in sim-runtime.js (2026-03-31)
- **What shipped:** Hull × rig × salvage → flat coefficients with stacking rules and caps. createAbilityState() for per-hull state.

### ~~Run Overload State Machine~~ — SHIPPED
- **Status:** overload-state.js (2026-03-31)
- **What shipped:** NORMAL/THROTTLED/DEGRADED/DILATED states with tick cost triggers

### ~~Persistent Data Layer~~ — SHIPPED
- **Status:** control-plane-store.js (2026-03-31)
- **What shipped:** Durable profiles, vault, loadout, session metadata. File-backed JSON store.

### ~~Control Plane / Session Registry~~ — SHIPPED
- **Status:** session-registry.js (2026-03-31)
- **What shipped:** Session lifecycle, host assignment, run creation, player-to-run mapping

### Mini Server + MacBook Client
- **What:** Run sim on Mac mini, client on MacBook over Tailscale/LAN
- **Status:** Architecture and local control plane support this now. Needs testing on actual hardware.
- **First revival step:** Launch one run with mini as authority, MacBook as client.

### Run Result Package and Write-Back
- **What:** Explicit result package written from sim to persistence on extraction/death/teardown
- **Status:** Schema designed in META-LOOP.md. Not yet implemented in persistence write-back.
- **First revival step:** Implement RunResult construction in sim-runtime.js and wire to control-plane-store.

### Third Artifact Slot
- **What:** Expand the live loadout contract from `2 equipped + 2 consumable` to `3 equipped + 2 consumable`.
- **Why deferred:** Some design docs already assumed three artifact slots, but the shipped HUD, profile shape, inventory system, and control-plane persistence are all currently built around two. Advancing one layer without the others creates dishonest state and awkward UI.
- **First revival step:** Migrate `profile.js`, `inventory.js`, HUD, control-plane store, and remote-authority tests together in one slice instead of letting one layer drift ahead.

### Coarse Authoritative Flow / Hazard Field
- **What:** Low-res server-owned gameplay field for motion/danger on larger maps
- **Status:** First-pass coarse field shipped for medium and large maps.
- **Next step:** Tune cell size, cadence, and force weighting against real `4-8` player sessions and Tailscale latency instead of only local harness runs.

### Session Profiles
- **What:** Named profiles (solo_ai_light, duel_competitive, etc) defining clocks, AI fill, budgets
- **Status:** Map-scale profiles exist. Player-count profiles not yet separated.
- **First revival step:** Lift map-scale profiles into session profiles with player-count intent.

### Hosted Run Instances
- **What:** Run-scoped authoritative sessions for 4-8 players, with solo fallback and AI fill
- **Why deferred:** Private remote play must work first (mini + MacBook milestone).
- **Value if revisited:** Matches the game's actual shape better than a persistent world or public free-for-all service.
- **First revival step:** Reuse the local client/server protocol for one hosted run instance before any matchmaking work.

### Godot / Native Client Port
- **What:** Move the client/runtime to a more mature native or engine-backed stack once the gameplay and protocol contracts are stable.
- **Why deferred:** The current browser/Electron stack is good enough to prove the game. A port now would mix architecture cleanup with runtime migration.
- **Value if revisited:** Better packaging, better platform reach, cleaner renderer/runtime tooling.
- **First revival step:** Keep the port target behind the protocol boundary. Port the game contract, not today's in-browser code structure.

### Headless Sim Harness
- **What:** Run gameplay tests against a dedicated sim process instead of an in-page browser loop.
- **Why backlogged:** The renderer harness and main flow harness are enough for the jam.
- **Value if revisited:** Lets agents hammer the server-authoritative path directly and catch desync bugs earlier.
- **First revival step:** Repoint one smoke test to a process-backed `SimCore` without involving the renderer.

---

## Visual & Audio

### Feedback Buffer (Motion Trails)
- **What:** Blend previous frame's ASCII output with current at 85-95% decay
- **Why backlogged:** Visual polish, not identity. ASCII shader is identity.
- **Value if revisited:** Motion feels more fluid, trails create visual continuity

### Dynamic Audio Mixing
- **What:** Signal ducking, Inhibitor override, proximity priority
- **Why backlogged:** Stretch goal. Basic audio layers are enough for jam.
- **Value if revisited:** Audio becomes responsive to game state. Immersion leap.

### Difficulty Scaling Across Runs
- **What:** After 3 extractions: +1 well, faster evap. After 6: lower threshold, bigger wells.
- **Why backlogged:** Needs progression system working first (L5).
- **Value if revisited:** Replayability. Later runs feel earned.

---

## Testing & Tooling

### Visual Regression Tests
- **What:** Screenshot comparison against baselines, perceptual hash diff
- **Why backlogged:** Needs stable visuals before baselines are meaningful
- **Value if revisited:** Catches "the ASCII shader broke and everything is black" automatically

### A/B Config Testing (Split Screen)
- **What:** Run two game instances with different configs simultaneously
- **Why backlogged:** Over-engineering for jam week
- **Value if revisited:** Faster tuning decisions when stuck between two feel options

### Full Integration Test Suite
- **What:** Automated full-run playthrough, all screen transitions, browser compat
- **From:** AGENT-TESTING.md Layers 4-5
- **Why backlogged:** Only valuable when the full game exists (Thursday+)
- **Value if revisited:** Regression safety net during polish phase
