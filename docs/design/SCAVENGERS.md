# AI Scavengers — Design Document

> Ships from dying civilizations, competing for the same exits you need.

---

## Fantasy

You are not alone. Other ships arrived before you, or dropped in alongside you. They're doing what you're doing — looting wrecks, reading currents, heading for portals. Some are cautious. Some are aggressive. All of them can take your exits.

Scavengers make the universe feel alive and contested. They create the "that ship is heading for my portal" moment from SIGNAL-DESIGN.md. They also lay the architectural foundation for the Inhibitor (same movement model, different decision logic).

---

## Archetypes

### Drifter (~70% of spawns)

Passive scavengers. They ride currents, loot wrecks they drift past, and head for the nearest portal when satisfied. They avoid wells. They won't fight. They're the most common type — ambient life in the universe.

**Behavior:**
- Prefer riding fluid currents over thrusting (low signal footprint)
- Loot 1-2 wrecks before seeking extraction
- Seek nearest active portal, regardless of player position
- Flee wells aggressively when pull gets strong
- Die to wells the same as the player (same kill radius)

**Personality:** cautious, patient, easily spooked by proximity to wells or other entities.

### Vulture (~30% of spawns)

Aggressive scavengers. They track the player loosely and compete directly for resources. They race you to wrecks, they race you to portals. They don't attack — they take your exits.

**Behavior:**
- Track player position (updates every 2-3 seconds, not per-frame)
- If player is heading toward same wreck: speeds up, tries to arrive first
- If player is heading toward same portal: races
- Loot 2-3 wrecks before extracting, OR extract immediately if only 1 portal remains
- Will thrust against current when competing (loud, aggressive)

**Personality:** opportunistic, competitive, willing to take risks.

---

## Movement Model

AI ships use the **same physics as the player ship**: thrust + fluid coupling + drag + well gravity. They're subject to the same forces. They look natural because they're surfing the same physics you are.

**Decision loop (runs every 0.5-1.0 seconds, not per-frame):**
1. Evaluate current state
2. Pick a target position (wreck, portal, or flee direction)
3. Set thrust direction and intensity toward target
4. Bias toward riding currents when flow direction roughly matches intent (dot product check: if `dot(fluidVel, toTarget) > 0.3`, reduce thrust intensity and let current carry)

**Fluid-aware navigation:**
AI ships sample fluid velocity at their position (same as player). When the current is going roughly where they want to go, they reduce thrust and ride. This makes them look intelligent and natural — they're not fighting the flow unless they have to.

---

## Behavioral State Machine

```
DRIFT → SEEK_WRECK → LOOT → SEEK_PORTAL → EXTRACT
              |                    |
              v                    v
          FLEE_WELL           FLEE_WELL
```

### DRIFT (default)
- No target. Ride the current. Apply minimal random thrust to avoid stagnation.
- Transition → SEEK_WRECK: when a wreck is within sensor range and un-looted.
- Drifters spend more time here. Vultures transition quickly.

### SEEK_WRECK
- Pick nearest un-looted wreck. Thrust toward it.
- Vulture variant: if player is closer to the same wreck, increase thrust intensity.
- Transition → LOOT: arrived within pickup radius.
- Transition → FLEE_WELL: well proximity below safety threshold.
- Transition → SEEK_PORTAL: enough loot collected, or portals running low.

### LOOT
- Brief pause at wreck (0.5-1.0s). Wreck marks as looted.
- Decision: more wrecks or extract?
  - Drifter: extract after 1-2 wrecks, or if <=1 portal remains
  - Vulture: extract after 2-3 wrecks, or if <=1 portal remains
- Transition → SEEK_WRECK or SEEK_PORTAL.

### SEEK_PORTAL
- Head for nearest active portal.
- Vulture variant: if player is heading for same portal, increase thrust intensity (race).
- Transition → EXTRACT: arrived at portal capture radius.
- Transition → FLEE_WELL: well proximity below safety threshold.

### EXTRACT
- Arrive at portal. Disappear. Portal is consumed (one fewer exit).
- Display a brief visual: ship dissolves into portal effect.

### FLEE_WELL (override state)
- Well proximity below safety threshold. Thrust directly away.
- Returns to previous state when distance is safe again.
- If trapped (velocity toward well despite max thrust): die. Same as player death.

---

## Spawning

| Map Size | Portals | Scavenger Count | Mix | Pressure |
|----------|---------|----------------|-----|----------|
| 3x3 | 2 | 3 | 2 drifter, 1 vulture | Must beat at least 1 to exit |
| 5x5 | 3 | 5 | 3 drifter, 2 vulture | Must beat at least 2 to exit |
| 10x10 | 5 | 7 | 5 drifter, 2 vulture | Must beat at least 2 to exit |

Always more scavengers than portals. The player is behind on exits from the start. Portal evaporation stacks on top — the math gets worse over time.

- Spawn at map edges at run start (already in the universe when you arrive)
- Staggered spawn times: not all at once. 1-2 at start, rest spawn over first 60 seconds.
- Each scavenger picks a random initial facing and drifts until it finds a target.

---

## Rendering

- Same triangle ship shape as player, 70% size
- Drifters: pale blue `#8AAEC4`
- Vultures: amber `#D4A060`
- Thrust trail visible when thrusting (same visual as player trail, tinted to match ship color)
- Bullet wake injection into fluid (same as player wake, same physics)

---

## Portal Consumption

When a scavenger extracts through a portal, that portal is consumed — gone for everyone. This is the core tension: every scavenger that extracts removes one of your exits.

Late-game, watching the last two portals with a vulture heading for one of them is the decision moment: do you race (loud, fast, signal spike) or do you head for the other portal (quiet, but further away, might evaporate)?

---

## Death

Scavengers die the same way the player does: well kill radius. Watching a drifter spiral into a well and disappear is atmospheric — it demonstrates the danger and makes the world feel consistent. Dead scavengers drop no loot (they were carrying extracted materials, not items you can grab — yet).

---

## Interaction with Other Systems

| System | Interaction |
|--------|------------|
| Wells | Same gravity pull. Can die. Same kill radius. |
| Portals | Can extract. Portal consumed on use. |
| Wrecks | Can loot. Wreck marks as looted (grey). |
| Fluid | Same coupling. Inject wakes. Ride currents. |
| Force pulse | Pushed by player's pulse (velocity impulse). |
| Wave rings | Pushed outward like player. |
| Planetoids | Pushed by proximity, same as player. |
| Signal (future) | Generate signal from thrusting. Vultures are louder than drifters. |
| Inhibitor (future) | Inhibitor tracks highest signal source — could be a scavenger. |
| Slingshot (future) | Vultures could learn to slingshot. Advanced behavior. |

---

## CONFIG Section

```javascript
scavengers: {
  count: 3,                    // per map (overridden by map file)
  vultureRatio: 0.3,           // fraction that are vultures
  size: 8,                     // overlay triangle size (px), 70% of player
  thrustAccel: 0.5,            // world-units/s², slightly slower than player (0.67)
  drag: 0.06,                  // same as player
  fluidCoupling: 1.2,          // same as player
  decisionInterval: 0.8,       // seconds between AI decision updates
  sensorRange: 1.5,            // world-units, how far they "see" wrecks/portals
  fleeWellDist: 0.15,          // world-units, flee threshold
  safeWellDist: 0.25,          // world-units, stop fleeing
  lootPause: 0.8,              // seconds paused at wreck
  vulturePlayerTrackInterval: 2.5, // seconds between player position updates (vulture)
  vultureSpeedBoost: 1.3,      // thrust multiplier when racing player
  spawnStagger: 60,            // seconds over which all scavengers spawn
  drifterLootTarget: 1,        // wrecks before extracting (1-2 random)
  vultureLootTarget: 2,        // wrecks before extracting (2-3 random)
  bumpRadius: 0.04,            // world-units, collision detection radius
  bumpForce: 0.3,              // world-units/s impulse on collision
  deathSpiralDuration: 1.5,    // seconds of spiral animation before disappearing
}
```

---

## Resolved Decisions (2026-03-20)

1. **Portal consumption: ALWAYS.** Every scavenger extraction removes a portal. Maximum pressure. Player must move.
2. **Wreck competition: first to arrive loots.** Creates real races. Wreck marks as looted for everyone.
3. **Collision: bump.** Both ships get a small velocity impulse apart on contact. Feels physical.
4. **Visibility: sensor range.** Scavengers only visible within camera frustum. Creates surprise.
5. **Balance: more scavengers than portals.** Player is always behind on exits. Will be broken until tuned — that's fine.
6. **Vulture racing: alternate routes.** Vulture evaluates fluid alignment for different approach vectors, not just "go faster." Picks the approach with best current assist. Simpler first pass: pick approach vector with highest `dot(fluidVel, toTarget)`.
7. **Death visual: spiral animation.** Ship visibly spirals inward over 1-2 seconds before disappearing. Atmospheric.

## Open Questions

1. **Do dead scavengers drop anything?** Currently no. Could drop partial loot as a reward for watching them die (salvaging the salvager). Defer.
2. **Fixed population or respawning?** Currently fixed — they're a dwindling resource like portals. Could add late-game "reinforcement" spawns for more pressure.
3. **Bump force magnitude?** Needs tuning. Too weak = imperceptible. Too strong = annoying pinball. Start at 0.3 world-units/s impulse, tune from there.

---

## Implementation Priority

This is a single `scavengers.js` module:
- `Scavenger` class (position, velocity, state, archetype, loot count)
- `ScavengerSystem` class (manages all scavengers, runs decision loop, physics update)
- Reuses: ship physics model, fluid sampling, well gravity, wreck pickup, portal extraction
- Rendering on overlay canvas (same as ship, wrecks, portals)
- Fluid wake injection (same as ship wake)

Estimated: 300-400 lines. The movement physics are copy-paste from `ship.js` with AI decision logic replacing input.
