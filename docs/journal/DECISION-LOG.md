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
**Door status:** Open. Experiments will converge or one will win.

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
