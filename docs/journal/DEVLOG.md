# Last Black Hole — Development Journal

> A running log of the game jam, newest entries first.
> Started pre-jam March 14, 2026. Code starts Monday March 16, 12:01a.

---

## Week 4, Day 2: April 13, 2026 — The Harness Starts Trusting the Logs

This was a good little truth pass.

We had already added structured runtime telemetry for the dev server, control plane, sim, and stack launcher. That was useful, but it still lived in an awkward limbo: important enough for humans to rely on, not yet important enough for the harness to verify. That is exactly how operator tooling quietly rots.

So the fix was to give telemetry its own smoke lane. Not a giant new integration suite, just one clear canary that boots the real distributed stack and asserts the events we actually care about: runtime start, profile bootstrap, session start, and player join. The helper layer now captures harness logs directly, so the test is checking the real structured output rather than pretending console text is “close enough.”

That also cleaned up the docs. The harness now says out loud that telemetry is part of the architecture contract, and the build-health docs now explain that `npm test` covers that lane by default.

## Week 4, Day 1¾: April 12, 2026 — The Desktop Build Learns to Explain Itself

The next two productization tasks were the right pair to do together.

First, the packaged Electron app stopped being a black box. It now has a real stack-status window for the embedded control plane and sim, so the local app can answer basic operator questions without punting straight to the terminal. That matters because the product has already outgrown the old “just double-click it and hope” posture.

Second, the first actual content manifest came out of the runtime. Hull identity, rig tracks, and AI hull assignment now live in a dedicated hull manifest instead of being smeared across `player-brain.js`, `sim-runtime.js`, and the docs. It is a small extraction, but it is the right one: enough to reduce drift, not so much that it becomes architecture cosplay.

The theme stayed the same as the earlier productization pass: keep the original intent intact, make the current stack easier to understand, and make future feature work less likely to cut across hidden truths.

## Week 4, Day 1: April 12, 2026 — The Product Shape Becomes Visible

## Week 4, Day 1½: April 12, 2026 — The Stack Starts Explaining Itself

The next productization slice was observability. LBH now emits lightweight structured runtime events into the existing log files for the dev server, control plane, sim, and stack launcher. That is enough to make the local multi-process stack understandable without inventing a whole analytics backend. We also hardened the gravity-well physics test so it checks the ship-level outcome across multiple spawn angles, which matches the actual game better than one short drift sample.

### The Story

This was a long-form architectural review through a new lens: not just "does the code work?" but "does LBH look like a real mac app and a real game project yet?" The answer was encouraging. The hard work is already done. The sim is authoritative. The control plane is real. The client is a client. The test harness has grown teeth.

The gaps were not foundational anymore. They were product gaps.

The most important one: the code had already moved further than the docs. The packaged Electron app embeds the control plane and sim, but parts of the project still talked as if desktop builds were only thin rendering clients. That kind of mismatch is how teams lose time — the product becomes more real than the language around it.

So the work today shifted from abstract architecture toward productization:

- explicit runtime modes
- one canonical stack launcher
- better stack status
- the first design-system bridge into implementation code

### What Changed

- Added explicit runtime modes (`local-browser`, `local-host`, `remote-client`, `embedded-desktop`, `test-harness`) and documented them.
- Added `scripts/stack.js` as the canonical stack launcher/status surface.
- Repointed `npm start` and the old play/stop muscle-memory scripts at the new stack contract.
- Added a first implementation-side design token layer and HUD primitives so future UI work stops repeating colors, shadows, and selection styling ad hoc.
- Started moving HUD implementation away from one-off inline style strings.

### Why It Matters

LBH no longer needs another large architecture rewrite. It needs to become easier to launch, easier to inspect, and harder to accidentally restyle or misdescribe.

That is good news. It means the architecture work actually succeeded. We are not rebuilding the game. We are starting to turn the current stack into a better product surface for the next round of feature work.

## How to Read This

Each entry covers a day (or shift). Entries include what happened, why decisions were made, what was cut, and what questions remain. This is the raw creative record — designed to be mined later for content (threads, posts, videos).

---

## Week 3, Day 2: April 1, 2026 — The Architecture Stops Lying

### The Story

This was a review-and-truth pass, not a feature sprint. The whole codebase was already green, but one persistence seam had drifted out of alignment with the live game: the control-plane store had quietly widened the durable loadout to three equipped artifact slots while the actual client, HUD, tests, and local profile system still ship with two.

That kind of mismatch is dangerous because it hides inside “working” infrastructure. A remote profile can look fine in storage while the browser is still rendering and mutating a different shape. So the fix was simple and surgical: bring persistence back to the real runtime contract, make the remote client mirror authoritative inventory slot shapes honestly, and reset local scenes back to the shipped local shape instead of inheriting remote state forever.

### What Changed

- Durable profile/loadout normalization now respects the live `2 equipped + 2 consumable` contract.
- Remote snapshot application now mirrors authoritative slot counts instead of assuming local defaults.
- Local scene loads now explicitly reset inventory arrays back to the client’s local `8 cargo + 2 equip + 2 consumable` shape.
- The control-plane integration test now guards the persisted slot shape so this cannot drift silently again.
- Architecture docs now say the blunt truth: packaged builds are clients; real remote play still needs separate control-plane and sim processes.

### Why It Matters

This is the kind of work that keeps an architecture from becoming decorative. The client/server split is real now, so the failure mode changes: not “can we separate processes?” but “are all the boundaries telling the same story?” Today’s pass tightened one of those stories.

### Open Questions

1. When do we actually want to migrate to 3 artifact slots, and what else needs to move in the same slice?
2. When do we run the first real mini → MacBook Tailscale playtest instead of only local process-stack tests?
3. Do we want the next architecture slice to stay server/control-plane focused, or hand the lane back to features for a bit?

## Week 3, Day 1: March 30, 2026 — The Ecology Arrives

### The Story

Big feature build followed by a full audit against design docs. Six systems landed in one session:

**Signal** is the foundational risk/reward meter — a 0-1 float per player that rises from thrust (scaled by flow opposition), loot, combat, and well proximity. Six zones (ghost→threshold) with visual/behavioral tells. The key insight from implementation: thrust signal generation now uses actual flow alignment via analytical estimation, not a speed proxy. Fighting the current is loud; surfing with it is quiet. This is the mechanical heart of "Signal Is Consequence."

**Fauna** added the ambient tier — drift jellies (teal, always present, gentle bumps) and signal blooms (purple, attracted to noise sources, spawn rate scales with signal zone). They're the birds in the trees. You notice them when they're gone.

**Gradient sentries** orbit wells at 1.2-1.8× ring radius, lunging at intruders and pushing them toward the well. The push-toward-well mechanic is the key design move — they don't damage you, they reposition you into danger.

**AI players** are the big one: 5 personalities (Prospector/Raider/Vulture/Ghost/Desperado) running the full player game loop server-side. Same physics, same inventory, same signal. Personalities are weight tables on shared decision code — a Ghost samples 8 flow points and barely thrusts, a Raider samples 3 and goes full burn. Competition and threat scoring make them aware of each other and the Inhibitor.

**The Inhibitor** escalates through three forms driven by signal pressure: Glitch (corruption zone), Swarm (hunting mass with cargo drain + control debuff), Vessel (geometric instant-kill with portal blocking). The control debuff was missing from the initial build — the audit caught it.

### The Audit

Ran both research agents in parallel against every design document. Found:
- 2 dead config values (extractionRate, collisionSpike) — removed with rationale
- 1 critical missing mechanic (Swarm control debuff) — added
- 1 incorrect algorithm (thrust opposition using speed proxy) — fixed to use flow alignment
- 3 missing AI scoring factors (competition, threat, inhibitor blocking) — added
- 1 missing feature (personality-aware flow sampling) — added estimatePathAlignment()
- 5 deferred features correctly identified as separate build items (signal flares, equipment, HUD degradation, AI slot replacement, tendril rendering)

### What We Learned

The audit pattern works: implement fast, then run design-doc comparison agents before moving on. The initial build was ~85% correct by line count, but the 15% of gaps included design-breaking issues (thrust opposition, missing debuff) that would have been hard to catch later. The dead config values were the most interesting finding — they revealed places where the design doc described a mechanic that doesn't exist in the current game (extraction charge time, generic entity collisions).

### Commits

- Signal system — per-player 0-1 float, 6 zones, zone crossing events
- Inhibitor system — pressure, 3 forms, final portal guarantee
- Fauna — drift jellies + signal blooms
- Gradient sentries — well-orbit patrols
- AI players — 5 personalities, full game loop
- Audit fixes — flow alignment, control debuff, AI scoring, dead config cleanup

---

## Week 2, Day 3 Evening: March 27, 2026 — Everything Falls, Everything Sings

### The Story

Three big moves in the evening session:

**The drift system.** Greg asked "why doesn't loot obey gravity?" and the answer was it should. Wrecks now feel well gravity at ~10% of ship pull strength. They drift inward, accelerate near wells, and get consumed if they reach the kill radius. This single change cascaded: scavenger death now scatters loot as debris that drifts back toward the killing well (15-30s window), star consumption spawns a vault-tier remnant wreck that's already in danger. The universe's clock isn't a timer anymore — it's gravity.

**The audio revamp.** Rebuilt the entire audio engine with SNES character: stacked low-pass filters (BRR compression + Gaussian interpolation), 12-bit waveshaper bit crush, SPC700-style feedback echo with darkening filter. Pulse-width square waves instead of clean sines for that 16-bit timbre. 27 sound events covering every interaction: menu blips, upgrade arpeggios, shield shimmer, star consumption booms, debris clatter. Context-aware states switch between deep title drone and full gameplay audio.

**The code review.** After 2 days and 30+ commits of heavy churn, ran a full audit across all 11 source files. Found a critical memory leak in the audio engine (oscillators/voices never disconnected, accumulating in the Web Audio graph). Fixed with auto-disconnect timeouts. Everything else passed clean — phase transitions, state resets, coordinate math, entity systems all verified.

### What We Learned

The drift system is a case study in emergent design. One physics change (wrecks feel gravity) created natural urgency, made scavenger kills meaningful, turned star deaths into jackpot events, and made the late-game map evolve organically. No timers, no counters, just physics.

### Commits
- `1140552` — Wreck drift system
- `688724d` — Scavenger death drops + star remnants
- `52afc4d` — Systems test suite (10 new tests)
- `6f24c62` — Visual polish batch (hull warning, well proximity, upgrade preview, edge indicators)
- `04e6ebf` — Audio enabled
- `fab2bac` — SNES audio revamp (27 events, context states)
- `073a555` — Code review fixes (memory leaks, Safari, caching)

---

## Week 2, Days 2-3: March 26-27, 2026 — The Flavor Pass & The Meta Loop

### The Story

Two days of building the game's identity layer and progression system.

**Day 2 (March 26):** The flavor pass. Every object in the universe got a face. Stars split into 4 types with distinct color, size, and special effects (red giant corona, white dwarf lens flare, neutron star pulsar flash). Planetoids became comets with teardrop bodies and canvas tails. Wrecks got unique shapes per type (broken hull, scattered debris, golden diamond). Every entity got a procedural name and proximity-based flavor text labels that fade in as you approach.

Loot anchors (the old L objects) were revealed as decorative placeholders with no gameplay purpose — removed entirely and replaced with more stars. Maps bulked up: Shallows 2→5 stars, Expanse 3→11, Deep Field 6→22. The universe feels lived-in now.

**Day 3 (March 27):** The meta loop. Built the entire between-runs progression system from scratch: 3 save slots with player profiles, a home screen with 4 tabs (ship stats, vault, upgrades, launch), and the full flow: title → profile select → home → map select → play → home (on both death and extraction).

The upgrade system has 6 tracks (thrust/hull/coupling/drag/sensor/vault storage), each with 3 ranks. Rank 1 costs only exotic matter; ranks 2-3 require specific components (already defined in items.js). Hull gives grace period on well contact. Sensor extends proximity label range. Vault capacity starts at 25, expandable to 75. 10% EM death tax.

Codex caught real bugs twice: loadout not saving on death (item duplication), vault has no equip path (dead inventory). Both fixed same-day.

### What We Learned

The visual density buffer saga from Day 1 continued to pay dividends — removing the star clearing splat unblocked the star type system, which in turn made the flavor pass possible. Cleaning up architectural debt first made the creative work much easier.

The meta loop is the biggest architectural addition since the fluid sim. Three new game phases, a full save system, canvas-rendered UI with tab navigation — all in one session. It's rough but functional.

---

## Week 2, Day 1: March 25, 2026 — The Toroid Tax

### The Story

Came back after 5 days off to pick up Week 2. First task: visual bugs from the night shift work. Wells on the 3×3 map were inconsistent — W1/W3 showed accretion disks, W0/W2 didn't. Sharp boundary lines cut through the fabric where it should have been smooth.

Started with the display shader. The `dist` calculation used reference-scaled units (`length(diff) / uvS`) while the shape values from `getRenderShapes()` were in raw world-space. Off by a factor of 3 (FLUID_REF_SCALE). Rings for large-mass wells were so bloated their gradients were invisible — spread over the entire screen with no contrast.

Fixed that, but the hard edges persisted. Greg pushed: "investigate whether this is toroidal math or tile boundaries." Turned out to be the real bug. Two simulation shaders — `FRAG_SPLAT` and `FRAG_WELL_FORCE` — computed distance using straight-line UV math instead of toroidal shortest-path. Wells near texture boundaries had their gravity and density injection cut off at the edge. The fluid field had hard discontinuities baked in.

The fix was two lines (`diff = diff - round(diff)`) in each shader. Same pattern the display and dissipation shaders already used. The inconsistency was the bug.

### What We Learned

The coordinate system is a tax that keeps getting collected. This is the third round of UV/world-space fixes in two days. The pattern: something works on the title screen (well at UV center, no boundaries nearby) and breaks on gameplay maps (wells near edges, multiple coordinate spaces interacting). Documented a TOROIDAL WRAPPING RULE in fluid.js so the next person touching shaders knows the invariant.

Also flagged: ring screen coverage scales with WORLD_SCALE. The 10×10 mega-well's ring fills 126% of the visible area. Mathematically correct, possibly wrong for gameplay feel. Open design question for today.

Then Codex flagged two real gaps: no UI path to equip artifacts or load consumables from cargo, and item effects were metadata-only. Built the smart confirm (auto-equip/load based on subcategory), wired `showKillRadii` as the first real equippable effect and `shieldBurst` as the first real consumable.

Final bug of the day: W0 and W2 still looked suppressed even after the shader fixes. Traced it to stars injecting negative visual density every frame as a "clearing bubble." The accumulated negative density in the shared visual buffer was driving `liveSpace` to zero near Star 0, which happened to be ~0.67 world units from both W0 and W2. Removed the negative splat — the physics push already creates the clearing naturally.

Broader observation: the visual density buffer is fragile because it's a single shared channel. Negative injectors stomp positive signals. Worth considering separate buffers per system if more cross-talk emerges.

### Night Shift

Five more commits while Greg slept:

1. **Sqrt ring scaling** — per the RING-SCALE.md design doc, switched from linear to sqrt scaling for accretion ring size. 10x10 mega-well goes from 48% to 16% of screen. Cached the sqrt result on map load — zero per-frame cost.

2. **All consumable effects wired** — time slow (ship at 30% dt for 3s, purple vignette), breach flare (spawns an unstable portal near ship for 15s), signal purge (fires, consumes item, stub until signal system exists).

3. **Shader cleanup** — removed dead negVis/voidField/liveSpace code from display shader. Nothing injects negative visual density anymore, so these were always 0/0/1.0. 18 lines less.

4. **Inventory test coverage** — 4 new tests: equip artifact from cargo, load consumable to hotbar, use consumable returns effect + clears slot, swap when equip slots full. 18 inventory tests total.

5. **Vault + meta screen** — new vault.js with localStorage persistence. On extraction: cargo → vault → "SALVAGE REPORT" screen showing items, exotic matter gained, vault totals, best survival time. Space to drop back in. Death still goes straight to map select.

### Commits
- `96d95ab` — Fix: toroidal wrapping + world-space distance in display shader
- `924a1ac` — Docs: Week 2 Day 1 devlog
- `6c04bcb` — L1: wire equip/load/use loop, fix star clearing suppressing well rings
- `bf85b9e` — Docs: ring scale + visual density buffer design docs
- `b4941a4` — Tune: sqrt ring scaling
- `c8b1386` — L1: wire all consumable effects
- `0963b06` — Refactor: remove dead negVis/liveSpace shader code
- `c7f2a9a` — Tests: equip/load/use/swap loop validated
- `337f4f9` — L5: vault + meta screen skeleton
- `575d487` — Tune: cache accretionScale

---

## Day 5: March 20, 2026 — The Split (and the Teeth)

### The Story

The renderer had been drifting for two days. Night shifts kept churning the display shader — gravity field as primary brightness, then density as primary, then gravity capped, then density boosted — each iteration mathematically clever and visually worse. The title screen was black. Wells were unreadable. Greg called time.

Forge (Codex) wrote the RENDERER-RECOVERY-PLAN: stop treating `density` as the player-facing concept. Split the renderer into three layers (physics truth, scene shaping, ASCII presentation). Define four reads the player actually needs (void, accretion, flow, surf lane). Fix black holes first, everything else second.

The big move: **split the workstreams.** Forge owns the renderer. Claude/Orrery owns gameplay, content, and features. Orb routes and keeps them from colliding. Signal system parked until the renderer stabilizes.

Then Greg pivoted to what actually matters for the last three days: the game needs teeth.

### Key Decisions

**1. Non-lethal combat ships this week.**

The game loop (fly, loot, escape) works but it's thin. Three physics tools designed in detail:
- Force pulse (spacebar): radial shove, emergency escape, wave creation
- Signal flare (shift): decoy signal source, misdirects AI
- Tether (right-click): attach to wrecks/planetoids for anchoring or free travel

These affect physics and information, not hitpoints. They integrate with the fluid sim. They work against both AI and (future) human opponents.

**2. AI scavengers are the priority build.**

Not just for "life in the universe" — the scavenger movement architecture directly becomes the Inhibitor. Two archetypes: drifters (passive, ride currents) and vultures (competitive, race you for exits). Same ship physics as the player. When a scavenger extracts, that portal is gone.

**3. Gravity slingshot designed.**

Greg's most ambitious movement idea: use wells as grappling hooks. Approach at an angle, catch the orbital band, build speed, release with a 2-3x boost aimed at your target. Wells stop being just threats and become the movement system itself. Hybrid input model: auto-catch (the game assists when you're in a viable orbit), thrust-to-release (deliberate exit with boost). This is the skill ceiling for the whole game.

**4. Cosmic signatures give runs identity.**

Each run rolls a universe personality: "the slow tide" (calm, long), "the shattered merge" (violent, fast), "the graveyard" (rich wrecks, few exits), etc. CONFIG overrides + flavor text. Instant replay value, ~100 lines of pure JS.

**5. Audio foundation ships today.**

Drone (spacetime hum), well harmonics (one oscillator per well, stereo-panned), event sounds (thrust, loot, death, extraction). All Web Audio API synthesis. No samples, no libraries.

### Design Pivots

**Renderer ownership transferred.** Claude/Orrery had been doing renderer work (4 shader iterations in a single session, each worse than the last). The lesson: gameplay agents shouldn't be guessing at shader math. Forge has the renderer contract. Claude has the gameplay features. Clean split.

**Signal parked.** Signal is deeply tied to the renderer (visual feedback — ship glow, warm color shift, ASCII changes at high signal). Building it before the renderer stabilizes means building on sand. Revisit Saturday.

**Scavengers pulled forward from stretch goal.** The design doc had scavengers as a "if ahead of schedule" feature. Greg pulled them to Friday because (a) the world feels empty without other ships, (b) the AI architecture is needed for the Inhibitor anyway, and (c) portal consumption by AI creates the most organic time pressure in the game.

### What's Being Built (Friday)

| Feature | Est. Lines | Priority |
|---------|-----------|----------|
| AI Scavengers (drifters + vultures) | 300-400 | 1 |
| Force Pulse | 60-80 | 2 |
| Audio (drone + harmonics + events) | ~175 | 3 |
| Cosmic Signatures | ~100 | 4 |

### What's Queued (Saturday)

- Signal system (if renderer is ready)
- Signal flare (depends on signal)
- Tether
- HUD iteration
- Between-run progression
- Slingshot prototype

### What's Queued (Sunday)

- Inhibitor (uses scavenger architecture + signal threshold)
- Balance pass
- Bug fixes, edge cases
- Deploy to itch.io

### Open Questions Going Into Tonight

1. Do scavengers consume portals on extraction? (Design says yes — brutal and great)
2. Force pulse: does it affect the player too (recoil) or just everything else?
3. Slingshot: prototype today or save for Saturday tuning session?
4. Well harmonics: sine (eerie) or square (industrial)?
5. Can we ship audio + AI + combat + signatures in one day?

---

## Day 1: March 16, 2026 — The Feel (and the First Pivot)

### The Night Shift

Code started at 12:01a. Claude built the full L0 prototype in under an hour: Navier-Stokes fluid sim on GPU, ship with mouse-aim thrust and fluid coupling, gravity wells with oscillating force injection to fake waves, ASCII post-process shader, dev panel with live sliders, and a Puppeteer test harness. 10/10 tests passing.

The ASCII shader looks good. The fluid field renders as colored characters — dark blue void, teal in normal space, amber near wells. The ship renders as a clean white triangle on a separate layer above the ASCII. The dev panel generates sliders dynamically from the CONFIG object. All the infrastructure works.

### The First Playtest

Greg opened the prototype and immediately got trapped in a gravity well. Even with thrust maxed and gravity turned way down in the dev panel, the ship couldn't escape. Root cause: the direct gravitational pull on the ship was hardcoded at 800 px/s² and didn't read from CONFIG — the slider was doing nothing.

Fixed the hardcoding, dropped gravity from 800 to 300, boosted thrust scaling 2.5x. Wells became escapable.

### The Physics Pivot

Then we added 4 wells of different sizes to test interference patterns. This is where the real problem emerged: **oscillating force injection doesn't create surfable waves.**

The oscillation (wells pulsing their force sinusoidally) was supposed to create expanding wave fronts you could ride. Instead it created chaotic turbulence — the ship got shoved around unpredictably, the flow was unreadable, and "surfing" felt like being in a washing machine. The Navier-Stokes sim dampens oscillations before they can propagate as coherent wavefronts.

Greg's observation: "the pulsing is pushing the ship all over the place, very difficult to read the fabric to see where I can/should move."

### The Rethink

We stepped back and thought about what gravity actually does. Black holes don't pulse. They pull constantly. Gravitational waves in real physics come from *events* — mergers, collapses — not from wells just existing.

This led to the V2 physics model:
- **Steady currents (90% of gameplay)** — wells create constant inward pull plus orbital flow. The fluid becomes a readable current map you navigate through. The skill is reading the flow and choosing efficient paths.
- **Event waves (10%, the drama)** — mergers, growth pulses, and collapses emit explicit wave rings that propagate outward at a fixed speed. These are the "big wave" moments — rare, visible, surfable if you're positioned right.

This maps better to real surfing too: surfers spend most of their time reading the water and positioning. The wave is the payoff, not the constant state.

### What We Learned

1. Faking waves through source oscillation doesn't work in a Navier-Stokes sim. The sim dampens them before they propagate.
2. Readable, steady flow > chaotic, oscillating flow. The player needs to be able to look at the screen and predict where they'd drift.
3. The dev panel paid for itself in the first 10 minutes. Without live sliders, the gravity hardcoding bug would have taken much longer to diagnose.
4. The test harness confirmed things work mechanically (10/10 tests pass) — the problem was design, not code. That's the right kind of failure.
5. Building fast + playtesting fast + pivoting fast is the whole game jam workflow.

### Second Playtest (V2 — Steady Currents)

Rebuilt the physics: removed oscillation, added constant pull + orbital currents + event wave rings. Greg tested again:

- **"Much more controllable"** — the chaos is gone. The ship feels like it's in a fluid, not a blender.
- **"Still not super intelligible"** — the currents exist but you can't read them visually. The ASCII shows density but not direction.
- **"My position vs what the fabric is doing aren't super clear"** — the ship feels desynced from the substrate. It floats above rather than feeling IN the flow.
- **"Config complexity"** — Forge was right. Too many knobs that don't do perceptibly different things.

**What we cut in response:**
- Ship CONFIG collapsed from 17 values to 5: thrustAccel, fluidCoupling, turnRate, drag, size
- Wave magnetism/affordances disabled entirely — they were designed for V1's oscillating waves and don't map to V2's steady currents
- Turn curve power, dead zone, mass, thrust ramp, directional drag — all removed
- Display shader updated to tint amber/teal based on flow direction (flowing toward vs away from wells)

**Open problem:** Flow direction still isn't readable enough in the ASCII. The characters show density (how much stuff) not velocity (which way it's moving). Directional ASCII characters (different chars for horizontal vs vertical flow) is on the backlog but needs a shader pass refactor.

### The Y-Flip Debugging Saga

After the physics pivot landed, a persistent visual bug emerged: the dark voids in the ASCII shader (where black holes eat light) weren't lining up with where the physics thought the gravity wells were. The ship would get pulled toward invisible points that didn't match the visible dark spots on screen.

**Multiple fix attempts failed.** Each time, adding a `1.0 - y` flip in one place would fix one display path but break another. The fluid sim uses WebGL coordinates (Y-up, origin at bottom-left) but the canvas overlay uses screen coordinates (Y-down, origin at top-left). Well positions were stored in a vague "UV space" that both systems interpreted differently.

**What went wrong:** No single coordinate convention existed. Well positions at `y=0.3` meant "30% from the bottom" to the fluid shader but "30% from the top" to the overlay renderer. Ad-hoc flips created double-flips and triple-flips. Each "fix" was a guess, not a diagnosis.

**The retro:** The solution is structural, not surgical. Created `coords.js` as the single coordinate authority — three named spaces (screen, well, fluid UV), named conversion functions, no inline flips anywhere. Also added a visual diagnostic mode and an automated coordinate mismatch test so this class of bug gets caught before it reaches a playtest.

**Time cost:** 30+ minutes of Greg's playtesting time wasted on a bug that should have been caught automatically. The dev panel and test harness proved their value again — without them, this would have been even worse.

### State at End of Night

- V2 physics running: steady currents + orbital flow + event wave rings
- Ship simplified to 5 CONFIG values
- Display shader encodes flow direction as color bands
- Coordinate system formalized in `coords.js` — no more inline Y-flips
- Three feel variations being built for morning A/B testing:
  - "Ocean" — high coupling, gentle wells, ride the currents
  - "Spacecraft" — low coupling, strong thrust, currents are decoration
  - "Surfer" — medium coupling, strong orbital highways, reward skilled navigation
- Key remaining issue: ASCII readability of flow direction
- Next: Greg picks a feel variation, tunes it, and we iterate on visual readability

---

## Pre-Jam: March 15, 2026 — The Architecture Day

### The Story

Day two of pre-jam. Greg came in with a mountain of design from the previous night's brainstorm and spent the entire day expanding, stress-testing, and pressure-cooking the game design. By the end of the day, the project had gone from "cool idea" to "fully designed game with a realistic build plan" — and then been pulled back from the brink of over-design by a brutally honest AI review.

This was the day the game almost became three games, and then became one game again.

### Key Decisions

**1. No weapons for v1 — interaction over combat.**

The COMBAT.md analysis walked through the full case for and against lethal combat. The extraction genre (Tarkov, Hunt: Showdown) practically demands PvP. The fluid physics would make projectiles genuinely novel. But the conclusion was clear: combat would eat the entire complexity budget and dilute the thing that makes this game unique — the surfing.

Instead: non-lethal interaction tools. Signal flares (spawn decoy signal sources), force pulses (inject shockwaves into the fluid), tethers (spring physics for navigation). These affect physics and information, not hitpoints. They integrate with the fluid sim instead of fighting it for attention.

The phrase that sealed it: "The Inhibitor IS the combat."

**2. Signal is "the tax on ambition" — not a resource, not a currency.**

This was the most important design clarity of the day. Early brainstorming had signal drifting toward being a spendable resource or a meter to optimize. The SIGNAL-DESIGN doc locked it down: signal is a consequence, not a tool. Every action worth doing creates it. The question is never "should I generate signal?" — it's "is the thing I'm doing worth the signal it costs?"

Key insight from Tarkov: shooting a gun is loud, but the ACTION of shooting has upside. The noise is the tax. Same here — looting a wreck spikes your signal, but the loot is why you came.

Skilled movement (surfing, riding currents) is quiet. Unskilled movement (fighting the current) is loud. The game teaches you to surf by punishing you for not surfing.

**3. The dual-physics system got shelved for the jam.**

The deep dive doc designed a beautiful dual system: Navier-Stokes fluid for local physics plus a separate wave equation solver for gravity wave propagation. Technically elegant. Completely wrong for a 7-day build.

Forge's review killed it with one line: "Fake the theorem, ship the feeling." Use one fluid sim. Inject oscillating forces from wells to create wave-like behavior. If it feels surfable, it IS surfable. The second solver can come post-jam if the game warrants it.

**4. The day/night shift model was formalized.**

The JAM-CONTRACT doc defined how a human designer and AI agents actually coordinate a 7-day build:

- **Day shift (Greg, ~10a-midnight):** Play the game. Make taste calls. Write specs for the night.
- **Night shift (Agents, ~midnight-10a):** 10 hours of uninterrupted build time on clear specs with defined deliverables.

Critical rule: agents NEVER cross a layer boundary without Greg's sign-off. "Does surfing feel good?" is never an agent decision.

Forge's role was defined as "the architectural brake" — invoked before risky work starts and after implementation lands. Not a planner, not a builder. A check.

**5. EVE Online wormhole mechanics became a direct design influence.**

The EVE-WORMHOLE-REFERENCE doc mapped EVE's wormhole mechanics onto the game's portal system:

- Portals should drain from both time AND usage (dual-depletion model)
- Approaching a portal should be quiet; entering extraction should spike signal (the K162 rule — commitment creates information)
- Portal timing should be imprecise ("UNSTABLE" not "closing in 47 seconds")
- Players could potentially destabilize portals to deny them to competitors (rolling)

The big takeaway: "Every action that helps you also exposes you." That is exactly what signal should be.

**6. Multiplayer was explicitly deferred but architecturally respected.**

The SCALING doc designed the full 1-to-100 player architecture. Then the Forge review correctly identified it as "poison during a jam." The resolution: build clean data boundaries (separate sim from rendering, entity state as plain data, input as thin event stream) but write zero networking code this week.

### Design Pivots

**Scope contraction after Forge review.** The biggest pivot of pre-jam. Before the review, the design had: dual physics systems, three threat types at equal priority, six visual layers, and multiplayer architecture bleeding into implementation decisions. After:

- One fluid sim, fake the waves
- Inhibitor as the only essential threat (fauna and scavengers are stretch)
- Core visual: fluid + ASCII post + clean ship + clean HUD. Everything else is polish.
- Solo only. Clean architecture that happens to be multiplayer-ready.

**Signal upside debate.** Forge pushed back on signal being purely punitive: "If every meaningful action increases signal and signal mostly causes bad things, players will quickly learn the wrong lesson: do less, move less, engage less." Recommended signal should buy short-term capability (better scans, wider loot radius, etc.). Greg's SIGNAL-DESIGN doc went the other direction: signal buys nothing, the ACTIONS that generate signal are the upside. This tension is unresolved and will be settled by playtesting.

**Procedural identity sharpened.** Forge noted that civilization name + death cause + age + loot table isn't enough to make wrecks feel haunted. Recommended "one memorable detail" per wreck beyond text (silhouette class, local flow anomaly, unique hazard, visual remnant color). Also pushed for "one strong cosmic signature per run" — universe-level modifiers like tidal, turbulent, viscous, sparse, dense, decaying — instead of trying to over-generate everything.

### Tools and Process

- **Greg + Orrery (Claude Code):** Primary design partnership. Orrery turned Greg's brainstorm fragments into structured design docs, pushed back on scope, and helped crystallize mechanics.
- **Forge (AI reviewer):** Delivered a 200-line technical and creative review that reined in the entire project. Best single intervention of pre-jam.
- **Gemini:** Prompts written for pre-visualization and key art generation. Eight detailed prompts covering hero images, game moments, UI mockups, entity concepts. Goal: have visual targets before writing a line of code.
- **Git:** 10 commits across the day, all documentation. Every design decision committed atomically with reasoning in the message.

### What Was Built (All Docs, No Code)

| Commit | What |
|--------|------|
| `a982ac8` | Initial game design doc — core loop, movement, threats, visuals, tech stack |
| `521b566` | CLAUDE.md — git rules, commit style, layer prefixes |
| `d7bb7d7` | Jam contract — shifts, checkpoints, agent coordination |
| `8e6dbaa` | Scaling architecture (1-100 players) + combat analysis |
| `699dbd6` | Music system design + Gemini pre-vis prompts |
| `cf930d1` | Forge review brief + scaling updates |
| `1801b87` | Forge review of design and architecture |
| `3371712` | Updated Forge's role to architectural brake |
| `c05cc53` | Signal design — "the tax on ambition" |
| `5c37830` | EVE wormhole mechanics as design reference |

### What Was Cut or Deferred

- **Dual physics system** — shelved for post-jam. One fluid sim with faked wave behavior.
- **Lethal combat** — cut entirely for v1. Non-lethal interaction tools are stretch goals.
- **Multiplayer networking** — deferred. Clean architecture only.
- **Full scavenger AI** — downgraded from core to stretch. Fluid-aware pathfinding is expensive to build.
- **Fauna as a core system** — downgraded to stretch. The Inhibitor is the one threat that matters.
- **Multi-grid ASCII layering** — demoted to polish. Core visual is one grid + one post-process pass.
- **Mutation system** — stub currencies noted, actual system deferred.
- **Probe/scanning mechanic** — admired in EVE, explicitly not built. Your scan is your viewport and your ears.

### Memorable Moments

- **"Fake the theorem, ship the feeling."** Forge's one-liner that killed the dual physics plan. This should be a poster.
- **The combat analysis that argued itself out of existence.** COMBAT.md built the strongest possible case FOR weapons, then concluded "no weapons." The case against was just stronger. The Inhibitor IS the combat.
- **The signal design crystallizing around Tarkov.** The insight that signal should work like gunshot noise in Tarkov — not a resource you manage, but a tax on doing valuable things — unlocked the entire mechanic.
- **EVE wormhole research going deep.** Greg's EVE Online experience directly informed portal mechanics: dual-depletion, the K162 rule, rolling, polarization. Years of wormhole diving paying off in game design.
- **Forge's verdict: "The game has a real hook."** After 200 lines of critique, cuts, and warnings, Forge opened with an endorsement. The concept is strong. The danger is scope, not vision.
- **The music design doc.** Possibly the most ambitious doc of the day — a fully procedural soundscape where the universe is the instrument. Every sonic element driven by a game variable. No two runs sound the same. The drone that gains harmonics as the universe dies. The gravity well oscillators that create chords. The signal choir that curdles from ethereal to claustrophobic. If even half of this ships, it will be remarkable.

### Open Questions Going Into Monday

1. **Does surfing feel good?** This is THE question. All design is provisional until the fluid sim + thrust control is playable and fun. Monday is entirely dedicated to answering this.
2. **Signal upside or not?** Forge says signal should buy capability. Greg says signal buys nothing — the actions are the upside. Playtesting will decide.
3. **Fluid sim resolution vs. performance.** 256x256 is the target. Need to verify 60fps with ASCII post-process on integrated GPUs. Fallback: 128x128 (still looks good through the ASCII dithering).
4. **Character cell size.** 8x12 feels right on paper. Smaller = more detail, harder to read. Larger = easier to read, less fluid detail. Must be tested Monday.
5. **Wave-fluid coupling.** How much do injected oscillating forces actually feel like "surfable waves"? This is the key risk of the single-sim approach.
6. **Wreck loot time.** Instant fly-over for v1, but should there be a brief hover time (0.5s) to create vulnerability?
7. **Portal charge time.** Fly through instantly, or hold position for 2-3s? The hold adds tension but might frustrate.
8. **How does Forge's review actually change the build plan?** The layer structure (L0-L6) still holds, but the priority within layers shifted. Need to update BUILD-PLAN.md before Monday night's first agent shift.

---

## Pre-Jam: March 14, 2026 — The Spark

### The Story

The day the game was born. Greg pitched the concept to Orrery during a late-night brainstorm session. The core idea arrived almost fully formed: surfing gravity waves in a dying universe, scavenging wreckage of dead civilizations, extracting through evaporating portals before spacetime collapses.

The pitch line that started it all: "You are the last black hole surfer."

### Key Decisions

**1. The core fantasy: surfing spacetime, not flying through space.**

This is not a top-down space shooter. Movement is fluid interaction — your ship rides currents, catches waves, fights eddies. Thrust is acceleration, not teleportation. Drift is the default state. The fluid sim IS the game, not a backdrop.

**2. ASCII dithered rendering as visual identity.**

Not retro for retro's sake. The ASCII characters ARE the physics made visible. Density shows as character weight. Flow direction shows as character shape. Energy shows as color. The rendering is the gameplay feedback. Reference: SHL0MS ASCII dithering work, Hermes Agent ASCII video skill.

**3. Extraction roguelike as the loop.**

Prep, drop, scavenge, signal, extract, upgrade, repeat. Inspired by Tarkov's risk/reward extraction tension applied to a cosmic horror setting. The universe IS the clock — no countdown timer, just a world that visibly dies around you.

**4. Three Body Problem meets Revelation Space meets Caves of Qud.**

The tone was set immediately. Hard sci-fi cosmic dread, not space opera. The Inhibitors from Revelation Space as existential threat. Dark forest theory as a mechanic. Caves of Qud's "vines on iron trellis" approach to procedural generation.

**5. Browser-based, WebGL, vanilla JS.**

Jam speed. No framework. Fork of PavelDoGreat's WebGL-Fluid-Simulation as the physics foundation. Single HTML file if possible. Deploy to itch.io.

### What Was Built

- Initial DESIGN.md — the full game design document
- Core loop defined
- Threat hierarchy sketched (Scavengers, Fauna, Inhibitors)
- Visual design direction established (three-layer stack: grid, ASCII fluid, HUD)
- Tech stack chosen
- Open questions catalogued

### Memorable Moments

- **The "universe as clock" idea.** No timer. The universe dies around you through four stacking mechanics: black hole growth, portal evaporation, Hawking radiation, spacetime viscosity. The controls themselves degrade — you feel the universe dying through the input. This arrived in the first brainstorm and never changed.
- **The dark forest mechanic.** Signal management as survival. Every scan, every thruster burn, every loot pickup adds to your signal footprint. Cross the threshold and the Inhibitors wake. They don't chase you because they hate you — your existence is a statistical threat.
- **Naming the game.** "Last Black Hole" — the last portal out, the last surfer, the last moment before collapse. The name worked immediately.

### Open Questions Going Into March 15

- How does combat work? Do we even need it?
- What's the multiplayer architecture?
- How do agents coordinate the build?
- What does the music sound like?
- How does signal actually work as a mechanic?
- Can we really do a fluid sim + ASCII shader + game logic at 60fps in a browser?

---

## Template for Future Entries

```
## Day N: [Date] — [Title]

### The Story
[Narrative summary of the day]

### Key Decisions
[Numbered list of decisions with reasoning]

### Design Pivots
[Where did direction change and why]

### What Was Built
[Commits, features, systems]

### What Was Cut or Deferred
[Equally important]

### Playtest Notes
[How does it feel? What works? What doesn't?]

### Tools and Process
[How is the team actually working?]

### Memorable Moments
[Things that would make good content]

### Open Questions
[Going into the next day]

### Screenshots / Recordings
[Links or descriptions — capture these during the day!]
```
## April 2, 2026 — The First Real Infrastructure Fault

The architecture finally drew blood in a useful way.

The fault was not some glamorous distributed-systems failure. It was more honest than that: we started the new LBH stack locally, the machine went hot, and it turned out stale detached test sims were still alive while the live sim had no explicit “nobody is here, go quiet” posture. That is exactly the sort of workshop bruise you want early, because it tells you whether the architecture can survive contact with ordinary use.

The conclusion is now clear. The control plane can stay up locally. It is cheap, and that is the right place for profile/session truth to linger. The sim is different. LBH is still a run-based game, not a persistent shared world, so an empty sim staying alive by default is wasted heat. The current runtime now idles correctly with zero human players. The next cut is to make it auto-stop after a short grace period unless someone explicitly asked for a pinned host.

That is a better rule than pretending we already want persistent-world semantics. Build the hosted muscle later. For now, the thing that holds is a cheap control plane, disposable sim instances, and clients that can come and go without heating the whole bench.
