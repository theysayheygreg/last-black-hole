# Cosmic Signatures — Procedural Universe Identity

> Each run is a different dead universe with its own personality.

---

## Concept

Every run rolls a "cosmic signature" — a universe personality that tweaks CONFIG values and gives the run a name. This creates immediate replay value: "The Slow Tide" plays differently from "The Shattered Merge." The player learns to read the signature and adjust their strategy.

Shown at run start: `entering: the slow tide` with a one-line flavor text. Lowercase, fades after 3 seconds. Clean, atmospheric.

---

## Signatures

### the slow tide
Calm, spacious, deceptive. Long currents, gentle wells, wide portal spacing. The danger is complacency — the universe dies slowly but surely.

**Flavor:** `currents run long here. take your time — spacetime will not.`

**CONFIG overrides:**
```javascript
{
  fluid: { viscosity: 0.12 },           // lower than default — fluid flows easier
  wells: { gravity: 0.35 },             // gentler pull
  universe: { runDuration: 540 },       // 9 minutes (longer than default 7)
  events: { growthInterval: 55 },       // slower well growth
}
```

### the shattered merge
Violent, chaotic. Wells start close together, grow fast, merge events happen early. Frequent wave rings. The universe is already dying when you arrive.

**Flavor:** `the mergers have already begun. find your exit.`

**CONFIG overrides:**
```javascript
{
  events: { growthInterval: 25, growthAmount: 0.04 }, // fast growth
  universe: { runDuration: 360 },                      // 6 minutes (short)
  // Map override: wells placed closer together
}
```

### the thick dark
Oppressive, sluggish. High base viscosity from the start. Fewer wrecks but more portals (mercy). Movement is heavy and committed. Every thrust decision matters more.

**Flavor:** `spacetime is already thickening. every move costs more than it should.`

**CONFIG overrides:**
```javascript
{
  fluid: { viscosity: 0.22 },           // noticeably thicker
  universe: { viscosityGrowth: 0.015 }, // grows faster too
  // Map override: fewer wrecks, +1 portal
}
```

### the graveyard
Rich but lonely. Many wrecks, high value. Few portals. Slow collapse. Few scavengers. The temptation to "just one more wreck" is extreme because the loot is everywhere and the exits are scarce.

**Flavor:** `civilizations fell like rain here. their wealth remains. their exits do not.`

**CONFIG overrides:**
```javascript
{
  universe: { runDuration: 480 },       // 8 minutes
  events: { growthInterval: 50 },       // slow growth
  // Map override: 2x wrecks, -1 portal, -1 scavenger
}
```

### the rush
Sprint. Everything is fast — portal evaporation is aggressive, wrecks are rich, more scavengers competing. You have to move NOW.

**Flavor:** `the exits are already closing. move.`

**CONFIG overrides:**
```javascript
{
  universe: { runDuration: 300 },                  // 5 minutes
  portals: { evaporationInterval: 45 },            // portals die fast
  scavengers: { count: 5 },                        // more competition
  // Map override: rich wrecks (higher tier)
}
```

### the deep
Vast, sparse. Large effective play area, wells spread far apart, long travel between points of interest. Navigation and route planning matter more than reflexes.

**Flavor:** `the distances here are immense. plan your route or drift forever.`

**CONFIG overrides:**
```javascript
{
  // Map override: wells spread to edges, fewer but higher-value wrecks
  // Effectively a larger-feeling map even at same WORLD_SCALE
  wells: { gravity: 0.5 },              // stronger pull at distance (compensate spread)
  universe: { runDuration: 600 },       // 10 minutes
}
```

---

## Implementation

A `signatures.js` module:

```javascript
export function rollSignature() {
  const signatures = [slowTide, shatteredMerge, thickDark, graveyard, rush, theDeep];
  const sig = signatures[Math.floor(Math.random() * signatures.length)];
  return {
    name: sig.name,          // "the slow tide"
    flavor: sig.flavor,      // one-line text
    configOverrides: sig.configOverrides,
    mapOverrides: sig.mapOverrides || null,
  };
}
```

Map loader applies `configOverrides` after base map CONFIG. `mapOverrides` modify entity placement (wreck count, portal count, well positions) at load time.

Display: DOM overlay element, positioned center, fades in over 0.5s, holds 3s, fades out over 1s. Lowercase. Subdued color (dim teal or grey-white).

---

## Open Questions

1. **Signature visible in HUD after fade?** Should there be a small indicator showing which universe you're in, or just the initial display? A small `[the slow tide]` in a corner could help players learn which signatures they like.
2. **Signature affects scavenger behavior?** E.g., "the rush" makes scavengers more aggressive, "the graveyard" has fewer of them. Currently handled via CONFIG overrides on count, but behavior changes could add more flavor.
3. **Weighted rolls or uniform?** Should some signatures be rarer? Or all equally likely? Uniform is simpler and fairer. Weighted could make "the deep" or "the shattered merge" feel special when they appear.
4. **Player choice vs random?** Should the player pick a signature (like choosing a map), or is it always random? Random preserves surprise. Choice adds strategic depth. Could offer both: random by default, choose after N successful extractions.
5. **Signature + map interaction:** does each map have its own signature pool, or do all signatures work on all maps? "The deep" on a 3x3 map might not feel vast. Could restrict some signatures to certain map sizes.
