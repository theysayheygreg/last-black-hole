# Portals v2 — Wave-Based Extraction

> the exits are temporary. the last one is always the hardest.

---

## Design Intent

Portals are the extraction mechanic and the primary source of tension. They arrive in waves, each shorter-lived than the last, creating a natural rhythm of scavenge → decide → extract-or-gamble. The final portal is always guaranteed, always brief, always dramatic.

Portals are not just exits — they're events. Each wave changes the player's calculus. The universe doesn't kill you with a timer. It kills you by taking away your options, one by one, until there's only one left.

---

## Base Object: `Portal`

```javascript
{
  wx, wy,             // world-space position
  type: 'standard',   // portal type (see Types below)
  wave: 1,            // which spawn wave this portal belongs to
  spawnTime: 60,      // game-time when this portal appeared (seconds)
  lifespan: 90,       // seconds until evaporation
  alive: true,        // false = evaporated
  opacity: 1.0,       // visual fade as expiration approaches
}
```

---

## Portal Types

### Standard
The default exit. Reliable, readable, fair.
- **Capture radius:** 0.08 world-units (CONFIG tunable)
- **Visual:** purple spiral with pulsing overlay ring (current implementation)
- **Fluid effect:** weak inward pull, creates visible vortex
- **Evaporation:** smooth fade over last 15s, overlay blinks in last 5s

### Unstable
Smaller, flickering, harder to enter. Appears in later waves.
- **Capture radius:** 0.04 world-units (half of standard)
- **Visual:** same purple but flickering opacity (random on/off at 4-8Hz), smaller overlay ring
- **Fluid effect:** intermittent — pull stutters on and off, making the vortex chaotic
- **Evaporation:** can collapse early (random ±20% lifespan variation)
- **Reward:** higher extraction bonus (you earned it)

### Rift
Large, easy to enter, but always near danger. Appears rarely, usually wave 2 or 3.
- **Capture radius:** 0.15 world-units (nearly 2x standard)
- **Visual:** bright cyan-white, wider spiral arms, dramatic fluid vortex
- **Fluid effect:** strong pull — creates a visible funnel. Ship gets sucked in from further out.
- **Placement:** always within 0.5 world-units of a well. Easy to enter, terrifying to approach.
- **Evaporation:** normal lifespan but the well proximity means it may get consumed by growth

---

## Spawn Waves

Portals arrive in timed waves rather than all at once. Each wave is shorter-lived than the last, compressing the decision window.

### Wave Schedule (10-minute run, tunable via CONFIG)

| Wave | Spawn Time | Count | Types | Lifespan | Design Intent |
|------|-----------|-------|-------|----------|---------------|
| 1 | 0:45 | 2–3 | standard | 90s | early exit for cautious players — "take what you have and leave" |
| 2 | 3:00 | 2 | standard + unstable | 75s | mid-game checkpoint — universe is getting worse, decent loot by now |
| 3 | 5:30 | 1–2 | standard or rift | 60s | pressure builds — wells are bigger, fewer safe paths |
| 4 | 7:30 | 1 | unstable | 45s | late game — hard to reach, hard to enter, but you've got great loot |
| Final | 9:30 | 1 | standard | 30s | the last way out — everyone races for this one |

**The Final Portal Rule:** wave 5 always spawns exactly 1 standard portal at 9:30, lasting 30 seconds. This is the dramatic finale. If you miss it, the universe collapses at 10:00. Every run has a climactic ending.

### Spawn Placement

Per-wave placement rules:
- **Wave 1:** safe positions — near map edges, away from wells, in star push zones
- **Wave 2–3:** moderate risk — mid-distance from wells, in current paths
- **Wave 4:** high risk — closer to wells, in orbital lanes
- **Final:** random but reachable — not inside a kill radius, but no safety guarantee

Portals never spawn inside a well's kill radius. Minimum distance from any well: `well.killRadius + 0.15` world-units.

---

## Evaporation

When a portal's lifespan expires:

1. **Warning phase** (last 15s): overlay ring blinks, opacity fades, fluid pull weakens
2. **Final warning** (last 5s): rapid blink (2Hz), color shifts toward red, overlay text "COLLAPSING"
3. **Death:** portal disappears, fluid shockwave radiates outward (wave ring), brief bright flash
4. **Aftermath:** the fluid where the portal was rebounds — outward push creates a visible ripple

### Future Expiration Triggers (not v1)

Beyond time-based expiration, portals could eventually expire from:
- **Player transit:** in multiplayer, each portal has a transit capacity (1–3 ships)
- **Mass transit:** total mass that's passed through (ship + collected loot weight)
- **Well proximity:** if a growing well's influence radius reaches the portal, it collapses early
- **Signal level:** high-signal portals attract attention and destabilize faster

v1 uses time only. The architecture should store `expirationCondition` on the portal object so these can be added later without refactoring.

---

## Portal Wave Manager

New system: `PortalWaveManager` (can live in portals.js or a new file).

Responsibilities:
- Track run elapsed time
- Spawn portal waves on schedule
- Remove expired portals with visual feedback
- Track portal count for HUD / game-over detection
- Trigger "universe collapsed" when all portals are gone AND no more waves are scheduled

```javascript
const WAVE_SCHEDULE = [
  { time: 45, count: [2, 3], types: ['standard'], lifespan: 90 },
  { time: 180, count: [1, 2], types: ['standard', 'unstable'], lifespan: 75 },
  { time: 330, count: [1, 2], types: ['standard', 'rift'], lifespan: 60 },
  { time: 450, count: [1, 1], types: ['unstable'], lifespan: 45 },
  { time: 570, count: [1, 1], types: ['standard'], lifespan: 30 },  // final
];
```

---

## Extraction

When a ship enters a portal's capture radius:

1. Ship velocity dampened (pulled toward portal center)
2. Brief extraction animation (0.5s — ship shrinks into portal center)
3. Phase transition: `gamePhase = 'escaped'`
4. Score screen shows: items collected, wrecks looted, time survived, wave extracted on

### Extraction Bonus

Later waves = higher multiplier:
- Wave 1: 1.0x score
- Wave 2: 1.5x
- Wave 3: 2.0x
- Wave 4: 3.0x
- Final: 5.0x — the hero's reward

Unstable portals: additional 1.5x multiplier (stacks with wave multiplier).

---

## Interaction with Universe Clock

- Growing wells can consume nearby portals (well kill radius overlaps portal position)
- This creates emergent portal loss beyond the wave schedule
- Portals near wells in later waves are at real risk of being eaten before they expire naturally
- The wave manager doesn't replace consumed portals — they're just gone

---

## HUD Integration (future)

- Portal count indicator (top-right): `◉ 2 ACTIVE` with directional arrows to nearest
- Wave incoming warning: `PORTAL WAVE INCOMING` (5s before spawn)
- Portal expiring warning: `PORTAL COLLAPSING` (15s before death)
- Final portal: special treatment — `⚠ LAST EXIT — 30s` in red, pulsing
