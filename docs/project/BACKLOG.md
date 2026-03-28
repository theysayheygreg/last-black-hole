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
- **What:** Currently death loses all cargo. Greg wants EM loss on death too, but with nuance. Design the full death penalty system: EM percentage loss, insurance mechanics, hardcore mode, etc.
- **Why deferred:** Needs playtesting to understand how punishing cargo loss alone feels before layering more penalties.
- **Added:** 2026-03-27

### Upgrade Respec
- **What:** Allow players to downgrade upgrades and recover components/EM. Currently no respec — upgrades are permanent.
- **Why deferred:** Pinned for future discussion. May not be needed if upgrade costs feel right.
- **Added:** 2026-03-27

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

### Fauna: Signal Moths
- **What:** Simple entities near wrecks, attracted by signal >15%, swarm behavior, contact adds +5% signal
- **Why backlogged:** Forge: Inhibitor is the only required threat. Fauna is stretch.
- **State:** Full spec in ROADMAP.md N19 stretch goals
- **Value if revisited:** Amplifies signal risk, creates navigation obstacles, adds life to the world

### Scavenger AI
- **What:** AI ships that navigate fluid, loot wrecks, use portals (competing with player)
- **Why backlogged:** Most complex AI in the design. Only if significantly ahead.
- **Value if revisited:** Multiplayer-like pressure in solo, portal competition, emergent stories

### Force Pulse (Non-Lethal Tool)
- **What:** Area impulse from ship, pushes everything outward, +25% signal spike
- **Why backlogged:** Stretch goal. Needs signal system working first.
- **Value if revisited:** Emergency escape, fauna clearing, custom wave creation. The "duck dive" verb.

---

## Multiplayer

### 2-3 Player Shared Universe
- **What:** WebSocket server, authoritative fluid sim, client prediction, shared portals
- **Why backlogged:** Forge: "Architectural drag. Build clean data boundaries, not actual multiplayer."
- **State:** Full architecture in SCALING.md. Clean data boundaries built into jam version.
- **Value if revisited:** The signal mechanic becomes social. One noisy player endangers everyone.
- **Prerequisite:** Solo game must be fun first. Network code only after core loop is locked.

### Dedicated Sim Process
- **What:** Split the authoritative world update into its own long-lived process with a fixed tick, its own PID, and a stable local protocol for snapshots and inputs.
- **Why backlogged:** The interface cut is in progress, but a full second process is not needed to finish the jam.
- **State:** `docs/project/SIM-DECOUPLING-PLAN.md` defines the target shape; `FlowField`, `SimCore`, and `SimState` already exist in-process.
- **Value if revisited:** Real multiplayer path, isolated sim perf budget, cleaner debugging, easier scale experiments on larger maps.
- **First revival step:** Move remaining world systems fully behind `SimCore`, then run the sim in a Worker or child process before touching network code.

### Client / Server Local Protocol
- **What:** Define the minimal message contract between a render client and an authoritative sim: input commands, snapshots, events, and local flow queries.
- **Why backlogged:** The codebase is only just getting a real sim boundary. Protocol design before that boundary settles would churn.
- **Value if revisited:** Makes later WebSocket or local IPC transport mostly a mechanical change instead of a redesign.
- **First revival step:** Freeze a plain-data `SimState` snapshot schema and a small input command envelope.

### Next-Week Batch: Mini Server + MacBook Client
- **What:** Run the authoritative sim on Greg's Mac mini and a playable local-rendering client on the MacBook over Tailscale or LAN.
- **Why now:** This is the first honest proof that the client/server split works as a real game experience instead of an in-process abstraction.
- **Value if revisited:** Proves remote play on Greg's actual machines, separates render performance from world-truth performance, and gives the future hosted path a concrete starting point.
- **First revival step:** Launch one run with the mini as authority, the MacBook as client, and no public internet assumptions.

### Next-Week Batch: Local Client / Server Protocol
- **What:** Freeze the first message contract between authoritative sim and render client: inputs, snapshots, events, and any coarse flow/hazard query path.
- **Why now:** The mini-to-MacBook milestone and the future hosted milestone both need the same protocol boundary.
- **Value if revisited:** Turns later transport choices into implementation work instead of architectural churn.
- **First revival step:** Write the smallest viable plain-data protocol and route one playable loop through it.

### Hosted Run Instances
- **What:** Run-scoped authoritative sessions for 4-8 players, with solo fallback and AI fill where needed.
- **Why deferred:** This is the likely multiplayer future, but not the next engineering milestone. Private remote play must work first.
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
