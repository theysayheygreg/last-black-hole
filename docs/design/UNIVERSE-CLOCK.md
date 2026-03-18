# Universe Clock — Emergent Collapse

> no countdown timer. the universe dies through its own physics.

---

## Design Intent

The run has a natural 10-minute arc, but the player never sees a timer. Instead, they feel the universe getting worse through compounding entity behaviors. Wells pull harder. Fluid gets thicker. Portals become scarce. The "clock" is the collective state of every entity in the sim, not a global variable ticking down.

The only true global is the run elapsed time (needed for portal wave scheduling). Everything else is local entity state.

---

## What Changes Over a Run

### 1. Wells Grow (per-entity, not global)

Each well grows independently based on its own behavior:

**Passive growth:** slow mass accumulation over time. Rate varies per well (map-defined or randomized at spawn).
```javascript
well.growthRate = 0.015 + Math.random() * 0.01;  // per 45s, varies 0.015–0.025
```

**Active growth:** wells gain mass when they consume entities:
- Planetoid consumed: +0.04 mass (already implemented)
- Wreck consumed (well grows into wreck): +0.1 mass (significant — wrecks are big)
- These create spikes that the player can observe and react to

**Effects of growth:**
- Fluid gravity pull scales with mass (already implemented)
- Kill radius grows: `killRadius = baseKillRadius * (1 + (mass - startMass) * 0.3)`
- Accretion disk grows visually (already scales with mass)
- Wave ring amplitude on growth events scales with mass (already implemented)

**Emergent result:** by minute 6-8, the well that ate the most planetoids/wrecks is noticeably more dangerous than the others. The map's danger profile shifts asymmetrically.

### 2. Fluid Viscosity Increases (emergent, not global)

Instead of a global viscosity ramp, viscosity increases emerge from well growth:

**Approach:** well growth events inject a small amount of "viscosity" into the nearby fluid. This is simulated by increasing the velocity dissipation in the fluid sim near growing wells.

**Implementation option A (simple, v1):** use the existing distance-based dissipation shader. As wells grow, increase `nearDissipation` slightly per growth event. The fluid near bigger wells becomes stickier.

**Implementation option B (per-entity):** each growth event spawns a brief high-dissipation splat around the well. Fluid passing through this zone loses more velocity. Creates localized "thick" zones rather than global viscosity change.

**Player feel:** early game — fluid is responsive, currents are fast, surfing is snappy. Late game — near big wells, everything drags. Open space between wells stays relatively clean. The "heaviness" is spatial, not temporal.

### 3. Planetoid Spawn Escalation

More planetoids = more mass being fed to wells = faster growth:

**Spawn rate:** decreases over time (more frequent spawns)
```javascript
// v1: spawnInterval shrinks as run progresses
const runProgress = elapsedTime / 600;  // 0.0 at start, 1.0 at 10min
const intervalScale = 1.0 - runProgress * 0.5;  // halves by end
spawnInterval = [15 * intervalScale, 25 * intervalScale];
```

**Emergent result:** more planetoids → more well consumption events → faster well growth → more dangerous map. The universe accelerates its own collapse.

### 4. Portal Waves (see PORTALS-V2.md)

Portals arrive in waves, each shorter-lived than the last. The wave schedule is the closest thing to a "timer" but it's presented as events, not a countdown.

---

## The 10-Minute Arc

| Minute | What's Happening | Player Feel |
|--------|-----------------|-------------|
| 0:00 | Drop in. Wells at starting mass. Calm fluid. | Orientation — learn the map, find wrecks |
| 0:45 | Portal wave 1 (2–3 portals, 90s). | First decision: extract early with little loot, or keep going? |
| 2:00 | Wave 1 portals expire. Wells have grown ~5%. Some planetoids consumed. | Committed — no exit until wave 2 |
| 3:00 | Portal wave 2 (2 portals, 75s). Wells noticeably stronger near consumed planetoids. | Second checkpoint. Decent loot. Getting risky. |
| 4:15 | Wave 2 expires. Fluid near big wells feels heavier. | Deep commitment. Pushing luck. |
| 5:30 | Portal wave 3 (1–2 portals, 60s). Some wrecks consumed by growing wells. | Late-mid game. Map has changed. Old safe paths may be dangerous. |
| 6:30 | Wave 3 expires. Kill radii noticeably larger. | Point of no return feeling. |
| 7:30 | Portal wave 4 (1 unstable portal, 45s). Wells are scary. | Desperation. Hard to reach, hard to enter. |
| 8:15 | Wave 4 expires (or collapsed early). Universe feels hostile. | Pure survival. Every well is a trap. |
| 9:30 | **Final portal** (1 standard, 30s). | The race. Everything you've got. |
| 10:00 | Final portal expires. Universe collapses. | If you're still here, you're dead. |

---

## What We're NOT Doing (v1)

These create good drama but add complexity. Backlog for post-jam:

- **Well merging:** two wells close enough combine into one massive well. Cool but requires fluid sim changes.
- **Spacetime cracks:** visual tears in the ASCII field that damage the ship. Atmospheric but needs new rendering.
- **Hawking radiation damage zones:** growing wells emit damaging auras. Good but needs ship health system.
- **Control degradation:** ship handling gets worse over time. Pillar 2 conflict — movement should always feel good.
- **Global viscosity ramp:** replaced by per-entity viscosity from well growth. More interesting, more emergent.

---

## CONFIG Integration

```javascript
universe: {
  runDuration: 600,           // seconds — hard cap, final portal expires here
  wellGrowthVariance: 0.01,   // random range added to per-well growth rate
  wellKillRadiusGrowth: 0.3,  // kill radius expansion factor per unit mass gained
  planetoidSpawnAccel: 0.5,   // how much spawn rate increases over the run (0 = constant, 1 = doubles)
},
```

Portal wave schedule lives in `CONFIG.portals.waves` (see PORTALS-V2.md).

---

## Implementation Notes

**No new systems needed.** The universe clock emerges from tweaking existing systems:
- Well growth: already exists, just needs per-well rates and kill radius scaling
- Planetoid spawn: already has `spawnInterval` and `spawnTimer`, just need time-based scaling
- Portal waves: new scheduling logic in PortalSystem (or new PortalWaveManager)
- Viscosity: can start with option A (tweak nearDissipation on growth events) — one line of code

**The only new global state is `runElapsedTime`**, used solely for portal wave scheduling. Everything else is per-entity.
