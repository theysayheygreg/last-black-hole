# Decision Log

> What we considered, what we tried, what we rejected, where it landed.
> Each entry tracks the full decision tree — not just the outcome.
> If we revisit a question, we add a new dated entry, not overwrite.

---

## How to Read This

Each decision has:
- **Question**: The design fork we faced
- **Options considered**: What was on the table, who advocated what
- **Where it landed**: Current answer
- **Door status**: Closed (won't revisit), Open (might revisit with new info), Playtesting (answer depends on feel)
- **Dates**: When the question surfaced, when it was last updated

---

## Entity Hierarchy: Four Tiers (2026-03-28)

**Question:** How should non-player entities be organized? The existing scavenger/fauna split was jumbled — fauna doing active-tier work (eels lunging you into wells), scavengers split between ambient (drifters vibing) and pseudo-adversarial (hunters), and no true adversarial layer at all.

**Framework (from Greg):** Four tiers with distinct gameplay contracts:
1. **Ambient** (LOW impact) — texture, tells, atmosphere. Birds in Marathon.
2. **Active** (MODERATE impact) — singular directive, constant obstacle. ARC in Arc Raiders.
3. **Adversarial** (HIGH impact) — full toolkit, same game as the player. Runners in Marathon.
4. **Existential** (ABSOLUTE) — inescapable, non-interactive. Blue circle in BR.

**Where it landed:** ENTITY-CATALOG.md. 17 entity types across 4 tiers. Seed picks from catalog per run (1-3 ambient, 1-2 active, always adversarial, always Inhibitor). Supersedes SCAVENGERS-V2.md and FAUNA.md.

**Key reframes:**
- Drifter scavengers → absorbed into AI players (Ghost/Prospector personalities)
- Vulture scavengers → absorbed into AI players (Raider/Vulture personalities)
- Rift eels → promoted from ambient to active tier (Gradient Sentries)
- Signal moths → simplified to Signal Blooms (ambient visual tell, not mechanical threat)
- Hunters → active tier (Current Hunters), not adversarial
- NEW: AI players as true adversarial tier (same toolkit, same game loop)

**Door status:** Tier structure closed. Individual entity types within each tier are open to addition/removal.

---

## AI Players: Adversarial Tier (2026-03-28)

**Question:** What fills the adversarial tier? Smarter scavengers or genuinely new entities running the full player loop?

**Where it landed:** Full AI players. Same Ship class, same inventory, same physics, same combat tools. 5 personalities as weight tables on shared decision code (Prospector, Raider, Vulture, Ghost, Desperado). Solo = 1 human + 3-7 AI. Multiplayer replaces AI slots with humans.

**Key decisions:**
- Player count: 4-8 per run (matches Codex server architecture scope)
- AI visibility/detection range: deferred
- AI lives server-side in `tickAIPlayers()`
- Analytical flow model for navigation (no GPU needed server-side)
- AI sees same info as human player (no map hacks, perception has noise/delay)
- Character classes emerged from first principles: same toolkit + different weights = distinct playstyles

**Door status:** Architecture closed. Personality weights open to extensive tuning. Perception fidelity (noise/delay amounts) open to tuning. Additional personalities can be added to catalog.

---

## Signal System: Three Open Decisions (2026-03-28)

**Question 1: Inhibitor wake mechanic**
Options: A) Hard threshold (fixed per run), B) Probability ramp (per-tick RNG), C) Threshold + variance (random threshold 0.82–0.98 set at run start)
**Decided: C.** EVE wormhole pattern — consistent rules, hidden parameters. Each run the line is different. Variance IS the dread.

**Question 2: Signal equipment**
Options: A) No signal equipment (pure skill), B) Signal shaping (changes shape, not magnitude), C) Shaping with costs (every signal benefit has a non-signal downside)
**Decided: C.** Dampened Thrusters = slower signal ramp but 15% less max thrust. Signal Sink = faster decay but eats a cargo slot. Every module is a tradeoff. Hardest to balance but richest decision space.

**Question 3: Multiplayer signal visibility**
Options: A) Hidden (audio only), B) Visual cues (glow/trail reveals approximate level), C) Exact HUD numbers
**Decided: B.** Ship glow and trail brightness communicate signal state — GHOST vs BEACON is visible, exact numbers aren't. Note: this requires the fabric/shader layer to reliably render per-entity visual state, which is the same surface the Inhibitor needs. Both problems solve together or not at all.

**Door status:** All closed. Equipment balance values open to tuning. Multiplayer implementation blocked on fabric-layer rendering.

---

## Star Clearing: Physics vs Visual Density (2026-03-25)

**Question:** Should stars inject negative visual density to create a clearing bubble?

**Context:** Stars push fluid outward (negative gravity). They also injected `-cfg.clearing` into the visual density buffer every tick to create a visible dark zone. This negative density accumulated and was interpreted by the display shader's `liveSpace` calculation, which multiplies all well ring/halo contributions. Wells near stars (W0/W2 on the 3×3 map) had their accretion visuals suppressed to near-invisible.

**Root cause:** The visual density buffer is a single shared RGB channel. Negative injectors (stars) stomp on positive signals (well rings, wreck glow). No isolation between systems.

**Where it landed:** Remove the negative visual splat. The physics push already creates a natural low-density clearing — the visual shortcut was redundant and harmful. Visual density buffer is now purely additive (positive signals only). If we need per-system visual channels later, option B (separate buffers) is on the table.

**Door status:** Open for option B if other cross-talk issues emerge.

---

## Inventory Equip/Load Path (2026-03-25)

**Question:** How should equippable artifacts and consumables move from cargo to their active slots?

**Options considered:**
- A) Submenu on confirm (select action from list)
- B) Auto-dispatch: confirm on equippable → equip, consumable → load, other → drop
- C) Separate keybind for equip vs drop

**Where it landed:** B. Confirm does the right thing based on item subcategory. If target slots are full, swaps with slot 0. Simplest UX that works — no submenu, no extra keybinds. Action hints in the HUD update to show `[equip]`/`[load]`/`[drop]` so the player knows what will happen.

**Door status:** Closed for now. May revisit if we add more slot types or the swap-with-0 feels wrong.

---

## Shader Distance Units (2026-03-25)

**Question:** What unit space should the display shader's per-well distance calculation use?

**Options considered:**
- A) Reference-scaled: `dist = length(diff) / uvS` — divides by FLUID_REF_SCALE/WORLD_SCALE. Produces world_distance/FLUID_REF_SCALE. Was the original code.
- B) World-space: `dist = length(diff) * u_worldScale` — multiplies UV distance by WORLD_SCALE. Produces true world-space distance.

**Where it landed:** B. Shape values from `getRenderShapes()` are in world-space (accretionRadius × WORLD_SCALE). dist must match. Option A was 3× off on the 3×3 map, making ring gradients invisible for large wells.

**Door status:** Closed.

---

## Toroidal Wrapping in Simulation Shaders (2026-03-25)

**Question:** Do GPU shaders that compute point-to-point distance need explicit toroidal wrapping?

**Context:** The fluid texture is toroidal (GL_REPEAT). Texture *sampling* wraps automatically, but *distance calculations* between two UV positions don't — `length(a - b)` gives straight-line distance, not shortest-path-on-torus distance.

**What broke:** `FRAG_SPLAT` and `FRAG_WELL_FORCE` used straight-line distance. Wells near UV boundaries (e.g., W0 at UV 0.33 on 3×3 map) had their gravity and density splats cut off at the texture edge instead of wrapping. This created hard edges in the velocity field that were visible as sharp fabric boundaries in the display.

**Fix:** `diff = diff - round(diff)` before any distance calculation. Now documented as TOROIDAL WRAPPING RULE in fluid.js header.

**Door status:** Closed. All 4 point-to-point shaders verified. The 7 neighbor-sampling shaders don't need it (GL_REPEAT handles their lookups).

---

## Ring Scale vs Map Size (2026-03-25)

**Question:** Should accretion ring screen coverage be consistent across map sizes, or scale with WORLD_SCALE?

**Current behavior:** CONFIG.wells.accretionRadius is UV-space (0.023). Multiplied by WORLD_SCALE for world-space shapes. Ring screen coverage grows with map size: ~23% on 3×3, ~51% on 5×5, ~126% on 10×10 for the largest wells.

**Options:**
- A) Keep current: rings are physically larger on bigger maps. Mega-wells feel massive.
- B) Normalize: divide accretionWorld by some scale factor so rings have similar screen presence across maps.
- C) Per-map tuning: override accretionRadius in each map definition.

**Where it landed:** Open. Current math is correct but needs design review. Revisiting today.

**Door status:** Open.

---

## Incident: Map Select Crash (2026-03-18)

### What happened
Removed `portals` array from map files (portal wave system replaced static portals). The map select screen still referenced `map.portals.length` to display stats. Crash on entering map select — game stopped functioning.

### Why tests didn't catch it
All tests use `triggerRestart()` which bypasses the title→mapSelect→startGame user flow. The crash only occurred on the path real users take (select map from menu).

### What we learned
1. When removing data fields, grep for ALL consumers before committing
2. Validation tests that flag "dead data" must also verify no live references exist
3. Test suite needs at least one test that exercises the actual user flow (title→mapSelect→play), not just the shortcut API

### Changes made
- Fixed the crash (display wreck count instead of portal count)
- Added memory: always grep for all consumers before removing data
- Documented in decision log for future reference

---

## Map Scale

### Q: How big should the world be?

| Date | Event |
|------|-------|
| Mar 17 | Greg playtest feedback: "world is too cramped, everything crammed into one screen, can't see effects of stars/loot at this scale" |
| Mar 17 | Night shift implements 3x3 world expansion with camera follow. Entities spread across the map. Toroidal wrapping for seamless edges. |

| Mar 17 (night) | Map file system implemented. WORLD_SCALE now mutable via `setWorldScale()`. Three maps created: 3×3 (current), 5×5, 10×10. Force culling by camera distance for large maps. Fluid `reinitialize()` for resolution changes. |

**Where it landed:** Multiple map sizes supported (3, 5, 10). Map select screen lets player choose. WORLD_SCALE is per-map. Fluid resolution scales with map size (256 for 3×3/5×5, 512 for 10×10).

**Door status:** Open — playtesting needed on 5×5 and 10×10 feel. Cull distance may need tuning. More maps easy to add.

---

## Extraction Loop

### Q: How does the player extract?

| Date | Event |
|------|-------|
| Mar 17 | Portals added as extraction points. Two portals placed in safe zones far from wells. |
| Mar 17 | Extraction is instant (fly into capture radius → "ESCAPED"). No charge time. |

**Where it landed:** Instant extraction via portal capture radius (0.08 world-units). Two portals at (0.3, 0.3) and (2.7, 2.7). "ESCAPED" screen mirrors "CONSUMED" death screen.

**Door status:** Open — may add charge time, loot requirements, or multi-portal extraction in L1.

---

## Well Growth

### Q: How should wells grow over time?

| Date | Event |
|------|-------|
| Mar 17 | Greg: "set auto growth to low but let other stuff continually spawn and see what happens" |
| Mar 17 | growthInterval 20→45s, growthAmount 0.05→0.02. Planetoid consumption supplements passive growth. |

**Where it landed:** Slow passive growth as floor, planetoid consumption as bonus. Wells grow when they eat planetoids (adds mass + spawns wave ring).

**Door status:** Playtesting — balance depends on how many planetoids orbit near wells.

---

## Controller Input

### Q: Roll our own input manager or use a library?

| Date | Event |
|------|-------|
| Mar 17 | Greg reports stick flicker, spring bounce, neutral drift during playtest |
| Mar 17 | Surveyed 8 JS gamepad libraries (gamepad-api-mappings, Gamepads.js, joypad.js, gamecontroller.js, etc.) |
| Mar 17 | None have the full pipeline: radial deadzone + hysteresis + angular smoothing. Best one (gamepad-api-mappings) only has deadzones. |
| Mar 17 | Decision: keep our input.js, add ~40 lines of proper processing using proven patterns from Warhawk and JoyShockMapper. |

**Where it landed:** Custom input pipeline. Scaled radial deadzone, aim state hysteresis with hold timer, soft tiered angular smoothing, last-known-angle hold. All constants tunable in dev panel. No library dependency.

**Why not a library:** Every candidate either lacked critical features (smoothing, hysteresis), was framework-coupled, or would still require us to write the hard parts. 40 lines of well-understood math beats a dependency that doesn't solve the actual problem.

**Door status:** Closed — the pipeline works. May tune constants per-controller.

---

## Physics Architecture

### Q: One fluid sim or two?

| Date | Event |
|------|-------|
| Mar 14 | Initial design assumes single fluid sim (Navier-Stokes) |
| Mar 15 | DESIGN-DEEP-DIVE proposes dual system: Navier-Stokes for local flow + wave equation solver for gravity wave propagation. Technically elegant, would give true surfable wavefronts |
| Mar 15 | Forge review kills it: "Fake the theorem, ship the feeling." Two physics systems is a research project, not a jam decision |
| Mar 15 | Greg ambivalent — could parallelize as a sidequest if single sim proves the feel. Not opposed to revisiting |

**Options:**
1. **Single fluid sim + oscillating force injection** (Forge's recommendation) — fake waves through periodic force patterns from gravity wells. Simpler, proven, shippable.
2. **Dual solver** (deep dive design) — Navier-Stokes + wave equation on separate grids, coupled. Physically accurate surfing. Research-level complexity.
3. **Wave equation only** (never seriously considered) — would lose the fluid feel entirely.

| Mar 15 (late) | Greg reopens: "let's parallelize here. run two experiments, maybe we merge them." Aligns with new Pillar 6 (Run It Twice) — agent compute is cheap, design regret is expensive. |

**Options:**
1. **Single fluid sim + oscillating force injection** (Forge's recommendation) — fake waves through periodic force patterns from gravity wells. Simpler, proven, shippable.
2. **Dual solver** (deep dive design) — Navier-Stokes + wave equation on separate grids, coupled. Physically accurate surfing. Research-level complexity.
3. **Wave equation only** (never seriously considered) — would lose the fluid feel entirely.
4. **Parallel experiments** (Greg's current position) — run both approaches simultaneously as two agent tasks. Compare results. Merge if they complement each other, pick the winner if not.

**Where it landed:** Option 4. Both get built in parallel Monday night. Two agents, two sims, compare Tuesday morning.

| Mar 16 (1am) | V1 prototype (single sim + oscillating force injection) built and playtested. Ship gets trapped in wells, oscillation creates chaotic unreadable movement, "surfing" feels like a washing machine. Root cause: pulsing force at the source ≠ propagating waves. The N-S sim dampens oscillation before it becomes a coherent wavefront. |
| Mar 16 (1:30am) | Greg + Claude rethink the physics model entirely. Real black holes don't pulse — they pull constantly. Waves should come from events (mergers, growth, collapses), not from wells existing. |

5. **Steady currents + event waves** (V2, Greg + Claude) — wells create constant pull + orbital flow (the readable, navigable terrain). Waves only come from discrete events (mergers, growth pulses, collapses). Two movement regimes: steady currents (90% of play, skill = reading flow) and event waves (10%, skill = positioning for the big moment). See PHYSICS-V2.md.

**Where it landed:** Option 5. Oscillating force injection is dead. V2 design: steady currents for navigation, event-driven waves for drama.
**Door status:** Open — V2 needs to be built and playtested. If steady currents aren't interesting enough, we may need to add more flow complexity.
**Key learning:** Faking waves through force oscillation doesn't work in a Navier-Stokes sim. The sim dampens them before they propagate. Real wave propagation needs explicit ring entities, not source oscillation.
**Door status:** Open. Experiments will converge or one will win.

---

## Entity Expansion (Experiments 1-5)

### Q: What should populate the world besides wells?

| Date | Event |
|------|-------|
| Mar 16 | Playtesting reveals the world needs more things to navigate around. Wells alone create interesting flow, but there's nothing to route between, shelter behind, or interact with. |
| Mar 17 | Five experiments implemented: ship slowdown, bullet wake, stars, loot anchors, controller support. |

**Options considered:**
1. More wells — rejected, already have 4, more = visual chaos
2. Moving obstacles (planetoids) — deferred to night shift, medium complexity
3. Static radiant sources (stars) — implemented, low complexity, high visual payoff
4. Flow obstacles (loot anchors) — implemented, low complexity, tests lee zones
5. AI traffic ships — deferred to night shift, linked with well consumption mechanic

**Where it landed:** Stars and loot anchors shipped. Creates equilibrium zones, navigable channels, and flow obstacles. Planetoids and AI traffic deferred.

**Door status:** Open. Playtesting will determine which entities earn their keep.

---

### Q: Ship too fast to read currents?

| Date | Event |
|------|-------|
| Mar 16 | Ship at thrustAccel 2500 / drag 0.03 = terminal velocity ~1333 px/s. Overpowers all fluid flow. |
| Mar 17 | Slowdown: thrustAccel 800, drag 0.06, fluidCoupling 1.2. Terminal ~213 px/s. Ship settles into flow faster. |

**Where it landed:** Ship is 6x slower. Currents now carry the ship meaningfully. Risk: wells may be inescapable. `shipPullStrength` may need reduction from 250 to ~150.

**Door status:** Playtesting. If wells are inescapable, reduce shipPullStrength.

---

### Q: Controller support timing?

| Date | Event |
|------|-------|
| Mar 15 | DualSense listed as Tuesday/Wednesday stretch goal |
| Mar 17 | Pulled forward to Monday night. Mouse lacks granularity for the slower ship — analog thrust from R2 trigger is the big win for navigating fabric. |

**Where it landed:** Gamepad API implemented with auto-detection. Left stick = facing, R2 = analog thrust, L2 = brake. Mouse still works as fallback.

**Door status:** Closed for API. Open for feel-tuning (dead zones, response curves).

---

## Signal Mechanic

### Q: Does signal buy capability?

| Date | Event |
|------|-------|
| Mar 14 | Signal conceived as risk/reward dial — more signal = faster loot discovery but attracts threats |
| Mar 15 | Forge review flags signal as potentially punitive: "If every meaningful action increases signal and signal mostly causes bad things, players will learn the wrong lesson: do less" |
| Mar 15 | Forge recommends signal should buy short-term power: better scans, wider loot radius, reveals unstable portals, increases ship-wave coupling |
| Mar 15 | Greg reframes through Tarkov: signal is the TAX on ambition, not a currency. Shooting in Tarkov is loud — that's bad. But shooting kills enemies — that's good. The noise is a byproduct of the valuable action, not a resource |
| Mar 15 | SIGNAL-DESIGN.md locks this down: signal buys nothing. The actions that generate signal are the upside |

**Options:**
1. **Signal buys nothing** (Greg's position) — pure tax. Skilled play minimizes it. The game teaches surfing by punishing non-surfing. Clean, intuitive, no optimization sweet spot.
2. **Signal buys capability** (Forge's position) — high signal reveals wrecks, widens loot radius, strengthens wave coupling. Creates a genuine temptation to run hot. Risk: adds a "sweet spot" optimization target.
3. **Signal buys different things at different tiers** (hybrid, never fully explored) — low signal is pure stealth, mid signal gives discovery benefits, high signal attracts threats. Risk: complexity.

**Where it landed:** Option 1. Signal is consequence, not resource.
**Door status:** Playtesting. If playtests show players just tiptoeing around (the "do less" failure mode Forge warned about), we revisit. Forge may be right. The Tarkov analogy holds only if there are enough reasons to take loud actions.

### Q: Signal decay curve — linear or exponential?

| Date | Event |
|------|-------|
| Mar 15 | SIGNAL-DESIGN.md raises the question. Notes exponential feels better (fast initial drop, slow tail) but is harder to learn |

**Options:**
1. **Linear** — predictable, easy to learn, boring
2. **Exponential** — fast initial decay rewards brief loud bursts, slow tail punishes sustained noise. More interesting but less readable.
3. **Piece-wise** (not yet discussed) — fast decay below 50%, slow decay above. Would create a "danger zone" that's hard to leave.

**Where it landed:** Undecided.
**Door status:** Playtesting. Start with exponential, see if players can read it.

### Q: Inhibitor threshold — fixed or randomized?

| Date | Event |
|------|-------|
| Mar 15 | SIGNAL-DESIGN.md raises the question. Random (±10%) adds uncertainty, fixed is easier to learn |
| Mar 15 | EVE wormhole research reinforces engineered uncertainty: "less than 4h" not "3h47m" |

**Options:**
1. **Fixed** (e.g., always 90%) — learnable, speedrunnable, less tense once you know the number
2. **Randomized ±10%** — you never know exactly when. More tension. Harder to learn the system.
3. **Hidden fixed** — threshold is fixed but the HUD doesn't show exact signal %. You see tiers (GHOST, WHISPER, etc.) not numbers. Best of both?

**Where it landed:** Leaning toward option 3. Fixed threshold, imprecise display.
**Door status:** Open. Needs playtesting.

---

## Combat

### Q: Should the game have weapons?

| Date | Event |
|------|-------|
| Mar 15 | COMBAT.md analyzes the full case for and against. Extraction genre practically demands PvP. Fluid physics would make projectiles novel. |
| Mar 15 | Conclusion: combat would eat the entire complexity budget. The fluid sim IS the interaction system. "The Inhibitor IS the combat." |
| Mar 15 | Non-lethal interaction tools proposed: signal flares, force pulses, tethers, EMP. These affect physics and information, not hitpoints |
| Mar 15 | Forge review endorses: "Do not add lethal combat in the jam build" |

**Options:**
1. **No weapons, ever** — pure evasion/navigation game
2. **Non-lethal tools** (current plan) — force pulse, signal flare, tether. Affect physics, not HP.
3. **Lethal weapons** (rejected) — projectiles through fluid, ship destruction, loot drops. Full extraction PvP.

**Where it landed:** Option 2. Non-lethal tools as stretch goals mid-week.
**Door status:** Closed for jam week. If the game goes post-jam, weapons conversation reopens.

---

## Threats

### Q: How many threat types for the jam?

| Date | Event |
|------|-------|
| Mar 14 | Design doc establishes three tiers: Scavengers, Fauna, Inhibitors |
| Mar 15 | Forge review: "The current scope of threats is too wide." Recommends Inhibitor as the only essential threat. Fauna and scavengers are stretch. |
| Mar 15 | Greg pushes back on experience density: "the ratcheting danger is important and i think needs a min of X density to feel good" |

**Options:**
1. **Inhibitor only** (Forge's position) — single existential threat. Clean, focused.
2. **Inhibitor + one lower threat** (compromise) — fauna OR scavengers, not both. Provides experience density without three systems.
3. **Full threat stack** (original design) — scavengers + fauna + Inhibitor. Rich but expensive to build.

**Where it landed:** Inhibitor is core. One simpler threat (likely fauna — simpler AI than scavengers) as stretch for Wednesday. Scavengers only if ahead of schedule.
**Door status:** Open. Depends on Monday/Tuesday velocity.

---

## Multiplayer

### Q: Solo only or multiplayer for the jam?

| Date | Event |
|------|-------|
| Mar 14 | Design doc: single-player with AI opponents. Multiplayer stretch goal. |
| Mar 15 | SCALING.md designed full 1-100 player architecture |
| Mar 15 | Greg: "2-3 player should be the jam goal not just the future goal" |
| Mar 15 | Forge review: multiplayer is "poison during a jam if it starts steering implementation" |
| Mar 15 | Resolution: build clean data boundaries (separate sim from rendering, entity state as plain data), write zero networking code this week |

**Options:**
1. **Solo only, clean architecture** (Forge's position, current plan) — no networking code. Architecture that happens to be multiplayer-ready.
2. **2-3 player WebSocket** (Greg's aspiration) — authoritative server, client prediction. Aggressive but feasible with agent horsepower.
3. **Local multiplayer** (never discussed) — split screen or shared screen. Sidesteps networking entirely.

**Where it landed:** Option 1 for the build plan. Option 2 stays as a labeled stretch goal if we're ahead by Thursday.
**Door status:** Open. Greg wants this. It depends entirely on velocity.

---

## Visual Stack

### Q: How many render layers?

| Date | Event |
|------|-------|
| Mar 14 | Three-layer stack: background grid, ASCII fluid, HUD overlay |
| Mar 15 | DESIGN-DEEP-DIVE adds: feedback buffer (motion trails), multi-grid layering, screen distortion, star particles, chromatic gravity warps |
| Mar 15 | Forge review: "Use one killer visual move, not six." Cut to fluid + ASCII post + clean ship + clean HUD |
| Mar 15 | Greg pushes back: "the visual sauce we should keep early not late. the art is the product." |

**Options:**
1. **Minimal stack** (Forge's recommendation) — fluid field → ASCII post → ship overlay → HUD. Four passes.
2. **Full stack** (deep dive design) — fluid → scene render → feedback buffer → ASCII post → distortion → HUD → particles. Seven passes.
3. **Progressive stack** (compromise, implicit current plan) — start with Forge's minimal, add layers as time allows and performance permits.

**Where it landed:** Option 3. Start minimal, add sauce. But Greg is clear: visual identity is not polish, it's product. ASCII shader goes in Monday, not Friday.
**Door status:** Open. Depends on GPU performance budget.

---

## Naming

### Q: What do we call the portals?

| Date | Event |
|------|-------|
| Mar 15 | EVE wormhole research prompts the question. "Portals" feels generic. |
| Mar 15 | "Breaches" proposed — violent, urgent, implies damage to spacetime |

**Options:**
1. **Portals** — generic but clear
2. **Breaches** — violent, implies spacetime damage, fits the dying-universe tone
3. **Rifts** — similar to breaches, more sci-fi standard
4. **Exits** / **Gates** — functional but flat

**Where it landed:** Leaning "breaches." Not locked.
**Door status:** Open. Low priority — naming can change anytime.

### Q: What do we call the Inhibitors?

| Date | Event |
|------|-------|
| Mar 15 | "Inhibitors" is from Revelation Space. Need our own name. |
| Mar 15 | "The Silence" floated — evocative, fits dark forest (you go silent to survive) |
| Mar 15 | Stellaris reference adds naming insight: use evocative English, not alien syllables. Alexis Kennedy: real words in wrong combinations. |

**Options:**
1. **Inhibitors** — borrowed from Alastair Reynolds, legally/creatively questionable
2. **The Silence** — evocative, thematic (you manage signal to avoid waking silence)
3. **The Threshold** — meta (you cross a threshold to wake them, they ARE the threshold)
4. **The Warden** / **Wardens** — implies enforcement, galaxy-scale policing
5. TBD — more options welcome

**Where it landed:** Undecided. Placeholder "Inhibitor" in all docs.
**Door status:** Open. Needs a decision before the game has UI text (Thursday-ish).

---

## Dev Panel & Tuning Architecture

### Q: Is the dev panel a mandatory build requirement or optional polish?

| Date | Event |
|------|-------|
| Mar 15 | TUNING.md written. Dev panel defined as "Monday morning task — ships alongside or immediately after the physics prototype. It's not optional." Without it, every tuning cycle requires agent code changes + Greg reloads. |
| Mar 15 | ROADMAP.md assigns Task N2 (Dev Panel + CONFIG Object) as a Monday night deliverable, ordered after N1a/N1b but before morning review. |

**Options:**
1. **Mandatory Monday deliverable** (current position) — Greg cannot tune without it. Every hour without sliders is an hour of "change code, reload, play for 2 minutes" loops.
2. **Nice-to-have, build when convenient** (rejected) — risks burning Greg's most valuable time (Monday morning review) on the reload cycle.

**Where it landed:** Option 1. Dev panel is a first-night deliverable, not polish.
**Door status:** Closed.

---

### Q: How should tunable constants be organized in code?

| Date | Event |
|------|-------|
| Mar 15 | TUNING.md and AGENT-PROMPTS.md define the CONFIG object pattern: single object, every system reads every frame (not cached at init), dev panel sliders write to it, "Copy Config" serializes to JSON. |

**Options:**
1. **Single CONFIG object** (current position) — all tunables in one place, live-editable, serializable. Dev panel binds directly.
2. **Per-system constants** (rejected) — scatter tunables across fluid.js, ship.js, etc. Dev panel has to hunt for them. No single "Copy Config" export.
3. **External config file** (never considered for jam) — adds a build/load step.

**Where it landed:** Option 1. Single CONFIG object is an architectural requirement enforced in agent prompts.
**Door status:** Closed.

---

### Q: How do agents verify their own work?

| Date | Event |
|------|-------|
| Mar 15 | AGENT-TESTING.md written. Puppeteer-based test harness. Game exposes `window.__TEST_API` for automated access to game state. Tests run after every commit. |

**Options:**
1. **Puppeteer smoke + physics tests** (current position) — headless Chrome, ~690 lines total across 6 test files, built incrementally per layer. Agents run after every commit.
2. **No automated testing** (rejected) — Greg spends morning review time on "does it load? does it crash?" instead of "does it feel good?"
3. **Unit test framework** (rejected) — overkill for a jam. WebGL state is hard to unit test. Puppeteer tests the actual game.

**Where it landed:** Option 1. Puppeteer + `__TEST_API`.
**Door status:** Closed.

---

### Q: Which mouse control model should be the default?

| Date | Event |
|------|-------|
| Mar 15 | CONTROLS.md analyzes three mouse models. Model 1 (distance = thrust intensity) ranked as RECOMMENDED START. Model 2 (binary click) as safe fallback. Model 3 (drag magnet) as "probably wrong for LBH." |

**Options:**
1. **Model 1: Mouse = aim, distance = thrust intensity** (recommended) — gives analog thrust from a mouse. Cursor distance from ship = thrust power. Risk: managing position AND direction simultaneously.
2. **Model 2: Mouse = aim, click = binary thrust** (fallback) — simpler. No nudge/burn distinction. Fluid does the analog work.
3. **Model 3: Mouse = velocity target (drag magnet)** (likely rejected) — intuitive but removes "fighting the current" as a skill.

**Where it landed:** Model 1 recommended start, Model 2 as fallback if Model 1 feels bad. Model 3 worth 20 minutes of testing to confirm it's wrong. Dev panel should include a dropdown to swap models live.
**Door status:** Playtesting. Monday morning will decide.

---

### Q: When does DualSense controller support get added?

| Date | Event |
|------|-------|
| Mar 15 | CONTROLS.md defines full DualSense mapping (analog triggers, adaptive resistance, HD haptics). ROADMAP.md places it as Tuesday/Wednesday work. |

**Options:**
1. **Monday night alongside physics** (rejected) — adds complexity to the critical first build. Two input methods to debug on day one.
2. **Tuesday/Wednesday after physics is locked** (current position) — physics experiment runs mouse-only (simpler). Once the winning physics is chosen, add Gamepad API. Affordance tuning may need separate values per input.
3. **Never (mouse-only jam)** (fallback) — if behind schedule, controller support is cut.

**Where it landed:** Option 2. Tuesday/Wednesday stretch. Mouse-only for Monday.
**Door status:** Open. Depends on Tuesday velocity.

---

## Signal Upside Contingency

### Q: Signal Upside Contingency (if tax-only fails Wednesday)

| Date | Event |
|------|-------|
| Mar 15 | Forge Review #2 flags that signal-as-pure-tax may teach players to "do less." Recommends pre-speccing the contingency now so Wednesday is implementation, not debate. |

**Options:**
1. **High signal improves wreck detection** (Forge's recommendation) — above 50% nearby unrevealed wrecks pulse, above 70% loot radius +20-30%, above 85% portal direction improves. Gives signal a clear upside without inventing a second economy.
2. **Signal increases loot pickup radius only** (simpler) — ugly but fast to implement and easy to understand.
3. **Do nothing** (current design) — signal remains pure tax. The actions that generate signal are the upside.

| Mar 15 (late) | Greg + Orrery pushback on Forge's approach. The "do less" problem is real but the fix is wrong. Signal-as-buff solves a mechanical problem with a mechanical hammer. The game wants players to make their own calculus — is this wreck worth the noise given the portal situation, the current map, what entities I can see? That's emergent and situational. A loot radius buff flattens it into "am I above or below the threshold?" Forge is thinking like a machine optimizing a system, not like a player reading a situation. |

**Where it landed:** Option 3 (do nothing) is the current position. Signal remains pure tax. The "do less" failure mode is addressed by making the things that generate signal irresistibly valuable AND making inaction costly (portals evaporate, universe dies, you leave empty-handed).

**Greg's framing:** The tension isn't "loud vs quiet." It's "ambitious vs conservative." Both are valid strategies with different risk/reward curves. The game doesn't need to mechanically reward noise — it needs to make the *rewards of noisy actions* worth the risk. That's a content/tuning problem, not a systems problem.

**Three levers if "do less" appears in playtesting (before reaching for signal-as-buff):**
1. Make loot more tempting — core wrecks near wells have dramatically better rewards
2. Make safe routes unreliable — drifting is quiet but unpredictable, you go where the flow goes
3. Make time pressure real — portal evaporation forces action, you can't tiptoe forever

**Alternative considered but not acted on:** "Mapped terrain" — areas you've traveled through stay slightly brighter in the ASCII, giving route knowledge. Not a buff from signal level, but a natural consequence of having moved through space. Interesting but adds complexity. Backlogged.

**Door status:** Open — awaits Wednesday playtest. If all three levers fail AND the game still rewards passivity, then Forge's Option 1 is the emergency fallback. But we try the design-coherent fixes first.
**Advocates:** Greg (Option 3), Forge (Option 1 as contingency).

---

## Coordinate Systems

### Q: How do we handle coordinate systems across rendering and physics?

| Date | Event |
|------|-------|
| Mar 16 | Y-axis mismatch discovered: visual black holes (dark voids in ASCII shader) don't align with physics wells (where ship gets pulled). Multiple attempts to fix by ad-hoc Y flips in various places all failed — some fixes corrected one display path while breaking another. |
| Mar 16 | Root cause diagnosed: no single source of truth for coordinate conventions. Well positions used directly by both the fluid sim (WebGL Y-up) and the screen overlay (canvas Y-down). A well at y=0.3 appeared at 30% from the bottom in the shader but 30% from the top in the overlay. |

**Options:**
1. **Ad-hoc flips at each boundary** (what we tried — failed) — sprinkle `1.0 - y` wherever things look wrong. Creates double-flips, triple-flips, and a debugging nightmare. Every new feature that crosses the coordinate boundary risks introducing a new mismatch.
2. **Single conversion module with tested helpers** (what we're doing now) — create `coords.js` as THE coordinate authority. All coordinate spaces named and documented. All conversions go through named functions. No inline `1.0 - y` anywhere in the codebase.

**Where it landed:** Option 2. Create `coords.js` as the single coordinate authority. Three named spaces: screen (Y-down, pixels), well (Y-down, 0-1 normalized), and fluid UV (Y-up, 0-1 normalized). Every conversion between these spaces goes through a named function in coords.js. No inline flips allowed.

**Key learning:** Coordinate mismatches across WebGL (Y-up) and canvas (Y-down) WILL recur as we add features. Must be solved once structurally, not per-bug. 30+ minutes of Greg's playtesting time was wasted on a bug that should have been caught automatically.

**Door status:** Closed. This is now an architectural rule.

---

## Fluid Sim Tuning

### Q: Why did the display shader produce a washed-out white screen?

| Date | Event |
|------|-------|
| Mar 16 | Shader tuning session: adjusted display colors, contrast, tone mapping — everything still white. Velocity field arrows triggering across entire screen. |
| Mar 16 | Root cause analysis: density values accumulate to ~3850x the display range. Accretion injects ~7.7 density/frame across 4 wells. Dissipation 0.998 = only 0.2% decay/frame. Steady-state = 7.7 / 0.002 = 3850. Display shader clamps at 1.0 → everything white. |
| Mar 16 | Velocity is non-zero everywhere because wells pull constantly — explains direction chars triggering across whole screen. |

**Options:**
1. **Increase dissipation uniformly** — quick fix but kills the accretion disk richness that looked good initially
2. **Lower accretion injection rate** — would fix brightness but produce anemic accretion disks
3. **Distance-based dissipation** (chosen) — near wells: persistent (0.998), far from wells: fast fadeout (0.985). Creates natural gradient matching the pre-vis look. Steady-state near wells: 3850 (still high, but that's the display shader's job to map). Far from wells: ~0.013 (appropriately faint).
4. **Log/tone mapping in display shader only** — cosmetic fix, doesn't solve the underlying accumulation problem

**Where it landed:** Option 3 + diagnostic overlay. Distance-based dissipation creates spatial structure in the density field. Diagnostic overlay (`showFluidDiagnostic` debug flag) shows actual values at key positions so future tuning sessions work from real data, not guesswork.

**Key learning:** An aesthetically pleasing early result doesn't mean you understand the sim. The fluid looked alive because density was accumulating unchecked — it was always going to saturate. Building diagnostic readouts BEFORE tuning sessions prevents blind parameter sweeps.

**Door status:** Open — display shader still needs to be revisited with the diagnostic data. Log mapping or moderate amplification should now work since the density field has real spatial contrast.

---

## Renderer Recovery

### Q: What contract should the renderer follow for the last 3 days of the jam?

| Date | Event |
|------|-------|
| Mar 20 | Greg pauses the feature churn and asks for a renderer-specific recovery plan. The problem is no longer "the shader is buggy" in a narrow sense. The problem is that one output channel is trying to mean too many things at once: void, heat, flow, surfability, and glitch texture. |
| Mar 20 | Forge proposes a stricter three-layer contract: physics truth, scene shaping, and ASCII presentation. Black-hole readability becomes the first checkpoint, not an emergent side effect of density math. |

**Options:**
1. **Keep tuning the current combined shader** — quickest in theory, but every change keeps colliding with multiple meanings at once. High churn, low trust.
2. **Refactor around three visual signals only** — better than current state, but still too fuzzy; black holes and surf lanes would remain mixed with general "brightness."
3. **Adopt a three-layer renderer contract** (chosen) — physics truth stays honest, scene shaping defines phenomena, ASCII presentation expresses them. Void, accretion, flow, and surf opportunity become explicit player-facing reads.

**Where it landed:** Option 3. For the rest of the jam, renderer work is split into:
- physics truth
- scene shaping
- ASCII presentation

Black holes must read in the scene-shaping layer before ASCII quantization. "Density" is no longer treated as the player-facing concept; the useful interpretation is **fabric excitation**.

**Door status:** Open — this is the active renderer recovery contract until the jam ends or a playtest proves it wrong.

---

## Renderer Evaluation

### Q: How should renderer work be evaluated during the jam?

| Date | Event |
|------|-------|
| Mar 20 | Greg points out that the current screenshot-based smoke/flow harness is producing false confidence for renderer work because it samples a single convenient frame from a fluid animation. |
| Mar 20 | Forge adds a dedicated renderer harness with deterministic fixtures, timed captures, pre-ASCII scene views, final ASCII views, and a debug overlay capture. |

**Options:**
1. **Keep using smoke/flow screenshots** — easy, but they are runtime health checks, not renderer truth.
2. **Judge only by live manual play** — useful, but too hard for agents to compare and too easy to misremember.
3. **Add a dedicated renderer harness** (chosen) — stable fixtures, multiple timestamps, scene-vs-ASCII capture, one manifest per run.

**Where it landed:** Option 3. Smoke and flow remain health checks. Renderer work is evaluated through the dedicated harness.

**Door status:** Open — this remains the default evaluation path for renderer work unless something simpler proves equally trustworthy.

---

## Non-Lethal Combat Tools

### Q: What gives the player "teeth" beyond fly/loot/escape?

| Date | Event |
|------|-------|
| Mar 15 | COMBAT.md analyzes lethal vs non-lethal. Conclusion: no lethal, build interaction tools. Priority: signal flare → force pulse → tether → EMP. |
| Mar 20 | Greg: "it needs some teeth. i think AI + big threat + dying universe actually working + some non-flight gameplay feels like a good outcome for the jam." Confirms non-lethal tools should ship this week. |
| Mar 20 | Three tools designed in detail: force pulse (spacebar, radial shove, wave ring, emergency escape), signal flare (shift, decoy signal source, misdirects AI), tether (right-click, attach to wreck/planetoid). |

**Options:**
1. **No combat tools** — pure fly/loot/escape. Clean but thin.
2. **Non-lethal physics tools** (chosen) — force pulse, signal flare, tether. Affect physics and information, not HP.
3. **Lethal weapons** (rejected for jam) — projectiles through fluid, kill/loot.

**Where it landed:** Option 2. Force pulse Friday, tether Saturday, signal flare Saturday (depends on signal system).
**Door status:** Open — order and details may shift based on playtesting.

---

## AI Scavengers

### Q: Should the world have AI opponents?

| Date | Event |
|------|-------|
| Mar 15 | Design doc establishes scavengers as one of three threat tiers. Forge downgrades to stretch. |
| Mar 20 | Greg pulls scavengers forward as a Friday priority. "We need to make parts of this anyway to make inhibitors." Scavenger AI shares movement architecture with Inhibitor. |
| Mar 20 | Two archetypes designed: drifters (passive, ride currents, loot conservatively) and vultures (aggressive, race player for wrecks/portals). Same ship physics as player. |

**Key decisions:**
- Portals consumed on scavenger extraction (confirmed by design doc)
- Scavengers die to wells (same kill radius as player)
- Same fluid physics as player (thrust + coupling + drag + gravity)
- 70/30 drifter/vulture split

**Where it landed:** Building Friday. See SCAVENGERS.md for full design.
**Door status:** Open — archetype behaviors will be tuned by playtesting.

---

## Gravity Slingshot

### Q: Can wells be used as movement tools, not just threats?

| Date | Event |
|------|-------|
| Mar 20 | Greg proposes a "slingshot" feature — intentionally use gravity and rotational velocity around wells to hook-and-swing between stellar objects. Like grappling hooks or rail grinding. |
| Mar 20 | Full design: approach → catch → orbit → release → boost. Hybrid input model (auto-catch, thrust-to-release). Orbital assist force prevents turbulence from breaking the maneuver. 2-3x speed boost on release. |

**Why it matters:** Wells are currently pure threats. Slingshot makes them the fastest route IF you're skilled enough. Creates a movement skill ceiling that ties directly to Pillar 2 (Movement Is the Game).

**Where it landed:** Designed. Prototype priority TBD — may build Friday/Saturday or cut if time collapses. See SLINGSHOT.md.
**Door status:** Open — most feel-dependent feature on the list, needs dedicated tuning session.

---

## Cosmic Signatures

### Q: How do we make runs feel different from each other?

| Date | Event |
|------|-------|
| Mar 20 | Greg confirms cosmic signatures for the jam: per-run universe personality that tweaks CONFIG and gives a name. |
| Mar 20 | 6 signatures designed: the slow tide, the shattered merge, the thick dark, the graveyard, the rush, the deep. Each has flavor text and CONFIG overrides. |

**Where it landed:** Building Friday. Pure JS, ~100 lines, no dependencies. See SIGNATURES.md.
**Door status:** Open — signature list will grow. Balance depends on base CONFIG values being stable.

---

## Audio for the Jam

### Q: How much of MUSIC.md ships this week?

| Date | Event |
|------|-------|
| Mar 15 | MUSIC.md designs full 5-layer procedural soundscape. |
| Mar 20 | Jam-scoped audio plan: Layer 1 (drone), Layer 2 (well harmonics), event sounds. Layers 3-5 deferred. All Web Audio API, no libraries. |

**Where it landed:** Building Friday. See AUDIO.md for jam scope. ~175 lines total.
**Door status:** Open — additional layers slot in when their prerequisite systems exist (signal choir needs signal, Inhibitor tone needs Inhibitor).

---

## Workstream Split

### Q: How do Forge, Claude/Orrery, and Orb divide remaining jam work?

| Date | Event |
|------|-------|
| Mar 20 | Forge writes RENDERER-RECOVERY-PLAN.md. Proposes clean split: Forge owns renderer, Claude owns gameplay/content, Orb owns routing. |
| Mar 20 | Greg confirms. Signal system parked until renderer stabilizes. |

**Where it landed:**
- Forge: renderer architecture, display shader, ASCII, diagnostics, scaling
- Claude/Orrery: AI scavengers, combat tools, audio, cosmic signatures, slingshot, game systems
- Orb: routing, handoffs, keeping workstreams isolated

**Door status:** Active until jam ends.

---

## Template for New Entries

```
### Q: [The question]

| Date | Event |
|------|-------|
| [date] | [what happened] |

**Options:**
1. **[Option name]** ([who advocated]) — [description]. [Tradeoffs].
2. ...

**Where it landed:** [Current answer]
**Door status:** Closed / Open / Playtesting
```

---

## Sim / Client Decoupling

### Q: How should LBH split simulation from the player executable for scale and future multiplayer?

| Date | Event |
|------|-------|
| Mar 20 | Greg asks for a design to split the authoritative sim out of the player executable, both to prepare for multiplayer and to separate render performance from world-sim performance. |
| Mar 20 | Current architecture review identifies the main seams: ship/scavengers sample GPU fluid directly, several systems mutate fluid as a side effect, some updates are camera-culled, and the main loop mixes fixed `simDt` and frame `dt`. |
| Mar 20 | Decision: the current WebGL fluid sim will **not** become the authoritative server model. The authoritative side will own gameplay truth and a cheaper flow-field model; the client will own high-frequency visual reconstruction and ASCII presentation. |
| Mar 20 | Recommended clocks set: 15 Hz authoritative sim, 10-15 Hz snapshots, 30-60 fps client render. Lower-frequency bands (5-10 Hz AI decisions, 1-2 Hz macro collapse systems) are explicitly allowed. |
| Mar 20 | First implementation slice lands in-process: `FlowField.sample(wx, wy)` becomes the new gameplay-facing velocity interface, `SimState` centralizes run timers, and `SimCore` takes over the fixed world-update block from `main.js`. The app still runs in one process, but the client loop now talks to a sim boundary instead of owning the sim step directly. |
| Mar 20 | Second implementation slice: the world update no longer depends on camera position and now runs on a fixed-step accumulator inside `SimCore`. Loot, wreck, and portal systems still inject visual/fluid effects, but they are no longer culled by the render camera during the sim step. |
| Mar 20 | LBH now has a canonical local process model: dev server on `8080`, harness server on `8719`, and no separate sim PID yet. The future dedicated sim/server process is explicitly backlogged instead of being implied by the current app shape. |

**Options:**
1. **Keep one-process app forever** — simplest now, but scale and multiplayer both get worse from here.
2. **Authoritative server runs the full WebGL fluid sim** — sounds pure, but it is the wrong shape: GPU-bound, expensive to replicate, and too tightly coupled to rendering.
3. **Authoritative sim owns gameplay + coarse flow truth, client owns visual fluid reconstruction** (chosen) — clean separation, better scale, direct path to multiplayer.

**Where it landed:** Option 3. First milestone is interface decoupling inside one app: `flowField.sample(wx, wy)`, `SimState`, and a fixed-step `SimCore`, before any actual second process exists.
**Door status:** Open — exact field representation can evolve, but the split between gameplay truth and visual fluid is now the working direction.

---

## Large-Map Client Performance

### Q: Why do `5x5` and `10x10` maps collapse in frame rate, and what is the right first fix?

| Date | Event |
|------|-------|
| Mar 20 | Greg reports current playtest reality: `3x3` holds around 60 fps, `5x5` falls to ~15 fps, and `10x10` drops below 5 fps. |
| Mar 20 | Perf review shows the main culprit is not view frustum or world size directly. The viewport still only shows roughly one world-unit. The real problem is that larger maps contain many more entities, and each entity was causing full-screen fluid passes every fixed sim tick. |
| Mar 20 | Wells identified as the worst offender. Old path cost roughly `41–122` full-screen passes per well per sim step depending on point count. `Deep Field` was spending well over a thousand well-only passes per step before even counting the base fluid solver. |
| Mar 20 | Stars identified as the second offender. Old path cost `27` full-screen passes per star per step. |
| Mar 20 | `Deep Field` also forces `fluidResolution = 512`, compounding the pass-count explosion with ~4× the pixel cost of the default `256` sim. |
| Mar 20 | Decision: stop using the sim as a paintbrush. Decorative accretion bands and star spikes move toward the renderer/presentation layer; the fluid sim keeps only the force field and the minimum scene-shaped signals needed for readable hazards. |
| Mar 20 | First cuts land: distance-based dissipation only tracks wells + stars, well accretion splat storms are removed from the sim path, and star ray splats are removed from the sim path. |

**Options:**
1. **Tune frustum/camera first** — tempting, but wrong as the primary fix because the viewport is not what is scaling up.
2. **Keep the current entity splat model and only lower resolution/tick** — helps, but preserves the real structural waste.
3. **Move visual-only field shaping out of the sim path, then tune map-scale budgets** (chosen) — reduces the biggest cost center without giving up the long-term client/server direction.

**Where it landed:** Option 3. The first perf fix is structural: cut per-entity full-screen splat work. Then revisit large-map resolution and sim tick budgets with the new baseline.
**Door status:** Open — `10x10` likely still needs map-specific resolution or fixed-tick tuning after the structural cuts.

---

## Renderer / Tile-Boundary Propagation

### Q: Why were hard seams showing up near apparent world/tile edges?

| Date | Event |
|------|-------|
| Mar 21 | Greg flags renderer boundaries that look like tile seams and asks for a review of both physics propagation and renderer propagation across world tiles. |
| Mar 21 | Code review confirms the core physics sim is toroidal in the GPU path: fluid textures use `REPEAT`, world-space entity math uses shortest-path wrap, and well/dissipation shaders already use `diff - round(diff)`. |
| Mar 21 | Two non-toroidal seams are found outside the core sim: the renderer was mixing wrapped sim samples with unwrapped world-noise/cell anchoring, and the CPU flow-field readback path was clamping UVs instead of wrapping them. |
| Mar 21 | A second visual artifact is identified: wells were still writing subtractive visual density every fixed sim tick. The sim stayed continuous, but the accumulated negative field turned into large blocky dark slabs after the ASCII quantization pass. |
| Mar 21 | Decision: world-edge behavior must match across all three layers — GPU sim, CPU readback, and ASCII presentation. The renderer should own well silhouettes analytically; the sim should not keep painting persistent subtractive well blobs into `visualDensity`. |

**Options:**
1. **Treat it as only a shader bug** — too narrow; misses the CPU readback mismatch and the per-tick visual accumulation.
2. **Treat it as only a sim/topology bug** — incorrect; the core fluid sim was already toroidal.
3. **Make wrapping consistent end-to-end and move well silhouettes fully into the renderer** (chosen) — fixes the real seam and removes the fake one.

**Where it landed:** Option 3. The sim stays toroidal, CPU readback now wraps like the sim, the ASCII layer now anchors from wrapped world-space, and the renderer owns the black-hole core directly instead of inheriting a saturated subtractive splat field.
**Door status:** Open — if boundary artifacts persist after this, the next suspect is cell-space quantization or scene-specific shaping, not world-topology mismatch.

| Mar 21 | Follow-up review on real gameplay maps finds a second bug: the display shader was applying `voidField` inside the per-well loop. That meant scene-level darkness was being compounded once for every well, which made many gameplay holes vanish into broad black slabs even though the title screen still looked acceptable. |
| Mar 21 | Decision: keep `voidField` as a scene-level term and only let each well apply its own `coreMask`. Multi-well gameplay readability matters more than squeezing both concepts through one multiply. |

---

## Network Architecture Direction

### Q: What is the actual next-step network architecture after the in-process sim boundary?

| Date | Event |
|------|-------|
| Mar 27 | Greg confirms the target direction: LBH is fundamentally multiplayer-first, with solo as fallback if no other players are around. |
| Mar 27 | Greg also confirms that the correct client/server shape is a locally rendered client talking to an authoritative sim, not streamed gameplay from the mini to the MacBook. |
| Mar 27 | The architecture discussion is split into four futures instead of one rewrite: private remote play on Greg's machines, hosted authoritative sessions, native runtime migration, and possible Godot port work. |
| Mar 27 | Decision: next week should focus on the first two together — prove mini-hosted authoritative sim + MacBook client over Tailscale/LAN, and freeze the first local client/server protocol at the same time. |
| Mar 27 | Hosted future is tentatively defined as run-scoped authoritative instances for 4-8 players, with solo fallback and likely AI fill. |
| Mar 27 | Native/Godot migration is explicitly deferred until the protocol and process boundaries are real. |

**Options:**
1. **Stay effectively local for now** — keep the in-process boundary but postpone real remote play. Simpler short term, but it does not prove the architecture.
2. **Jump straight to public hosting and matchmaking** — ambitious, but premature while the protocol and authority model are still settling.
3. **Private authoritative split first, then hosted run instances** (chosen) — proves the right boundary on Greg's machines, then scales that model outward later.

**Where it landed:** Option 3. The next real milestone is private remote play between Greg's machines with a local-rendering client and an authoritative sim, plus the first stable protocol that hosted sessions can later reuse.
**Door status:** Open — the hosted shape and eventual runtime port remain future decisions, but the immediate next batch is now defined.

| Mar 27 | First implementation slice lands for the network direction: a separate local sim-server shell, PID-managed control commands, and a first plain-data protocol (`join`, `input`, `snapshot`, `events`, `session/start`). It is still a stub authority, but the process boundary and message shapes now exist in code. |
| Mar 27 | Second implementation slice lands: the sim server now loads real playable maps, owns map/entity snapshots, chooses safe spawns, and applies well death/respawn authoritatively. The server is still not the whole game, but it now owns actual run state instead of only toy movement. |
| Mar 27 | Third implementation slice lands: the browser client can now opt into remote authority with `?simServer=...`, start a fresh authoritative run from map select, join it, send player input, and render locally from authoritative snapshots. |
| Mar 27 | Follow-up decision: launching from map select should start a fresh authoritative session, not implicitly join an existing run on the same map. Real join/lobby semantics are future work once the basic remote path is stable. |
| Mar 27 | Follow-up correction: the timed auto-respawn in the sim server was too toy-like and did not match LBH's real death loop. The authoritative server now leaves the player dead and lets reset/relaunch own the restart boundary. |
| Mar 28 | Fourth implementation slice lands: the sim server now owns portal waves, extraction, wreck pickup, cargo truth, and death-time cargo loss. The remote browser path can now complete more of a real run instead of only driving a ship against static authoritative wells. |
| Mar 28 | Chrome DevTools MCP is adopted as a project-scoped browser inspection tool through `.mcp.json`. Decision: keep Puppeteer as deterministic test infrastructure, use MCP as live browser eyes for renderer/perf/debug work. |
| Mar 28 | Follow-up testing decision: do not replace the harness with MCP. Instead, add one honest menu/profile suite and one honest remote-authority suite, while keeping the existing helper-driven gameplay suites for speed. |
| Mar 28 | Next architecture choice: make remote runs feel like the real game by moving rival scavengers onto the authoritative server before chasing broader combat parity. This keeps the migration pointed at a competitive run, not just a solo movement demo. |
| Mar 28 | Next follow-through: remote consumables and pulse timing should move server-side before broader combat. Otherwise remote runs still lie about item truth and player timing. |
| Mar 28 | Implementation lands: authoritative snapshots now carry active effect state, remote join sends real loadout data, the server applies consumables and pulse events, and the remote-authority suite now verifies those protocol-level systems. |
| Mar 29 | Next correction: remote inventory mutation also has to cross the boundary. Otherwise a remote run can move and consume items honestly, but opening the inventory still edits only local UI state. |
| Mar 29 | Implementation lands: the protocol now includes discrete `inventoryAction` requests, the sim server owns equip/load/drop/unload mutations during live runs, dropped cargo spawns authoritative wrecks, and the server inventory model now uses the same fixed eight-slot cargo semantics as the client. |
