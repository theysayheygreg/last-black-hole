# Loot Drift: Everything Falls

> In a dying universe, nothing stays still. Wrecks drift toward wells. Loot has a lifespan.

## Core Concept

Wrecks are affected by well gravity. They drift slowly toward the nearest well, accelerating as they get closer. If a wreck enters a well's kill radius, it's consumed — loot and all. The player must reach loot before the universe eats it.

This isn't just a mechanic — it's the physical truth of the game world made visible. Wells consume everything. The question is always: can you extract value before the void claims it?

## How It Works

### Wreck gravity

Each frame, every alive wreck feels gravitational pull from all wells. The pull is much weaker than what the ship feels — wrecks are heavy debris, not a nimble ship.

```
wreck.vx += pullX * driftStrength * dt
wreck.vy += pullY * driftStrength * dt
wreck.wx += wreck.vx * dt
wreck.wy += wreck.vy * dt
```

`driftStrength` is a fraction of the ship's well pull — maybe 8-15% initially. Wrecks already have `vx/vy` fields (used for ejection velocity on drops). This just gives them a persistent source of acceleration instead of only the initial kick.

### Drag on wrecks

Without drag, wrecks would accelerate indefinitely and whip around wells. Wrecks need their own drag constant — higher than the ship's, so they move sluggishly.

```
const wreckDrag = 0.03;  // per-frame damping
wreck.vx *= (1 - wreckDrag);
wreck.vy *= (1 - wreckDrag);
```

This gives wrecks a terminal drift speed. Near a well, they settle into a slow inward spiral. Far from wells, they barely move.

### Well consumption

Already built (`wreckSystem.checkWellConsumption()`). When a wreck enters a well's kill radius:
- Wreck marked dead
- Well gains small mass (0.1)
- Wave ring spawned
- Loot is lost

No change needed here — just happens more often now because wrecks drift inward.

### Drift speed by distance

The pull follows the same inverse-power law as ship gravity, but scaled down:

| Distance from well | Drift behavior |
|-------------------|---------------|
| > 0.5 world units | Nearly stationary. Imperceptible drift. |
| 0.2 - 0.5 | Slow, visible drift. Player has minutes. |
| 0.1 - 0.2 | Steady inward pull. Player has 30-60 seconds. |
| < 0.1 | Accelerating toward kill zone. Seconds remaining. |

### Debris ejection (scavenger/star death)

When a scavenger dies near a well or a star is consumed:
1. Spawn wreck(s) at the death position
2. Give them outward ejection velocity (away from well, 0.2-0.4 world-units/s)
3. The ejection fights the drift. Wreck shoots outward, slows, stops, then starts drifting back.
4. Window to loot = time for ejection to decay + time for drift to bring it back to kill zone.

With ejection at 0.3 world-units/s and drift pull at ~15% of ship gravity:
- Wreck travels ~0.15 world-units outward before stopping
- Drift back at ~0.02 world-units/s near the well
- **Window: roughly 15-30 seconds** depending on well mass and distance

### Looted wrecks

Looted wrecks (gray dots) still drift and get consumed. They're debris — they don't just disappear. But they're no longer worth risking your ship for. Visual signal: the gray marker getting closer to a well tells you time is passing.

### Map-start wrecks

Wrecks placed by the map definition start with zero velocity. They immediately begin drifting based on their position relative to wells. Wrecks placed far from wells barely move. Wrecks placed near wells (vault tier, high risk) start drifting immediately — rewarding early aggression.

This means **vault wrecks near wells are time-limited by design**, not by an arbitrary timer. The physics creates the urgency.

## What This Changes About Gameplay

### Before drift
- Wrecks are static. Loot waits forever.
- No urgency to visit a specific wreck.
- Wells are obstacles to avoid, not competitors for resources.
- Late-game map feels the same as early-game.

### After drift
- Wrecks slowly migrate toward wells. Map evolves over time.
- Near-well loot is high-value AND time-limited. Risk/reward is spatial AND temporal.
- Wells compete with you for resources. They're consuming the same loot you want.
- Late-game: fewer wrecks remain (consumed), wells are larger (more mass from consumption), drift is faster (stronger gravity). The universe is closing in.
- Scavenger kills and star consumption create emergent loot events with natural timers.

### New player reads
- "That vault wreck is drifting toward the well — I need to grab it soon"
- "A star just got consumed — there's a rare wreck near that well but it's already drifting in"
- "Most of the surface wrecks are gone now — the wells ate them. Time to extract."

## Configuration

```javascript
CONFIG.wrecks.driftEnabled: true,        // master toggle
CONFIG.wrecks.driftStrength: 0.1,        // fraction of ship well-pull strength
CONFIG.wrecks.driftFalloff: 1.5,         // same falloff curve as wells
CONFIG.wrecks.driftMaxRange: 0.8,        // world-units — no drift beyond this
CONFIG.wrecks.driftDrag: 0.03,           // per-frame velocity damping
CONFIG.wrecks.driftTerminalSpeed: 0.05,  // world-units/s max drift speed
```

All tunable via dev panel. Start conservative (low strength, high drag) and increase until it feels right.

## Scavenger Death Drops

When a scavenger enters a well's kill radius (death spiral):
- Spawn 1-3 small wrecks at the scavenger's position
- Each wreck contains 1 item from the scavenger's collected loot
- Ejection velocity: 0.3 world-units/s outward from well center
- Pickup cooldown: 0.5s (so they don't immediately overlap with the death animation)
- Type: 'debris' (scattered dots, dull orange)

The scavenger's `lootCount` determines how many items to drop. If it collected 3 items, drop 3 single-item wrecks.

## Star Consumption Remnants

When a star enters a well's kill radius:
- Spawn 1 vault-tier wreck at the consumption point
- Name: "Remnant of [star name]"
- Ejection velocity: 0.4 world-units/s outward
- Loot: 2-4 high-tier items (rare/unique components and artifacts)
- Pickup cooldown: 1.0s (dramatic pause before it's lootable)

This is the jackpot event. A star dies, a rare wreck appears, and it's already drifting back toward the well. High risk, high reward, natural timer.

## Implementation Plan

### Phase 1: Wreck drift (core mechanic)
- Add well gravity pull to `wreckSystem.update()`
- Add drag to wreck velocity
- CONFIG values + dev panel knobs
- Verify `checkWellConsumption` still works (it should — wrecks just reach kill radius sooner now)

### Phase 2: Scavenger death drops
- Detect scavenger death in `scavengerSystem.update()`
- Queue dropped items (similar to inventory drop queue)
- Spawn debris wrecks in `main.js` from the queue
- Ejection velocity away from consuming well

### Phase 3: Star consumption remnants
- Already have star consumption events
- Spawn vault wreck from the event data in `main.js`
- Generate high-tier loot for the remnant

### Phase 4: Tuning
- Dev panel exposure for all drift CONFIG values
- Playtest: how fast should surface wrecks drift? Vault wrecks?
- Balance ejection velocity vs drift pull for the "window" feel
- Adjust wreck placement in maps if needed (some may be too close to wells now)

## Visual Indicators

- Wrecks that are drifting could have a subtle velocity line (like comets have) showing their drift direction
- Wrecks near wells could pulse faster as they approach the kill zone
- A small "!" icon when a wreck is within 0.15 world-units of a kill radius (about to be consumed)

## Decisions (2026-03-27)

1. **Player-dropped items drift:** Yes. Consistent physics. If you drop something near a well, it drifts in.
2. **Debris pieces drift independently:** Yes. May create interesting spreading/converging patterns. Revisit if too noisy.
3. **Portal pull on wrecks:** No. Portals need their own design pass before we add wreck interactions.
