# Changelog

> Human-readable version history of design docs.
> Git is authoritative. This is for quick scanning without `git log`.

---

## 2026-04-13 — Telemetry-aware smoke harness + build-health alignment

- Added `tests/telemetry-smoke.js` as a dedicated structured-log canary for the real distributed stack.
- Extended `tests/helpers.js` so the harness captures and reads dev/control/sim log files directly instead of treating telemetry as an untested side effect.
- Updated the shareable harness/build docs so telemetry is now part of the stated operator contract, not just something the runtime happens to emit.
- Kept `build-health` intentionally narrow, but clarified that `npm test` now covers the telemetry smoke path as part of the normal green/red contract.
- Fixed the `BUILD-HEALTH.json` self-staleness trap: one follow-up commit that only records the refreshed health file now still counts as current.

## 2026-04-12 — Desktop stack status + first content manifest

- Added a desktop-visible stack-status window for the embedded Electron build, including embedded control/sim health, session state, and recent child-process logs.
- Added `scripts/runtime-status.js` so the CLI stack tooling and the desktop shell can reason about runtime health through the same snapshot shape.
- Extracted the first runtime content manifest into `scripts/content/hulls.js`, moving hull identity and AI hull assignment out of the hot gameplay files.
- Added `docs/project/CONTENT-MANIFESTS.md` and refreshed roadmap/build-plan/backlog notes to reflect that runtime productization now includes observability and content extraction, not just process splitting.

## 2026-04-12 — Structured stack telemetry + sturdier physics harness

- Added lightweight JSON telemetry events for the dev server, control plane, sim runtime, and stack launcher so multi-process failures are easier to diagnose from existing log files.
- Hardened the gravity-well physics assertion to measure inward radial flow directly instead of relying on one short ship drift sample.
- Kept the original LBH intent intact: no gameplay behavior changed, only observability and test honesty improved.

## 2026-04-12 — Runtime productization + UI token bridge

### scripts/ — Added / Modified
- **stack.js** — Adds a canonical stack launcher/status surface with explicit runtime modes: `local-browser`, `local-host`, and `remote-client`.
- **play.js** — Legacy entrypoint now delegates to the canonical stack launcher instead of carrying its own hidden runtime model.
- **stop.js** — Legacy stop entrypoint now delegates to the canonical stack launcher.

### src/ui/ — Added
- **design-tokens.js** — First implementation-side bridge from `DESIGN-SYSTEM.md` into code.
- **hud-primitives.js** — Shared HUD markup/style helpers for portal arrow markup, inventory row selection, warning color, and item color lookup.

### src/ — Modified
- **hud.js** — Now consumes shared UI tokens/primitives for portal arrow rendering, inventory row styling, warning coloring, and item color lookup instead of repeating inline style decisions.

### root / docs/reference/ — Added / Modified
- **index-a.html** — Adds CSS custom properties mirroring core design-system tokens and rewires HUD CSS to use them.
- **DEV-SERVER.md** — Updates the operator docs around the new stack launcher and preferred runtime contract.
- **BUILD-PIPELINE.md** — Fixes the desktop packaging story: packaged desktop builds are now explicitly embedded-authority local apps, not merely thin clients.
- **RUNTIME-MODES.md** — New reference doc defining LBH runtime modes.

### docs/project/ — Added / Modified
- **2026-04-12-plugin-lens-review.md** — Review of LBH through the new macOS app and game-studio lenses.
- **BUILD-PLAN.md**
- **ROADMAP.md**
- **BACKLOG.md**

### Why
The architecture is now solid enough that the next source of team drag is not "how do we split sim from client?" It is "how do we make the current product understandable, launchable, and visually consistent?" This slice starts that productization pass without changing the underlying authority model.

## 2026-04-01 — Review pass: loadout truth, remote slot honesty, architecture docs

### scripts/ — Modified
- **control-plane-store.js** — durable profile normalization now uses the same live loadout contract as the client: `2 equipped + 2 consumable` slots instead of silently drifting to 3 equipped slots.
- **control-plane-client.js** — local embedded control-plane lifecycle methods now document that sim-instance registration is a deliberate no-op in single-process mode.
- **sim-runtime.js** — comments now mark the asynchronous control-plane write path, session mirroring, and one-way outcome commit boundary more clearly.

### src/ — Modified
- **profile.js** — local profile loadout shape is now normalized on load, replace, and save so older or server-fed data cannot quietly widen the live UI contract.
- **main.js** — remote snapshot application now mirrors authoritative inventory slot shapes directly, and local scene loads explicitly reset the browser client back to the canonical local `8 cargo + 2 equip + 2 consumable` shape.

### tests/ — Modified
- **control-plane.js** — now asserts persisted loadout slot counts so the durable control-plane shape cannot drift away from the shipped client contract unnoticed.

### docs/ — Modified
- **ROADMAP.md**
- **BACKLOG.md**
- **BUILD-PLAN.md**
- **BUILD-PIPELINE.md**
- **DECISION-LOG.md**
- **DEVLOG.md**

### Why
The architecture was green, but one persistence seam was lying: the control-plane store had drifted to a 3-slot artifact shape while the actual client, HUD, and inventory system still ship 2 equip slots. This pass brings the durable profile contract back in line with the live game, makes remote inventory shape syncing more honest, and updates the docs to reflect that packaged builds are clients while remote play still depends on separate control-plane and sim processes.

## 2026-04-01 — External Control Plane Runtime

### scripts/ — Added / Modified
- **control-plane-runtime.js** — new process-level control plane with HTTP endpoints for profile bootstrap/read/save, outcome write-back, session mirroring, and sim-instance registration/heartbeat.
- **control-plane-server.js** — PID-managed start/stop/status/restart wrapper for the control-plane process.
- **control-plane-client.js** — sim-side adapter that can either speak HTTP to the external control plane or fall back to the local JSON-backed implementation.
- **sim-runtime.js** — the sim now hydrates profiles through the control-plane adapter, mirrors sessions asynchronously through that boundary, registers/unregisters itself as a disposable instance, and no longer has to own the durable store inline.

### tests/ — Added / Modified
- **control-plane.js** — dedicated integration suite covering external sim registration, profile hydration, session mirroring, and outcome write-back.
- **helpers.js** — control-plane start/stop helpers and env passthrough for sim-server tests.
- **run-all.js** — wires the control-plane suite into `npm test`.

### package.json — Modified
- Adds `npm run control`, `control:stop`, `control:status`, and `control:restart`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The durable architecture was still only half-real as long as the sim process owned the persistent store implementation directly. This slice makes the control plane an actual process boundary and proves that the sim can treat persistence/session orchestration as external infrastructure instead of inline runtime state.

## 2026-04-01 — Server-side PlayerBrain hydration

### scripts/ — Added / Modified
- **player-brain.js** — new shared server-side `PlayerBrain` module. Owns hull definitions, durable upgrade normalization, hull/profile resolution, and resolved brain coefficients.
- **sim-runtime.js** — brain resolution moved out of the runtime body and into a dedicated module.
- **sim-runtime.js** — remote join now hydrates player brain from durable profile upgrades and loadout instead of only raw hull defaults.
- **sim-runtime.js** — equip/unequip actions now refresh live brain coefficients immediately.
- **sim-runtime.js** — server-side well contact now honors profile hull upgrades through `wellGraceDuration` and free survive charges.

### tests/ — Added / Modified
- **player-brain.js** — deterministic coverage for durable upgrade hydration and live brain refresh after remote loadout changes.
- **run-all.js** — wires the PlayerBrain suite into `npm test`.

### Why
The authority split was real, but player truth was still half-inline: hull definitions lived in the sim runtime, durable upgrades were not boxed into the server brain, and existing-player join updates could ignore loadout/profile refreshes. This slice makes `PlayerBrain` a real server-side boundary instead of another pile of local math.

## 2026-03-31 — Coarse Authoritative Flow Field

### scripts/ — Added / Modified
- **coarse-flow-field.js** — new pure server-side coarse field module. Builds and samples a wrapped grid of orbital current, well pull, wave push, and hazard intensity.
- **sim-runtime.js** — medium and large sessions now advertise `fieldTickHz`, `useCoarseField`, `flowFieldCellSize`, and `fieldFlowScale`.
- **sim-runtime.js** — expanse and deep-field now rebuild and sample a coarse authoritative field for large-map motion truth instead of scaling only by direct per-player force scans.
- **overload-state.js** — overload projection now also owns field cadence and field-cell coarsening so degraded runs simplify motion intentionally.

### tests/ — Added / Modified
- **coarse-field.js** — deterministic coverage for orbital current, inward gravity, and outward wave-band force sampling.
- **sim-scale.js** — now asserts coarse-field activation and resolution differences between small, medium, and large profiles.
- **run-all.js** — wires the coarse-field suite into `npm test`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Per-player force budgets were necessary, but they still left larger sessions as “the same force model with fewer samples.” This slice makes medium and large runs switch to an explicit coarse authoritative field so cost and fidelity degrade intentionally instead of accidentally.

## 2026-03-31 — Explicit Overload State Machine

### scripts/ — Added / Modified
- **overload-state.js** — new pure server-side overload policy module. Defines `NORMAL`, `THROTTLED`, `DEGRADED`, and `DILATED` plus budget projection and moving-pressure transitions.
- **sim-runtime.js** — sessions now carry explicit overload truth (`overloadState`, `overloadPressure`, `timeScale`) and project effective clocks/budgets from one base scale profile instead of silently degrading per subsystem.
- **sim-runtime.js** — the authoritative tick now samples real tick cost, player pressure, AI pressure, and force-source pressure, and publishes `session.overloadChanged` when the run crosses states.

### tests/ — Added / Modified
- **overload-state.js** — deterministic coverage for overload transitions, dilation projection, and recovery.
- **sim-scale.js** — now asserts new sessions start in `NORMAL` with `timeScale = 1`.
- **remote-authority.js** — remote death/write-back smoke now targets an actual authoritative well center instead of a brittle hard-coded coordinate.
- **run-all.js** — wires the overload suite into `npm test`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Map-scale profiles and per-player budgets were real, but overload behavior was still implicit. This slice makes degradation a visible run state and gives the server one coherent place to project slower clocks and tighter budgets when a session is under pressure.

## 2026-03-31 — Hull System: 5 Ship Classes with Abilities

### New Systems
- **HULL_DEFINITIONS** — 5 hulls with coefficient tables and ability definitions
- **PlayerBrain resolution** — hull × rig × salvage → flat coefficients with stacking + caps
- **Hull abilities** — Drifter (Flow Lock, Eddy Brake), Breacher (Burn, Momentum Shield), Resonant (Harmonic Pulse, Resonance Tap, Frequency Shift), Shroud (Wake Cloak, Ghost Trail, Decoy Flare), Hauler (Salvage Lock, Reinforced Hull, Tractor Field)
- **AI hull assignment** — personality-constrained, complementary, no duplicates

### Design Decisions (see DECISION-LOG.md)
- All 5 hulls ship (not phased). No respec. Complementary AI hulls. Rook backlogged. Mixed loot affinity.

---

## 2026-03-30 — Audit Pass: Design Compliance Fixes

### Audit findings & fixes
- **Signal: thrust opposition multiplier** — was using speed proxy, now uses actual flow alignment via analytical estimateFlow(). Surfing with current is quiet; fighting it is loud.
- **Signal: dead configs removed** — extractionRate (extraction is instant, no charge time) and collisionSpike (no generic entity collision exists) were defined but never wired. Removed with explanatory comments.
- **Inhibitor: Swarm control debuff** — contact now applies 5s sluggish controls (0.4× thrust). New controlDebuff field on player, in snapshot.
- **AI: competition penalty** — wreck scoring now penalizes wrecks near other players (personality.competitionPenalty). Vulture has negative penalty (prefers contested). Portal scoring includes competition count.
- **AI: threat assessment** — wreck scoring now penalizes wrecks near sentries and Inhibitor. Portal scoring rejects Inhibitor-blocked portals.
- **AI: flow sampling** — new estimatePathAlignment() samples N flow points along path. N = personality.flowSamples (Ghost: 8 careful, Raider: 3 reckless). Used in wreck scoring and navigation.
- **Comments** — added section-level design rationale comments to all new systems.

### Known deferred gaps (separate features, not bugs)
- Signal flare/decoy system (separate input + entity, not in scope for this build)
- Signal equipment (Dampened Thrusters, Signal Sink, etc — inventory items)
- HUD degradation near Inhibitor (client-side shader effect)
- AI slot replacement when humans join (session management layer)
- Swarm tendril rendering (shader visual, not simulation)

---

## 2026-03-30 — Feature Build: Signal, Inhibitor, Fauna, Sentries, AI Players

### New Systems (all server-authoritative + client rendering)
- **Signal system** — per-player 0-1 float, rises from thrust/loot/pulse, decays when quiet. 6 zones (ghost→threshold). Zone crossing events published. HUD bar with zone-colored fill.
- **Inhibitor** — pressure from signal + time + well growth. 3 forms: Glitch (pulsing magenta bleed), Swarm (hunting mass, cargo drain), Vessel (geometric, instant kill, portal blocking). Final portal guarantee. Renders in display shader via new uniform block.
- **Fauna** — drift jellies (ambient, always present, teal glow) + signal blooms (spawn near signal sources, purple flicker). Server physics + collision + signal spikes. Canvas rendering.
- **Gradient sentries** — 2-3 per well, orbit at ringOuter×1.2-1.8, lunge at intruders, push toward well. Green segmented body. First active tier catalog entry.
- **AI players** — 5 personalities (Prospector/Raider/Vulture/Ghost/Desperado) running full game loop. Wreck/portal scoring, extraction decisions, current-aware navigation via analytical flow model. 3 AI per run, same physics/inventory/signal as humans. Render via existing remotePlayers pipeline.

### Config Changes
- **Well accretion colors** — shifted from amber/red to gold/white-hot. nearWell: [1.0, 0.85, 0.4], hotWell: [1.0, 0.95, 0.8]. 85° hue gap from inhibitor magenta.

---

## 2026-03-31 (Week 2 Day 7: Explicit Per-Player Force Budgets)

### scripts/ — Modified
- **sim-runtime.js** — Map-scale authoritative profiles now carry explicit per-player budgets for well influences, wave influences, pickup checks, and portal checks.
- **sim-runtime.js** — Authoritative player motion, extraction, and pickup truth now use capped nearest-source sets instead of scanning every well, wave ring, wreck, and portal on every player tick.

### tests/ — Modified
- **sim-scale.js** — Extends deterministic scale coverage to assert the new per-player force-budget fields for medium and large sessions.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Large-map server clocks, relevance radii, and AI budgets were not enough while each alive player could still sum against every force source every tick. This slice gives authoritative player motion and extraction an explicit per-player cost ceiling.

## 2026-03-31 (Week 2 Day 7: Explicit AI and Per-Player Hazard Budgets)

### scripts/ — Modified
- **sim-runtime.js** — Map-scale authoritative profiles now carry explicit AI spawn budgets and per-player relevance caps for stars, planetoids, wrecks, and scavengers instead of only clock budgets.
- **sim-runtime.js** — The server now spawns scavengers from those budgets and caps how many nearby hazards and AI entities each alive player can force into the expensive update path on larger maps.

### tests/ — Modified
- **sim-scale.js** — Extends deterministic scale coverage to assert the new AI and per-player hazard budget fields, plus a high-player `deep-field` spawn-budget case.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Clock scaling and spatial relevance were necessary, but they still left larger sessions without an explicit per-player budget. This slice makes the authoritative cost model more honest for 4–8 player targets: the server now advertises how much ambient AI and nearby hazard work a larger session is actually allowed to create.

## 2026-03-31 (Week 2 Day 7: Spatial Relevance Gating for Authoritative Scale)

### scripts/ — Modified
- **sim-runtime.js** — Large-map authoritative sessions now advertise per-profile relevance radii in addition to clock budgets. Stars, wrecks, planetoids, and scavenger AI no longer run full background updates everywhere in the world; they only fully tick when near alive players, while dying scavengers still finish their consequence chains authoritatively.
- **sim-runtime.js** — Player-contact systems now reuse those relevance-filtered entity sets, so larger maps stop paying whole-world scan costs just to apply nearby star push, planetoid push, scavenger bump, and wreck pickup truth.

### tests/ — Modified
- **sim-scale.js** — Extends deterministic scale coverage to assert the new map-sized relevance radii in `/maps` and live session state.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Clock scaling alone was not enough. `5x5` and `10x10` sessions still burned cost by scanning and updating off-player entities every background tick. This slice adds the first spatial relevance budget to the authoritative sim so larger worlds stop acting like every star, wreck, planetoid, and scavenger matters equally all the time.

## 2026-03-30 (Week 2 Day 6: Map-Scale Authoritative Sim Profiles)

### scripts/ — Modified
- **sim-runtime.js** — The authoritative sim now applies explicit map-scale server profiles. `shallows`, `expanse`, and `deep-field` no longer share one clock budget; larger worlds now run with cheaper `tickHz`, `snapshotHz`, and slower background-world cadences for stars, wrecks, planetoids, portals, growth, scavengers, and wave maintenance.
- **sim-runtime.js** — `/maps` now advertises those server-side scale clocks so the rest of the stack can inspect the real authoritative budget instead of guessing.

### src/ — Modified
- **sim/sim-client.js** — The browser client now adapts its polling interval to the authoritative session’s `snapshotHz` instead of hammering every map with the small-map snapshot cadence.

### tests/ — Modified
- **sim-scale.js** — Adds deterministic regression coverage for the authoritative scale profiles and proves that `expanse` and `deep-field` start with cheaper clocks than `shallows`.
- **run-all.js** — Wires the new scale suite into `npm test`.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The process boundary was real, but the server was still over-simulating large maps as if every world deserved the same small-map cadence. This slice is the first explicit cost-model correction: player/contact truth stays responsive, background world systems slow down with map size.

## 2026-03-30 (Week 2 Day 6: Explicit Remote Host/Join Control Plane)

### src/ — Modified
- **main.js** — The remote browser now keeps a lightweight live-session health view and exposes real control-plane truth during map select: live map, host identity, player count, whether this browser is host, and whether the selected map differs from the live run.
- **main.js** — Remote map select now distinguishes `space/A` as join-or-host and `X/Y` as the host-only reset action for the selected map instead of treating every remote launch as an implicit fresh host action.
- **test-api.js** — Network inspection now exposes remote host/session state, and the test API can explicitly request a host reset path.

### tests/ — Modified
- **remote-authority.js** — The remote smoke now proves the first browser reports host authority, and a second browser sitting on map select can see that it will join the live shallows run rather than resetting it to its own different selected map.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The server already had real host semantics, but the client was still lying by omission. This slice makes the control plane explicit so private multiplayer no longer feels like hidden server behavior.

## 2026-03-29 (Week 2 Day 5: Authoritative Remote Inventory Mutation)

### scripts/ — Modified
- **sim-runtime.js** — Adds authoritative inventory/loadout mutation for remote runs (`dropCargo`, `equipCargo`, `loadConsumable`, `unequip`, `unloadConsumable`), authoritative dropped-item wreck spawning, and fixes the server cargo model to use the same fixed eight-slot layout as the client.
- **sim-protocol.js** — Adds the `inventoryAction` request envelope alongside continuous input.

### src/ — Modified
- **main.js** — Remote runs now support inventory UI navigation and confirm actions without falling back to local inventory mutation.
- **hud.js** — Exposes the current inventory intent as an action description so local and remote modes can share the same cursor semantics.
- **sim/sim-client.js** — Adds a discrete remote inventory mutation request path.
- **test-api.js** — Adds profile seeding for equipped artifacts so remote loadout mutation can be exercised honestly.

### tests/ — Modified
- **remote-authority.js** — Extends the remote-authority suite to verify authoritative unequip/equip behavior through the real protocol.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Remote runs were still lying about one core gameplay surface: opening the inventory and changing your loadout still mutated only local UI state. This slice moves those actions over the network boundary and fixes the server inventory model so it matches the client’s real eight-slot cargo semantics.

### Follow-through
- Remote clients on the same map now join the running authoritative session instead of blindly resetting it. The remote-authority suite now proves that second-client path.

## 2026-03-28 Design Day — Signal, Color, Inhibitor, Entity Hierarchy, AI Players

Major design session. No code changes — Codex running server architecture work in parallel (moving gameplay systems server-side, authoritative snapshots, client sync). All design work stays design-only until hard tech lands.

### Decisions Locked
- **Inhibitor wake: threshold + variance (C)** — random threshold per run (0.82-0.98). EVE wormhole pattern.
- **Signal equipment: shaping with costs (C)** — every signal benefit has a non-signal downside.
- **Multiplayer signal visibility: visual cues (B)** — ship glow/trail reveals approximate signal level.
- **Entity hierarchy: 4 tiers** — ambient (texture/tells), active (singular-directive obstacles), adversarial (AI players), existential (Inhibitor). Seed selects from catalog per run.
- **AI player count: 4-8 per run** — humans replace AI slots on join. Solo is always full.
- **AI visibility/detection range:** deferred — interesting but not load-bearing yet.
- **Scope: push toward real game** — no jam constraints, scope creep goes to roadmap.

### New Design Docs (7 total)
1. **COLOR-SEPARATION.md** — Wells shift gold/white-hot (was amber/red). Inhibitors own magenta/fuchsia. 85° hue gap. Config-only change: `nearWell: [1.0, 0.85, 0.4]`, `hotWell: [1.0, 0.95, 0.8]`.
2. **INHIBITOR-IMPLEMENTATION.md** — 11-step build order. Shader strategy: new uniform block in FRAG_DISPLAY + FRAG_ASCII. ~300 lines InhibitorSystem, ~80 lines shader.
3. **SCAVENGERS-V2.md** — Signal-reactive scavenger AI (superseded by ENTITY-CATALOG.md, kept for reference).
4. **FAUNA.md** — Three fauna types (superseded by ENTITY-CATALOG.md, kept for reference).
5. **ENTITY-CATALOG.md** — Four-tier entity hierarchy. 17 entity types total, 7-10 active per seed. Replaces scavenger/fauna split with structured catalog.
6. **AI-PLAYERS.md** — Adversarial AI running full player game loop. 5 personalities (Prospector/Raider/Vulture/Ghost/Desperado) as weight tables on shared decision code. Current-aware navigation via analytical flow model. Server-side, ~1100 lines, 6 build phases. Character classes emerged from first principles — same toolkit, different weights.
7. **SIGNAL-SYSTEM.md** — Updated: 3 open decisions now locked.

### Architecture Notes
- AI players live server-side in `tickAIPlayers()`, same loop as `tickScavengers()`
- Analytical flow model (well positions → tangential flow) gives AI current-awareness without GPU
- Multiplayer slot replacement: server starts N AI slots, humans replace on join
- Naming collision: "Drifter" used for both comets (planetoids.js) and scavenger archetype — needs rename

### What's Blocked on Codex
- Color separation config change (trivial but waiting for stable codebase)
- Inhibitor implementation (needs signal system, which needs stable main.js)
- AI player implementation (needs server architecture complete)
- Entity catalog integration with map generator

### What's Still Open
- Slingshot V2: 5 pending decisions
- Megastructures: remaining questions (well consumption, signal interaction, art direction)
- AI player extraction visibility (do you see their haul?)
- Active entity naming (mechanical vs lore-friendly)
- Drifter/comet naming collision resolution

---

## 2026-03-27 Drift, Audio Revamp, Code Review

### Gameplay
- **Wreck drift** — all wrecks now fall toward wells at ~10% of ship gravity. Loot has a natural lifespan. CONFIG tunable.
- **Scavenger death drops** — scavengers scatter collected loot as debris wrecks when consumed by wells, ejected outward with drift back.
- **Star consumption remnants** — wells eating stars spawn vault-tier wrecks "Remnant of [star name]" with rare loot.
- **Hull upgrade wired** — grace period on well contact (0.3-0.5s by rank), rank 2+ gets one free survive per run.
- **Sensor upgrade wired** — proximity label fade distances scale with rank (0.15/0.4 → 0.3/0.85).

### Audio
- **SNES-flavored audio engine** — full rewrite with stacked LPF (BRR + Gaussian), 12-bit waveshaper, SPC700-style feedback echo.
- **27 sound events** — 11 gameplay (loot, pulse, shield, time slow, breach, star consumed, etc), 10 menu/UI (cursor, confirm, sell, equip, upgrade, error), 4 ambient, 2 spatial.
- **Context-aware states** — title (deep drone), menu (quiet ambient), gameplay (full audio), meta (quiet).
- **SNES character** — pulse-width square waves, warm low-pass filtering, echo with darkening feedback.

### Visual Polish
- Hull grace: red screen edge pulse when in kill zone
- Well proximity: subtle red vignette approaching wells
- Upgrade preview: shows stat change before purchase
- Item descriptions in vault subscreen
- Edge indicators for off-screen wells (red) and nearest wreck (gold)

### Meta Screen
- Ship tab: cursor navigation on loadout, unequip/remove back to vault
- Vault sorting: auto-sorts by category → tier → value
- Profile delete: confirmation step before deleting
- Death tax display: shows EM lost on death screen

### Code Review
- Full audit after 2 days of churn: 0 bugs in 11 files reviewed
- Fixed critical audio memory leak (voices never disconnected)
- Fixed per-frame distortion curve allocation (cached)
- Safari AudioContext fallback added
- Initialized _fullWarningShown in inventory

### Tests
- New systems test suite (10 tests): stars, comets, wrecks, drift, scavengers, profiles
- 7 test suites, 31+ tests total

---

## 2026-03-26-27 Flavor Pass + Meta Flow

### Entity Identity
- **4 star types** — yellow dwarf, red giant, white dwarf, neutron star with distinct visuals
- **Comets** — planetoids converted to teardrop bodies with canvas tails and names
- **Wreck shapes** — derelict (broken hull), debris (scattered dots), vault (golden diamond)
- **Scavenger factions** — Collector/Reaper/Warden with themed callsigns
- **Proximity labels** — distance-based fade on all entities: wells, stars, comets, wrecks, scavengers
- **Star orbital systems** — 2-4 asteroids per star, slow drift, dramatic well consumption

### Meta Flow
- **Profile system** — 3 save slots, random name generator, localStorage persistence
- **Home screen** — 4 tabs (SHIP/VAULT/UPGRADES/LAUNCH), canvas-rendered
- **6 upgrade tracks** — thrust/hull/coupling/drag/sensor/vault, 3 ranks each, component + EM costs
- **Full loop** — title → profile → home → map → play → home (both death and extract)

### Removals
- Loot anchors (src/loot.js) — replaced with stars, positions converted
- vault.js — replaced by profile.js

---

## 2026-03-25 Night Shift: Ring Scaling, Effects, Vault

### Tuning
- **Sqrt ring scaling** — accretion rings now grow at sqrt(WORLD_SCALE × FLUID_REF_SCALE) instead of linear WORLD_SCALE. 10x10 mega-well drops from 48% to 16% of screen. Cached on map load (zero per-frame cost).

### Gameplay
- **Consumable effects wired** — timeSlowLocal (30% ship dt, 3s, purple vignette), breachFlare (spawns unstable portal near ship for 15s), signalPurge (stub until signal system).
- **Vault + meta screen** — localStorage persistence for exotic matter, vault items, run stats. Extraction → "SALVAGE REPORT" → drop back in. Death skips vault.

### Refactor
- **Dead shader code removed** — negVis/voidField/liveSpace path in display shader was always 0/0/1.0 after star clearing removal. 18 lines cleaned up.

### Tests
- **4 new inventory tests** — equip from cargo, load consumable, use consumable, swap when full. 18 total.

### Design Docs
- **RING-SCALE.md** — full analysis of 4 scaling options with per-well screen coverage tables
- **VISUAL-DENSITY.md** — buffer architecture, reader/writer map, cross-talk risks, design rule (no subtractive signals)

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

## 2026-03-27 (Week 2 Day 3: Network Architecture Direction)

### docs/project/ — New Files
- **NETWORK-ARCHITECTURE-PLAN.md** — Defines the next-step architecture beyond the in-process sim boundary: mini-hosted authoritative sim, MacBook local-rendering client, first local protocol, hosted run-instance future, and deferred native/Godot migration.

### docs/project/ — Modified
- **SIM-DECOUPLING-PLAN.md** — Links the local sim split to the larger network plan so the current decoupling work has an explicit next destination.
- **BACKLOG.md** — Adds the next-week architecture batch (`mini server + MacBook client`, `local protocol freeze`) and parks hosted instances and Godot/native client work in the right order.
- **WEEK2-STATUS.md** — Adds a concrete next-week architecture focus section so the roadmap does not blur private remote play with public hosting or engine migration.

### Why
The architecture discussion stopped being hypothetical. LBH is multiplayer-first with solo fallback, and the immediate next move is not public hosting or a port. It is a private authoritative split between Greg's machines plus the first stable client/server protocol that later hosting can reuse.

## 2026-03-27 (Week 2 Day 3: First Local Sim Server Slice)

### scripts/ — New Files
- **sim-protocol.js** — Freezes the first plain-data local protocol constants and the input envelope normalization for the mini-hosted sim path.
- **sim-runtime.js** — Adds a separate authoritative sim server shell with a fixed tick, in-memory session state, snapshots, events, and input ingestion over HTTP.
- **sim-server.js** — Adds PID-managed start/stop/status/restart control for the local sim server, parallel to the existing dev server tooling.

### docs/project/ — New Files
- **LOCAL-PROTOCOL.md** — Documents the first client/server contract: join, input, snapshot, events, and session start.

### package.json — Modified
- Adds `npm run sim`, `sim:stop`, `sim:status`, and `sim:restart`.

### Why
The sim/client split needed to stop being only a design note. This first slice gives LBH a separate authoritative process shell and a concrete local protocol without pretending the full gameplay sim already lives there.

## 2026-03-27 (Week 2 Day 3: Real Map Authority in Sim Server)

### scripts/ — New Files
- **shared-map-loader.js** — Reads the current playable map definitions into Node so the sim server can own real run content instead of a dummy scene.

### scripts/ — Modified
- **sim-runtime.js** — Session start now loads real playable maps, authoritative snapshots now carry wells/stars/wrecks/planetoids, joins now spawn at safe positions, and the server now applies well gravity, well death, and timed respawn.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md** — Documents the new `GET /maps` endpoint, world entity snapshots, and the fact that the server already owns session state, map state, and well death/respawn.
- **NETWORK-ARCHITECTURE-PLAN.md** — Notes current progress so the architecture doc matches the actual code, not just the intended direction.

### Why
The first server shell was too small to prove much. This pass moves real run authority into the separate process: actual maps, actual entities, authoritative spawning, and the first piece of real gameplay consequence outside the client loop.

## 2026-03-27 (Week 2 Day 3: Remote-Authority Browser Client)

### src/sim/ — New Files
- **sim-client.js** — Adds the browser-side HTTP client for the local LBH protocol, including session start/reset, join, input, and snapshot polling.

### src/ — Modified
- **main.js** — Adds remote-authority mode behind `?simServer=...`, starts a fresh authoritative run from map select, applies authoritative snapshots to the local ship, and keeps the browser renderer running as a local client instead of local gameplay authority.
- **test-api.js** — Adds remote-network status helpers and a remote start hook so the path can be smoke-tested automatically.

### scripts/ — Modified
- **sim-runtime.js** — Removes the toy timed respawn behavior so well death matches the real run/reset flow more closely.
- **sim-server.js** — Adds host/port overrides via CLI/env so the sim can bind beyond localhost for Tailscale/LAN use.

### tests/ — Modified
- **physics.js** — Tightens the well-pull check so it measures inward radial pull directly instead of being confused by tangential orbital flow.

### docs/ — Modified
- **project/LOCAL-PROTOCOL.md** — Documents the remote browser client path, host binding, and the current authority split.
- **project/NETWORK-ARCHITECTURE-PLAN.md** — Updates next-step progress to reflect that the browser can now consume authoritative snapshots.

### Why
The architecture stopped being only a separate server process. The browser now has a real remote-authority path: it can start a run on the sim server, join it, send input across the boundary, and render locally from authoritative snapshots.

## 2026-03-28 (Week 2 Day 4: Server-Owned Run Progression and Loot)

### scripts/ — Modified
- **sim-runtime.js** — The sim server now owns portal waves, portal expiry, extraction checks, wreck pickup, cargo truth, cargo loss on death, well growth, and the first gameplay-affecting equip effect (`reduceWellPull`).

### src/ — Modified
- **main.js** — The remote client now syncs portal snapshots and authoritative cargo/loadout state from the server, and transitions into the escaped run state from authoritative status instead of local extraction checks.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md** — Records that the server now owns remote run progression beyond movement alone.
- **NETWORK-ARCHITECTURE-PLAN.md** — Updates the current progress section so it matches the new server-owned run systems.

### Why
The remote path needed to stop being just a movement demo. This slice moves real run authority over: portals now exist on the server, extraction is authoritative, loot pickup is authoritative, and remote runs now keep or lose cargo based on server truth.

## 2026-03-28 (Week 2 Day 4: Chrome DevTools MCP Integrated Into Workflow)

### project root — Existing config adopted
- **.mcp.json** — Project-scoped Chrome DevTools MCP server config is now treated as part of the LBH toolchain.

### docs/reference/ — Modified
- **DEV-SERVER.md** — Documents how Chrome DevTools MCP fits alongside the dev server, harness server, and sim server.
- **RENDERER-HARNESS.md** — Clarifies that MCP complements the deterministic harness instead of replacing it.

### Why
LBH now has two browser-testing layers with different jobs. Puppeteer remains the deterministic test path. Chrome DevTools MCP is the live browser inspection and perf-debug layer for renderer work, menu/meta flow debugging, and remote-authority inspection.

## 2026-03-30 (Week 2 Day 6: Server-Owned Hazard Contact and Remote Force Validation)

### scripts/ — Modified
- **sim-runtime.js** — The sim server now applies star push, planetoid/comet push, and scavenger bump collision to authoritative players instead of leaving those forces in the local-only gameplay loop. It also now spawns stellar-remnant wrecks when stars are consumed by wells and exposes a small debug player-state hook used by the remote-authority suite.

### src/ — Modified
- **main.js** — Remote clients now react to authoritative `star.consumed` events with the same warning/audio/star-flash feedback as the local path instead of silently relying on local side effects. They also now replay authoritative pulse/growth/consumption wave events and keep those wave rings updating/injecting locally during remote visual mode.
- **combat.js** — Added a visual-only remote pulse reconstruction path so authoritative `player.pulse` events now recreate fluid splats, shockwave rings, and well-disruption presentation locally without reapplying gameplay truth on the client.
- **remote-authority.js** — The remote suite now moves the player near a real well before pulsing and proves that authoritative pulses create visible well-disruption state on the client instead of only emitting the protocol event.
- **main.js** — Remote browser startup no longer treats the later client's local map selection as a hidden reset request. If an authoritative session is already live, the client now loads that session's map and joins it by default.
- **main.js** — Remote death/extraction flows now leave the authoritative session cleanly instead of resetting the whole server run when one client is done.
- **sim/sim-client.js** — Adds an explicit `leave()` request for remote clients.
- **sim/sim-client.js** — Session control calls now identify the requester, which lets the server enforce host-owned start/reset authority.

### tests/ — Modified
- **remote-authority.js** — Adds a real authoritative hazard-force check, proves the server-owned force math directly, and now also verifies that a second browser asking for the wrong map still joins the live authoritative run instead of resetting it.
- **remote-authority.js** — Also now verifies that a browser-backed remote client can leave cleanly without destroying the session.
- **remote-authority.js** — Now also verifies that the first browser becomes host, non-host reset requests are denied, and host promotion happens when the host leaves.

### scripts/ — Modified
- **sim-runtime.js** — Adds `POST /leave` so the server can drop a client from a live authoritative run without resetting session state.
- **sim-runtime.js** — The authoritative session now tracks a real host, restricts start/reset to that host, and promotes a new host when the old one leaves.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The protocol and remote path were already real, but remote runs still lied about some moment-to-moment survival contact. The server now owns the remaining ship hazard pushes that mattered most, which makes the remote client closer to a true presentation/input layer instead of a partially authoritative hybrid.

## 2026-03-28 (Week 2 Day 4: Honest Menu and Remote Test Coverage)

### tests/ — Modified
- **helpers.js** — Adds dedicated sim-server helpers, explicit key dispatch, and generic wait support so browser-path tests can drive the real UI more reliably.
- **run-all.js** — Adds new `MetaFlow` and `RemoteAuthority` suites to the default deterministic harness.
- **meta-flow.js** — Adds real title → profileSelect → home → mapSelect → playing coverage without using `triggerRestart()`.
- **remote-authority.js** — Adds a real browser smoke that starts a dedicated sim server, launches the client with `?simServer=...`, and verifies authoritative snapshots and movement.

### Why
The existing suite was still too willing to bypass the exact surfaces that were changing most: the profile/home flow and the remote-authority path. These new suites keep Puppeteer as deterministic truth, but stop pretending helper shortcuts are enough on their own.

## 2026-03-28 (Week 2 Day 4: Server-Owned Scavengers in Remote Runs)

### scripts/ — Modified
- **sim-runtime.js** — Adds simple authoritative scavenger spawning, state, loot/extract decisions, motion, and snapshot serialization for remote runs.

### src/ — Modified
- **main.js** — Syncs authoritative scavenger snapshots back into the client so remote runs render rivals from server truth instead of local AI.

### tests/ — Modified
- **remote-authority.js** — Verifies that remote-authority snapshots now include visible scavengers.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The remote path was still too empty to count as a real competitive run. Server-owned scavengers make the mini-hosted authority feel more like the actual game while keeping the client in a rendering role.

## 2026-03-28 (Week 2 Day 4: Server-Owned Consumables and Pulse Authority)

### scripts/ — Modified
- **sim-runtime.js** — The sim server now owns remote consumable activation, active effect timers/state, shield absorption at well contact, breach-flare portal spawning, and authoritative pulse cooldown/events. One-shot remote actions are preserved across input frames instead of being stomped by later no-op inputs.
- **sim-protocol.js** — Extends the input envelope with `consumeSlot` so the client can request authoritative item use directly.

### src/ — Modified
- **main.js** — Remote runs now sync active effect state and pulse cooldown from authoritative snapshots and play local audio/warning feedback from remote events instead of assuming local item truth.
- **main.js** — Remote world sync now fully reconciles dynamic stars, wrecks, and planetoids instead of only patching shared index ranges. That makes authoritative dropped-item wrecks and other server-spawned entities actually appear on remote clients.
- **sim-runtime.js** — Remote scavengers now die the same way the authoritative world says they die: they enter a death spiral, finish on the server, and scatter debris wrecks there instead of disappearing instantly. The sim now also exposes a debug scavenger-state hook for remote-authority validation.
- **main.js** — Remote clients now consume explicit `scavenger.extracted` and `scavenger.consumed` events instead of inferring those outcomes only from portal counts or local-only death-drop queues.
- **test-api.js / remote-authority.js** — Remote coverage now sees scavenger ids, can force authoritative scavenger hazard cases, and proves that remote scavenger deaths create debris wrecks on the client.
- **main.js / test-api.js** — Remote snapshots now preserve a separate `remotePlayers` set, and the overlay renders other authoritative players instead of throwing them away. The test API exposes that set so remote-authority coverage can prove the first browser sees a second joined client.
- **remote-authority.js** — Remote inventory coverage now proves that dropping cargo on the server produces a new wreck on the browser client instead of only mutating server-side state.
- **sim/sim-client.js** — `join()` now actually sends equipped and consumable loadout state, and `sendInput()` can now carry `consumeSlot`.
- **test-api.js** — Adds lightweight profile seeding and remote input hooks for honest protocol tests.

### tests/ — Modified
- **remote-authority.js** — Extends remote coverage so the suite now proves authoritative consumable use and authoritative pulse events instead of stopping at movement alone.

### docs/project/ — Modified
- **LOCAL-PROTOCOL.md**
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
Remote authority was still only half-true. The server could own movement, loot, and scavengers, but the client was still pretending consumables and pulse timing were local. This slice moves those systems over so a remote run is closer to the real game instead of a movement demo wrapped around local gameplay shortcuts.

## 2026-03-31 (Week 3 Day 2: Next Architecture Phase Defined)

### docs/project/ — Added
- **PLAYER-BRAIN-AND-OVERLOAD-PLAN.md** — Detailed design for the post-migration architecture phase: boxed server-side player truth, explicit overload states, coarse authoritative flow/hazard fields for larger maps, and session profiles for 1/4/8-player intents.

### docs/project/ — Modified
- **NETWORK-ARCHITECTURE-PLAN.md** — Adds the next architecture batch after the first migration: `PlayerBrain`, overload state machine, coarse field authority, and session profiles.
- **BACKLOG.md** — Adds explicit backlog/design entries for `PlayerBrain`, overload states, coarse authoritative field work, and session-profile design.

### Why
The client/server split is real enough now that the next problem is no longer process separation. The next problem is keeping the authoritative server coherent and affordable as map size, player count, and sim fidelity increase.

## 2026-03-31 (Week 3 Day 2: Persistence and Control Plane Defined)

### docs/project/ — Added
- **PERSISTENCE-AND-CONTROL-PLANE-PLAN.md** — Defines the durable architecture outside the sim instance: persistent profile store, control-plane/session registry, disposable run instances, result write-back boundaries, and the first sensible deployment shape.

### docs/project/ — Modified
- **NETWORK-ARCHITECTURE-PLAN.md** — Clarifies the long-term three-layer server shape: persistent data/control plane, authoritative sim instances, and connected rendering clients.
- **PLAYER-BRAIN-AND-OVERLOAD-PLAN.md** — Links the next architecture phase to the durable persistence/control-plane layer instead of treating the sim instance as the whole backend.
- **BACKLOG.md** — Adds explicit architecture backlog entries for persistent data, control-plane/session registry, and run result write-back boundaries.

### Why
The client/server split is now real enough that the next durable question is no longer just simulation. Player persistence and session orchestration need to live outside disposable run instances.

## 2026-03-31 (Week 3 Day 2: First Persistent Control Plane Slice)

### scripts/ — Added
- **control-plane-store.js** — Adds the first durable JSON-backed persistence layer for profiles, run outcomes, and session metadata outside the disposable sim instance.
- **session-registry.js** — Adds a lightweight on-disk session-registry wrapper so live authoritative session state can be mirrored outside the hot simulation loop.

### scripts/ — Modified
- **sim-runtime.js** — The sim server now bootstraps durable profiles on join, assigns profile ids to live players, writes back authoritative death/extraction/abandon outcomes, exposes `/profile`, and mirrors session state into the control-plane/session-registry layer.

### src/ — Modified
- **profile.js** — Profiles now carry a stable id and can export/replace the active durable profile, which allows the browser client to resync local save data from the authoritative server after a remote run.
- **sim/sim-client.js** — Remote start/join now carry profile bootstrap data, and the client can fetch an authoritative profile snapshot by id.
- **main.js** — Remote run startup now bootstraps the server with the active profile, and remote death/extraction flows now resync the local profile from authoritative persistence instead of mutating local save state independently.
- **test-api.js** — Exposes profile ids so remote-authority coverage can verify durable server-side write-back honestly.

### tests/ — Modified
- **remote-authority.js** — Adds a real persistence check: remote death now proves the authoritative profile increments deaths and preserves consumed loadout state.

### docs/project/ — Modified
- **NETWORK-ARCHITECTURE-PLAN.md**

### Why
The authoritative sim could already run a session, but it still had no durable memory outside the process. This slice makes the control-plane boundary real: players now join with stable profile ids, the server owns write-back on death/extraction/leave, and the browser syncs back from server truth instead of pretending local storage is still the source of record after a remote run.
## 2026-04-02 — Sim lifecycle hardening, not just sim architecture

The new control-plane + sim stack proved the right shape, but the first live fault was not theoretical. Starting the three LBH processes locally could still grind the machine because stale detached test sims survived failures, and the main sim process could remain alive doing unnecessary work even when no human clients were connected.

This slice does two things. First, the sim now drops to an idle loop when there are zero human clients instead of continuing full run progression. Second, the test harness now cleans up per-port sim/control-plane processes much more aggressively so detached remote-authority runs stop lingering as hidden CPU burners.

The next lifecycle step was explicit, and it is now landed: empty sims now auto-stop after a short grace window, `keep-alive` is opt-in instead of accidental, `sim:status` explains whether a process is idle and when it will stop, and the harness now carries a deterministic `SimLifecycle` suite so this does not quietly regress again.
