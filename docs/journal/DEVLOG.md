# Last Black Hole — Development Journal

> A running log of the game jam, newest entries first.
> Started pre-jam March 14, 2026. Code starts Monday March 16, 12:01a.

---

## How to Read This

Each entry covers a day (or shift). Entries include what happened, why decisions were made, what was cut, and what questions remain. This is the raw creative record — designed to be mined later for content (threads, posts, videos).

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

### State at End of Night

- V2 physics running: steady currents + orbital flow + event wave rings
- Ship simplified to 5 CONFIG values
- Display shader encodes flow direction as color bands
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
