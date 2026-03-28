# Threat Model: What Hunts You

> Signal is the input. This document designs the output.

## The Gap

The universe currently gets harder on a timer (wells grow, portals disappear) but doesn't react to what you do. Fly cautiously or recklessly — the consequences are the same. Signal without reactive threat is a meter that fills up and means nothing.

This document designs four threat systems that give signal its teeth. They're not mutually exclusive — they layer. Build them in this order because each one depends on the previous.

---

## A: Scavengers Get Teeth

> The NPCs stop being peers and start being predators.

### Current State

Scavengers compete for loot and portals. They have two archetypes (drifter/vulture) and three factions. But they never attack. They're ambient life, not threats.

### The Change

Scavenger behavior toward the player scales with signal level. Low signal: they ignore you or compete passively. High signal: they actively hunt you.

### Behavior Tiers

**Ghost/Whisper (signal 0-0.35): Indifferent**
- Current behavior. Scavengers loot wrecks, seek portals, ignore you.
- Bump collision still applies (they don't avoid you, but they don't seek you).
- Drifters and vultures behave the same toward you.

**Presence (0.35-0.55): Aware**
- Drifters give you a wider berth. They reroute around your position when choosing wrecks.
- Vultures start shadowing — they follow at a distance, waiting for you to loot something so they can contest the next wreck.
- If you're near a wreck and a vulture is nearby, the vulture races you for it. Existing mechanic but now *triggered by signal awareness*.

**Beacon (0.55-0.75): Hostile**
- Vultures become aggressive:
  - **Cargo raid**: if a vulture catches you (gets within bump distance), it steals one random cargo item. You get a warning ("Reaper Keen Edge stole Quantum Coil!"). The vulture adds it to its own loot and beelines for a portal.
  - **Portal blocking**: vultures will orbit near active portals, body-blocking your approach. Not a wall — you can push through — but it costs time and generates more signal from the collision.
- Drifters become informants:
  - Drifters that spot you at Beacon+ will accelerate toward the nearest vulture, "reporting" your position. This gives vultures a heading even if they can't see you directly.
  - Visual tell: drifter emits a brief flash/pulse when it "reports."

**Flare/Threshold (0.75+): Predatory**
- All vultures on the map converge on your position. No more competing for wrecks — you ARE the target.
- Vultures attempt to herd you toward wells. They position themselves between you and safe space, forcing you toward gravity.
- Pack behavior: 2+ vultures coordinate. One blocks escape route, one rams for cargo steal.
- Drifters flee the map entirely (they know what's coming).

### Cargo Steal Mechanic

When a vulture bumps you at Beacon+ signal:
1. Random cargo item is removed from your inventory
2. A mini-wreck spawns at your position with that item (the "dropped" item)
3. The vulture grabs it (sets as its loot target)
4. The vulture immediately switches to `seekPortal` state
5. If the vulture extracts, the item is gone permanently
6. If you kill the vulture (ram it into a well, force-pulse it), it drops the item back as debris

This creates a chase: the vulture stole your Fusion Core and is heading for a portal. Do you pursue (more thrust, more signal) or let it go?

### Death Drops (already built)

Scavengers already drop loot as debris when consumed by wells. This mechanic extends naturally — a cargo-stealing vulture that dies near a well scatters both its own loot AND your stolen item.

### New Scavenger Archetype: Hunter

A third archetype that only spawns when signal is high (Beacon+):

- **Visual**: red-orange tint (danger color), slightly larger than vultures
- **Behavior**: ignores wrecks and portals entirely. Only targets the player.
- **Ability**: force pulse (same as player's). Uses it to push you toward wells.
- **Spawn**: 1 hunter per crossing into Beacon range. Max 2 per map.
- **Faction**: always "Warden" (the enforcer faction)
- **Lore**: Wardens aren't scavengers — they're remnants of an ancient policing force. They activate when someone makes too much noise.

Hunters are the first real combat threat. They don't steal — they kill. A hunter pushing you toward a well while you're trying to extract is a genuine crisis.

### Implementation Notes

- Signal level is already computed (when built). Scavenger decision logic reads it.
- Cargo steal: new state in scavenger state machine (`stealCargo` → `fleeWithLoot`).
- Hunter archetype: new entry in scavenger config, new behavior tree branch.
- The existing bump collision system handles the steal trigger.

---

## B: The Inhibitor

> The universe stops being a place and becomes an enemy.

### What It Is

The Inhibitor is not an entity. It's a state change. When it wakes, the rules of the universe shift. Wells move. Portals destabilize. The map that was your playground becomes your prison.

It doesn't chase you. It rearranges the board.

### Why This Is Scary

Traditional bosses test your combat skills. The Inhibitor tests your *navigation* skills — the thing you've been building the entire game. Everything you learned about reading currents, timing portals, judging well distances... the Inhibitor breaks those patterns. Your expertise becomes unreliable. That's dread.

### Wake Conditions

The Inhibitor doesn't wake on signal alone. It wakes when the universe decides you've been here too long and done too much:

```
inhibitorPressure += signalLevel × dt
inhibitorPressure += (runElapsedTime / runDuration) × 0.001 × dt
inhibitorPressure += wellMassGrowth × 0.05  // wells growing = universe aging

when inhibitorPressure > threshold:
    inhibitor wakes
    threshold varies per run (0.8 ± 0.15 random)
```

Signal is the biggest contributor but not the only one. Even a perfectly quiet player will eventually trigger it if they stay too long. This prevents infinite runs and creates a "the clock is ticking whether you make noise or not" background pressure.

The threshold varies per run (±15%) so you can't memorize exactly when it happens. You feel it approaching but don't know the exact moment.

### Phase 1: Stirring (pre-wake warning)

When inhibitorPressure reaches 70% of threshold:
- **Visual**: wells develop a faint pulsing outline (slow, 0.5 Hz). Something is noticing.
- **Audio**: a new low-frequency tone fades in beneath the drone. Sub-bass rumble.
- **Gameplay**: well growth rate increases by 20%. Drift accelerates slightly.
- **HUD**: no explicit warning. The player should feel it, not read it.

### Phase 2: Waking (the moment)

When inhibitorPressure crosses threshold:
- **Visual**: screen flash (white, 0.3s). All wells pulse simultaneously. ASCII characters glitch for 1 second.
- **Audio**: the drone drops an octave and distortion spikes. A deep boom. Then silence for 2 seconds. Then everything returns with a different character.
- **Events log**: "something has noticed you" (no name given first time, just presence)
- **Irreversible**: the Inhibitor cannot go back to sleep this run.

### Phase 3: Active (the new rules)

**Well drift**: Wells begin slowly moving toward the player's position. Not fast — 0.005 world-units/s (half of star drift). But relentless. Over 60 seconds, a well moves 0.3 world-units. The safe space between wells shrinks.

**Well attraction**: Wells pull each other slightly. They cluster over time. The map compresses — what was a spacious arrangement becomes a tight gravity field.

**Portal instability**: Active portals begin flickering. Their lifespan is halved. New portal waves spawn with fewer portals. The exits are closing.

**Fluid corruption**: The fluid sim's base color shifts warmer (display shader hue rotation). The universe visually changes. Currents become less predictable — ambient turbulence increases.

**Drift acceleration**: All wreck drift speeds double. Loot falls toward wells faster. The map empties quicker.

**Scavenger panic**: All scavengers switch to flee mode. They rush portals. If they can't find one, they drift and eventually die. The universe clears out — it's just you and the wells.

### Phase 4: Closing (endgame pressure)

60 seconds after waking:
- Well drift speed doubles again (0.01 world-units/s)
- Wells that get within 0.5 world-units of each other begin merging (combined mass, larger kill radius, massive wave ring)
- The mega-well (if present) acts as an attractor — all other wells drift toward it
- Portals stop spawning entirely. Only existing portals remain.

120 seconds after waking:
- If the player hasn't extracted, the last portal spawns (guaranteed, 15 second lifespan)
- This is the "get out NOW" moment
- Visual: everything is warm-shifted, wells are clustered, the map is collapsing

180 seconds after waking:
- Map fully collapses. All wells merge. Player dies if still present.
- This is the hard time limit, but it should almost never be reached — the pressure to extract starts at Phase 2.

### Why Not Just a Boss Fight?

A boss fight tests reaction speed and pattern recognition. The Inhibitor tests decision-making under pressure:

- Do you loot that one last vault wreck or head for the portal?
- The nearest portal is between two converging wells — do you risk the narrowing gap?
- A scavenger just stole your best item and is heading for a portal that's about to disappear — chase or extract with what you have?
- The safe route takes 30 seconds. The dangerous route through converging wells takes 10. How much do you trust your piloting?

These are the questions that make roguelikes replayable. Not "can I dodge this attack pattern" but "can I make the right call under pressure."

### The Inhibitor's Identity

The Inhibitor isn't explained. There's no lore popup. It's implied through the effects:
- Wells move. Wells don't move in normal physics.
- Something is *controlling* the wells. Something that was dormant.
- The universe's collapse isn't random entropy — it's directed. Intentional.
- The player's signal woke up whatever is directing it.
- The name "Inhibitor" comes from the concept of an entity that prevents intelligent life from flourishing. Not by attacking — by collapsing the environment that sustains it.

Future lore (data cores, beacon archives, derelict station logs) can hint at the Inhibitor's nature without ever fully explaining it. The mystery is the point.

---

## C: Fauna Swarms

> The space between threats is not empty.

### What They Are

Fauna are small, non-intelligent entities attracted by signal. Think space jellyfish — bioluminescent, drifting, individually harmless but collectively obstructive.

They are NOT enemies. They don't attack. They don't have health. They're environmental interference — like wind in a sailing game.

### Behavior

- Spawn in clusters of 5-15 at random positions when signal is Whisper+
- Drift with fluid currents (zero thrust of their own)
- Attracted to signal source — bias drift toward the player
- On contact: bump the ship slightly (like scavenger collision but weaker)
- On contact: generate +0.02 signal spike per fauna hit
- Expire after 30-60 seconds (dissolve with a brief glow)

### The Problem They Create

One fauna bumps you. Annoying but irrelevant. Five fauna bumping you while you're trying to loot a tier 3 wreck near a well: you're getting pushed around, generating signal from each collision, your thrust to compensate generates more signal, and the signal attracts more fauna. Feedback loop.

The player learns: clear the fauna first (force pulse scatters them but costs signal), navigate around them (takes time, wreck is drifting toward the well), or accept the noise and loot fast.

### Visual

- Tiny (3-4px), translucent, cool-colored (teal/purple glow)
- Drift with fluid currents, so they form visible "schools" along flow lines
- Brief pulse on contact with player
- Dissolve into particles on death/expiry

### Signal Interaction

Fauna are the physical manifestation of signal consequences at the low-mid range. Before scavengers get hostile (Beacon), before the Inhibitor wakes (Threshold), fauna are the first thing that says "your signal has consequences."

Fauna density scales with signal:
- Whisper: 0-5 nearby
- Presence: 5-15 nearby
- Beacon: 15-30 nearby (swarm)
- Flare+: 30+ (thick interference)

### Implementation

- Simple entities: position + velocity + lifetime. No state machine.
- Move with fluid velocity (sample flowField at position)
- Bias toward player: add small vector toward ship position (0.01 world-units/s)
- Spawn manager: check signal level, spawn clusters if below density target
- Contact: same as scavenger bump collision but weaker force

---

## D: The Universe Remembers

> Your footprints don't wash away.

### What It Is

The areas where you've been active permanently change. Not "enemies show up" — the fabric of space itself scars. Your presence has weight.

### Mechanics

**Signal residue**: when you generate signal in an area, a persistent "heat map" records it. This heat map doesn't decay (or decays very slowly over minutes, not seconds).

**Residue effects on the map**:

- **Turbulence**: high-residue areas have increased fluid turbulence. Currents become chaotic where you've been. Surfing through your own old path is harder than surfing fresh space.

- **Drift acceleration**: wrecks in high-residue areas drift faster toward wells. Your activity destabilizes the local space-time. The areas you've looted empty out faster.

- **Well growth boost**: wells near high-residue areas grow slightly faster. Your activity feeds the wells — you're accelerating the universe's collapse in the areas you visit.

- **Fauna attraction**: high-residue areas attract fauna even when you're not there. Your old paths become fauna highways. Return to a previously looted area and it's full of drifting interference.

### The Emergent Consequence

The optimal strategy becomes: visit each area once, loot efficiently, move on. Returning to the same zone is punished — it's turbulent, empty, and full of fauna. The universe rewards exploration and punishes camping.

This also creates natural "chapters" within a run. The early game is in one region. Mid-game you migrate to another. Late-game you're in unexplored territory, which is the most pristine but also the furthest from portals you've already seen.

### Heat Map Implementation

A low-resolution grid (16×16 or 32×32) covering the map. Each cell stores accumulated signal from player activity in that area. Updated every few seconds, not every frame.

```javascript
const HEAT_GRID = 16;
const heatMap = new Float32Array(HEAT_GRID * HEAT_GRID);

// Per-second update
const cellX = Math.floor((ship.wx / WORLD_SCALE) * HEAT_GRID);
const cellY = Math.floor((ship.wy / WORLD_SCALE) * HEAT_GRID);
heatMap[cellY * HEAT_GRID + cellX] += signalLevel * dt;

// Very slow decay (half-life ~120 seconds)
for (let i = 0; i < heatMap.length; i++) {
  heatMap[i] *= 0.9943;  // ~120s half-life at 60fps
}
```

The heat map feeds into:
- `CONFIG.fluid.ambientTurbulence` (locally modified per cell)
- Wreck drift strength (locally boosted)
- Fauna spawn weighting (bias toward hot cells)

### Visual

The heat map could be visualized subtly in the display shader — a very faint warm color shift in areas with high residue. Or it could be invisible (the effects are felt, not seen). Design decision for later.

---

## How They Layer

These four systems aren't alternatives. They're a stack:

```
Signal Level    What Happens
0.00-0.15      Nothing. Ghost. Pure exploration.
0.15-0.35      Fauna begin appearing. Scavengers become aware. Universe remembers.
0.35-0.55      Fauna swarms form. Vultures shadow you. Residue builds.
0.55-0.75      Scavengers go hostile. Cargo raids. Hunters spawn. Fauna thick.
0.75-0.90      Scavenger panic. Everyone hunting or fleeing. Fauna everywhere.
0.90-1.00      Inhibitor wakes. Wells move. Portals close. Map collapses.
```

Early run (low signal): fauna are the only reactive element. They're annoying but manageable. The player learns that actions have consequences.

Mid run (medium signal): scavengers shift from competitors to threats. The player has to balance "I need that wreck" against "looting it will attract vultures who might steal what I already have."

Late run (high signal): the Inhibitor changes the rules. Everything the player learned about the map is now unreliable. Wells are moving, portals are dying, and the exit is closing.

## Build Order

1. **Fauna** (C) — simplest, teaches signal consequences immediately
2. **Scavenger hostility** (A) — extends existing system, adds real stakes
3. **Inhibitor** (B) — the big one, requires signal + fauna + hostile scavengers to feel earned
4. **Universe remembers** (D) — polish layer, adds depth without new entities

## Open Questions

1. **Should the player see their signal level numerically?** Or just feel it through consequences? (Leaning toward: small subtle indicator, not a big bar.)
2. **Should signal persist between rooms/areas or reset?** (Per-run only — each run starts at Ghost.)
3. **How much should the Inhibitor's threshold vary per run?** (±15% proposed. More variance = more surprise but less learnable.)
4. **Should the Inhibitor have a visual representation on the map?** Or is it purely environmental? (Leaning toward: no visible entity. The wells moving IS the Inhibitor.)
5. **Fauna as fluid obstacles**: should fauna affect the fluid sim (tiny obstruction splats) or just be canvas-rendered entities? (Start canvas-only for perf, add fluid interaction if it looks good.)
