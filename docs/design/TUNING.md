# Tuning Workflow: How We Iterate on Feel

> The game IS feel. The tuning workflow IS the development process.
> This doc defines how Greg gives feedback, how agents translate it,
> and what tools we build to make iteration fast.

---

## The Core Problem

A game jam is 168 hours. The fluid sim might take 5 of those. The ASCII shader maybe 3. The remaining 160 hours are **tuning** — making it feel right. Every design doc we've written is just a starting hypothesis. The game will tell us what the real values are.

We need a workflow where:
1. Greg plays and feels something ("this is too floaty," "that wave was uncatchable")
2. That feeling gets translated into parameter changes
3. The change is visible immediately (not: rebuild, reload, play for 2 minutes to reach the same game state)
4. The before/after is comparable
5. Good values get committed, bad ones get reverted

---

## Tuning Modes (Built Incrementally)

### Mode 1: Dev Panel (Monday — ships with L0)

A persistent, collapsible overlay panel with sliders for every tunable constant. This is the **minimum viable tuning tool** and it ships on day one alongside the physics prototype.

**What it looks like:**
- Floating `<div>` with `position: fixed`, top-right, toggle with backtick (`` ` ``) key
- Sliders grouped by system (ship, fluid, wells, affordances)
- Each slider shows: label, current value, range
- Changes apply immediately (no reload)
- "Copy Config" button dumps the current config object as JSON to clipboard
- "Reset" button restores defaults
- "Presets" dropdown: save/load named configurations

**What Greg does:**
- Plays the game
- Opens panel, drags a slider
- Feels the change instantly
- Keeps tuning until it's right
- Hits "Copy Config" and pastes it to the agent (or commits directly)

**What this replaces:**
- The "Greg gives plain English, agent picks numbers" loop (too slow, too many round trips)
- The "rebuild and reload" cycle (kills iteration speed)
- The "I think it was better before" problem (presets let you A/B)

**Monday L0 sliders:**

| Group | Slider | Range | Default | Notes |
|-------|--------|-------|---------|-------|
| Ship | Thrust force | 0.1–10 | TBD | Relative to well pull |
| Ship | Fluid coupling | 0–1 | 0.8 | 0 = ignores fluid, 1 = pure fluid |
| Ship | Turn rate | 30–360°/s | 180 | |
| Ship | Turn curve power | 1–4 | 2.0 | 1 = linear, higher = more ease-in |
| Ship | Drag (in-current) | 0–1 | 0.1 | |
| Ship | Drag (against-current) | 0–1 | 0.3 | |
| Ship | Mass | 0.1–5 | 1.0 | |
| Fluid | Viscosity | 0–0.01 | 0.001 | |
| Fluid | Sim resolution | 64/128/256/512 | 256 | Dropdown, requires restart |
| Wells | Gravity strength (G) | 0.1–20 | TBD | |
| Wells | Gravity falloff | 1–3 | 2.0 | Exponent: 1=linear, 2=inverse-square |
| Wells | Wave amplitude | 0–5 | TBD | |
| Wells | Wave frequency | 0.1–5 Hz | TBD | |
| Wells | Terminal infall speed | 0–max | TBD | 0 = no cap |
| Affordances | Wave catch window (deg) | 0–45 | 15 | |
| Affordances | Wave lock strength | 0–1 | 0.1 | |
| Affordances | Well shoulder width | 0–0.5 | 0.2 | As fraction of pull radius |
| Affordances | Counter-steer damping | 0–1 | 0.3 | |
| ASCII | Cell size | 4–20 | 8 | Pixels per ASCII cell |
| ASCII | Color temperature | slider | — | Cold↔warm shift |
| Debug | Show velocity field | toggle | off | Arrows overlaid |
| Debug | Show well radii | toggle | off | Circles for pull/shoulder/commitment |
| Debug | Show catch windows | toggle | off | Highlight surfable zones |
| Debug | FPS counter | toggle | on | |

**Implementation:** ~200 lines of DOM code. One `CONFIG` object that every system reads from. Sliders write to `CONFIG` directly. No framework needed — `document.createElement` + `input[type=range]`.

### Mode 2: Sandbox Mode (Monday evening / Tuesday)

A non-game mode for testing specific interactions in isolation. Toggle with `Tab` or a panel button.

**Sandbox features:**
- **Freeze time** — pause the sim, inspect the flow field, resume
- **Teleport ship** — click to place the ship anywhere (test "what does it feel like HERE?")
- **Spawn/remove wells** — click to add/remove gravity wells (test 1, 2, 3, 5 well configs without restarting)
- **Drag wells** — click and drag to reposition wells (test interference patterns)
- **Slow motion** — 0.25x / 0.5x / 1x / 2x time scale (see wave behavior in detail)
- **Wave visualizer** — overlay showing wave fronts as concentric lines (debug the wave feel)
- **Restart fluid** — clear the sim and let it settle fresh with current well config (test "what does it look like from cold start?")

**What this replaces:**
- Playing a full 10-minute run just to test one parameter in one scenario
- Restarting the game every time you want to test a different well count
- Guessing what the flow field looks like without visual aids

**Implementation:** ~300 lines. Event listeners for click/drag in sandbox mode, time-scale multiplier on the sim loop, overlay rendering for debug vis.

### Mode 3: Scenario Snapshots (Wednesday — ships with L2)

Save and restore specific game states so you can test the same moment repeatedly.

**Features:**
- **Save snapshot** — captures: well positions/masses, ship position/velocity, fluid state (if feasible, or just well config + time), entity positions, signal level
- **Load snapshot** — restore to that exact moment
- **Named scenarios:**
  - "Shore Break" — ship near a well's danger zone, strong pull, wave incoming
  - "The Lineup" — ship positioned upstream, multiple waves approaching
  - "Escape" — ship in shoulder zone, well pulling, Inhibitor behind
  - "Portal Rush" — two portals left, one about to evaporate, ship mid-map
  - "Signal Ceiling" — signal at 85%, one more wreck ahead, Inhibitor threshold unknown

**What this replaces:**
- "Play for 6 minutes to recreate the situation I want to test"
- "I can't reproduce that one bug / that one amazing moment"

**Implementation:** Serialize game state to JSON. localStorage or dev panel button. ~150 lines.

### Mode 4: A/B Testing (Thursday — ships with L3/L4)

Compare two configurations side by side.

**Features:**
- **Split screen** — run two instances with different configs simultaneously
- **Or: toggle** — hotkey swaps between config A and config B instantly during play
- **Record** — capture 30 seconds of play, then replay with different config to compare feel

Not essential for jam, but valuable if we're stuck on a tuning decision. Could be as simple as two preset slots and a hotkey to swap.

---

## The Feedback Loop by Day

### Monday: Raw Physics Feel

**Tuning tools available:** Dev Panel (Mode 1)

**Greg's feedback vocabulary:**
- "Too floaty" → increase fluid coupling, increase drag
- "Too sluggish" → decrease mass, decrease viscosity, increase thrust
- "Can't catch waves" → widen catch window, increase lock strength, increase wave amplitude
- "Wells don't feel dangerous" → increase gravity strength, decrease shoulder width, tighten terminal speed cap
- "Surfing doesn't feel like surfing" → check: are waves propagating? Is the velocity gradient steep enough? Is the ship's fluid coupling high enough to feel the crest?
- "ASCII doesn't pop" → adjust cell size, color mapping, character density ramp

**Workflow:**
1. Greg opens `index.html`, plays for 2 minutes
2. Opens dev panel (`` ` ``), adjusts sliders live
3. Plays more, adjusts more
4. When it feels right: "Copy Config" → pastes JSON into chat or commits directly
5. Agent updates defaults in code to match Greg's tuned values

### Tuesday: Extraction Loop Feel

**Tuning tools available:** Dev Panel + Sandbox (Modes 1-2)

**New sliders added for L1:**

| Group | Slider | Range | Default |
|-------|--------|-------|---------|
| Wrecks | Count | 3–30 | 12 |
| Wrecks | Loot radius | 10–100px | 40 |
| Wrecks | Approach cone | 0–90° | 30 |
| Wrecks | Deceleration assist | 0–1 | 0.3 |
| Portals | Count | 1–8 | 4 |
| Portals | First evap time | 30–300s | 120 |
| Portals | Evap acceleration | 0–2 | 0.5 |
| Portals | Approach magnetism | 0–1 | 0.5 |
| Universe | Well growth rate | 0–5%/min | 1 |
| Universe | Viscosity ramp | 0–10%/min | 5 |
| Universe | Run length target | 3–20min | 10 |

**Greg's feedback vocabulary:**
- "Too many wrecks" → reduce count
- "Portals die too fast" → increase first evap time, decrease acceleration
- "No urgency" → faster portal evap, faster well growth
- "Too hard to loot" → wider approach cone, more deceleration assist, bigger loot radius
- "Wrecks don't feel like terrain" → check wreck-fluid coupling (boundary conditions in pressure solve)

**Sandbox use:** Place the ship near a wreck, test approach stickiness feel. Place the ship near a portal, test alignment magnetism. Drag wells closer to test late-game feel without playing 8 minutes.

### Wednesday: Signal + Threat Feel

**Tuning tools available:** Dev Panel + Sandbox + Scenario Snapshots (Modes 1-3)

**New sliders for L2:**

| Group | Slider | Range | Default |
|-------|--------|-------|---------|
| Signal | Thrust emission | 0–5%/s | 1.5 |
| Signal | Against-current multiplier | 1–5x | 2.5 |
| Signal | Loot spike (surface) | 0–30% | 12 |
| Signal | Loot spike (deep) | 0–50% | 22 |
| Signal | Loot spike (core) | 0–70% | 38 |
| Signal | Decay rate | 0–10%/s | 3 |
| Signal | Wreck masking | 0–1 | 0.5 |
| Inhibitor | Threshold | 50–100% | 90 |
| Inhibitor | Threshold variance | 0–20% | 10 |
| Inhibitor | Speed (vs player) | 1–3x | 1.5 |
| Inhibitor | Track interval | 1–10s | 3 |
| Inhibitor | Silent-stop delay | 1–15s | 5 |
| Inhibitor | UI corruption rate | 0–30% | 15 |

**Key scenarios to save:**
- "Pre-threshold" — signal at 80%, testing: does the approach feel tense?
- "Inhibitor chase" — Inhibitor spawned, ship fleeing, testing: is escape possible?
- "Silent hide" — Inhibitor searching, ship drifting near wreck, testing: does masking work?

**Greg's feedback vocabulary:**
- "Signal rises too fast" → reduce thrust emission, reduce loot spikes
- "No reason to be loud" → signal needs upside (Forge's concern) — this is a design decision, not a tuning knob
- "Inhibitor is annoying, not scary" → adjust speed ratio, reduce tracking interval (more relentless), increase UI corruption
- "Inhibitor is unfair" → increase silent-stop delay, widen wreck masking, slow tracking
- "The threshold surprise is good/bad" → adjust variance, consider revealing vs hiding

### Thursday-Friday: Full Game Balance

**Tuning tools available:** All modes (1-4)

**New sliders for L3-L5:**

| Group | Slider | Range | Default |
|-------|--------|-------|---------|
| HUD | Panel opacity | 0–1 | 0.85 |
| HUD | Warning hold time | 0.5–5s | 2.5 |
| HUD | Corruption intensity | 0–1 | 0.7 |
| Audio | Master volume | 0–1 | 0.7 |
| Audio | Drone volume | 0–1 | 0.4 |
| Audio | Well harmonics | 0–1 | 0.3 |
| Audio | Signal choir | 0–1 | 0.5 |
| Audio | Inhibitor tone | 0–1 | 0.6 |
| Visual | Ship trail length | 0–30 | 15 |
| Visual | Entity halo radius | 0–10 cells | 3 |
| Visual | Screen shake intensity | 0–2 | 1.0 |
| Visual | Feedback buffer decay | 0.8–1.0 | 0.92 |
| Progression | Exotic Matter multiplier | 0.1–5 | 1.0 |
| Progression | Upgrade cost scaling | 1–3x | 1.5 |

**Greg's feedback vocabulary expands:**
- "HUD is too busy" → reduce panel count, increase opacity (more solid, less competing with game)
- "HUD is too subtle" → decrease opacity (more see-through), or increase font size
- "Audio is overwhelming" → reduce individual layer volumes, or add master ducking
- "Can't hear the waves" → increase wave rhythm volume, decrease drone
- "Ship trail is distracting" → reduce trail length, reduce opacity
- "Not enough screen shake" → increase intensity
- "Upgrades are too expensive" → decrease cost scaling or increase Exotic Matter multiplier

### Saturday-Sunday: Polish + Ship

No new tuning tools. The dev panel gets a "Production Mode" toggle that hides all debug overlays and locks the config to committed defaults. The panel itself is still accessible via `` ` `` for last-minute tweaks.

---

## Plain English → Numbers Translation Guide

For when Greg describes a feeling and the agent needs to pick a starting adjustment:

| Greg Says | What to Adjust | Direction | Magnitude |
|-----------|---------------|-----------|-----------|
| "Floaty" | Fluid coupling, drag | Up | 10-20% |
| "Sluggish" | Mass, viscosity | Down | 10-20% |
| "Twitchy" | Turn rate, thrust smoothing | Down rate / up smoothing | 15-25% |
| "Unresponsive" | Turn rate, thrust force, thrust ramp | Up | 15-25% |
| "Can't catch waves" | Catch window, lock strength | Up | Widen 5-10°, strength 2x |
| "Waves too easy" | Catch window, lock strength | Down | Narrow 5°, strength 0.5x |
| "Wells aren't scary" | Gravity strength, shoulder width | Up strength / narrow shoulder | 20-30% |
| "Wells are unfair" | Shoulder width, terminal speed, escape assist | Widen / cap / boost | 20-30% |
| "Too quiet" (gameplay) | Wave amplitude, signal emission rates | Up | 25-50% |
| "Too noisy" (gameplay) | Wave amplitude, entity density | Down | 15-25% |
| "Runs too short" | Portal evap timing, well growth | Slow down | 20-30% |
| "Runs too long" | Portal evap timing, well growth, viscosity ramp | Speed up | 15-25% |
| "Not scary enough" | Inhibitor speed, tracking interval, UI corruption | Faster / more frequent / higher | 20-30% |
| "Unfairly scary" | Inhibitor speed, silent-stop, wreck masking | Slower / longer / wider | 15-25% |

**Rule of thumb:** Start with 20% adjustments. If that doesn't feel different enough, go 50%. If 50% doesn't work, the problem isn't the number — it's the mechanic.

---

## Building the Dev Panel: Implementation Notes

The dev panel is a **Monday morning task** — it ships alongside or immediately after the physics prototype. It's not optional. Without it, every tuning cycle requires an agent to change code, commit, and Greg to reload. With it, Greg can tune for 30 minutes straight without any agent involvement.

### Architecture

```
CONFIG object (top of main.js)
  ↓ every system reads from CONFIG
  ↓ dev panel sliders write to CONFIG
  ↓ changes are instant (no reload)
```

- Every tunable value lives in a single `CONFIG` object
- Every system reads from `CONFIG` every frame (not cached at init)
- Dev panel creates sliders that write to `CONFIG` properties
- "Copy Config" serializes `CONFIG` to JSON
- "Load Config" parses JSON and applies to `CONFIG`
- "Presets" are named JSON blobs in localStorage

### Progressive Enhancement

- Monday: ship, fluid, well, basic affordance sliders (~20 sliders)
- Tuesday: wreck, portal, universe sliders (~10 more)
- Wednesday: signal, Inhibitor sliders (~12 more)
- Thursday: HUD, audio, visual sliders (~15 more)
- Friday: progression sliders (~4 more)
- Each layer's agent prompt should include "add sliders to dev panel for all new tunables"

### The "Commit Tuning" Workflow

1. Greg tunes in the dev panel until it feels right
2. Greg hits "Copy Config" → gets JSON blob
3. Greg pastes it into chat: "these values feel good, commit them"
4. Agent updates `CONFIG` defaults in code, commits with `Tune:` prefix
5. Commit message includes what changed and why ("waves were uncatchable, widened catch window from 15° to 22°, feels much better")

Or, if Greg is committing directly:
1. Greg tunes → "Copy Config" → paste into code → save → commit
2. Agent sees the diff on morning review, understands the tuning direction

---

## Updating the Roadmap

The dev panel and sandbox are build requirements. They should be in the task list:

- **Task N2 (new): Dev Panel** — Monday night, after N1a/N1b, before morning review. Greg MUST have sliders to play with when he reviews the prototypes.
- **Sandbox mode** — Monday evening parallel task while Greg tunes. Can be built while Greg is playing.
- **Scenario snapshots** — Wednesday parallel task alongside audio. Saves time during signal tuning.
- **Each layer's night prompt** should include: "Add dev panel sliders for all new tunables in this layer."

The agent prompts (AGENT-PROMPTS.md) should be updated to require:
- A `CONFIG` object for all tunables
- Dev panel integration for all new values
- "Copy Config" support from day one
