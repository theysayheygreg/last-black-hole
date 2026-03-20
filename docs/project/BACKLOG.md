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

### Spatially-Varying Fluid Parameters
- **What:** Viscosity texture, damping texture, temperature texture that vary across the map and degrade over time
- **Why backlogged:** Adds complexity to fluid sim tuning. Core viscosity ramp (uniform) is enough for jam.
- **Value if revisited:** Regions of thick/thin spacetime, localized danger zones, visual variety in the ASCII field

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
