# Cosmic Signatures — Procedural Universe Identity

> Each run is a different dead universe with its own personality.

---

## Concept

Every run rolls a "cosmic signature" — a universe personality that defines CONFIG values, entity layout style, and a name. The signature IS the map identity. It implies a complete experience: how the fluid feels, how many wrecks, how fast things collapse, where the wells sit.

Think EVE Online wormhole classes — you always know what kind of space you're in, and that knowledge shapes your strategy.

**Display:** `entering: the slow tide` with flavor text + mechanical callouts. Lowercase, fades after 3 seconds. Always visible in HUD corner during play and on pause screen.

---

## Design Principles

1. **Signatures are templates, not modifiers.** A signature implies a style of map from an experiential standpoint. Thick spacetime shouldn't pair with huge sparse layouts. The signature defines the feel holistically.
2. **Poetic + mechanical.** Flavor text describes the experience. Mechanical callouts give players actionable information. Don't make information opaque.
3. **Signature pool per map size.** Not all signatures work at all scales. Curated pools avoid scaling magic numbers and mismatched experiences.
4. **Streak protection.** Never the same signature twice in a row. Simple `lastSignature` check.

---

## Signatures

### the slow tide
Calm, spacious, deceptive. Long currents, gentle wells, wide portal spacing. The danger is complacency — the universe dies slowly but surely.

**Flavor:** `currents run long here. take your time — spacetime will not.`
**Mechanical:** `low gravity / high drift / extended collapse`

**Map sizes:** 3x3, 5x5

**Template:**
```javascript
{
  config: {
    fluid: { viscosity: 0.12 },
    wells: { gravity: 0.35 },
    universe: { runDuration: 540 },
    events: { growthInterval: 55 },
  },
  layout: {
    wellSpread: 'wide',          // wells near edges, center open
    wreckDensity: 'normal',
    portalCount: 'normal',
    scavengerCount: 'normal',
  },
}
```

### the shattered merge
Violent, chaotic. Wells start close together, grow fast, merge events happen early. Frequent wave rings. The universe is already dying when you arrive.

**Flavor:** `the mergers have already begun. find your exit.`
**Mechanical:** `fast well growth / frequent wave events / short collapse`

**Map sizes:** 3x3, 5x5, 10x10

**Template:**
```javascript
{
  config: {
    events: { growthInterval: 25, growthAmount: 0.04 },
    universe: { runDuration: 360 },
  },
  layout: {
    wellSpread: 'tight',         // wells clustered toward center
    wreckDensity: 'normal',
    portalCount: 'normal',
    scavengerCount: 'high',      // chaos attracts competition
  },
}
```

### the thick dark
Oppressive, sluggish. High base viscosity from the start. Fewer wrecks but more portals (mercy). Movement is heavy and committed. Every thrust decision matters more.

**Flavor:** `spacetime is already thickening. every move costs more than it should.`
**Mechanical:** `high viscosity / heavy drift / extra exits`

**Map sizes:** 3x3, 5x5

**Template:**
```javascript
{
  config: {
    fluid: { viscosity: 0.22 },
    universe: { viscosityGrowth: 0.015 },
  },
  layout: {
    wellSpread: 'normal',
    wreckDensity: 'sparse',      // fewer wrecks
    portalCount: 'high',         // mercy — movement is expensive
    scavengerCount: 'low',
  },
}
```

### the graveyard
Rich but lonely. Many wrecks, high value. Few portals. Slow collapse. Few scavengers. The temptation to "just one more wreck" is extreme because the loot is everywhere and the exits are scarce.

**Flavor:** `civilizations fell like rain here. their wealth remains. their exits do not.`
**Mechanical:** `many wrecks / few exits / slow collapse`

**Map sizes:** 3x3, 5x5, 10x10

**Template:**
```javascript
{
  config: {
    universe: { runDuration: 480 },
    events: { growthInterval: 50 },
  },
  layout: {
    wellSpread: 'normal',
    wreckDensity: 'dense',       // lots of wrecks, higher tiers
    portalCount: 'low',          // few exits
    scavengerCount: 'low',       // lonely
  },
}
```

### the rush
Sprint. Everything is fast — portal evaporation is aggressive, wrecks are rich, more scavengers competing. You have to move NOW.

**Flavor:** `the exits are already closing. move.`
**Mechanical:** `fast portal decay / many scavengers / short window`

**Map sizes:** 3x3, 5x5

**Template:**
```javascript
{
  config: {
    universe: { runDuration: 300 },
    portals: { evaporationInterval: 45 },
  },
  layout: {
    wellSpread: 'normal',
    wreckDensity: 'normal',      // normal count but higher tiers
    portalCount: 'normal',
    scavengerCount: 'high',      // crowded
    wreckTierBoost: 1,           // all wrecks one tier higher
  },
}
```

### the deep
Vast, sparse. Wells spread far apart, long travel between points of interest. Navigation and route planning matter more than reflexes.

**Flavor:** `the distances here are immense. plan your route or drift forever.`
**Mechanical:** `strong gravity / high inertia / long run`

**Map sizes:** 5x5, 10x10 (not 3x3 — can't feel vast on a small map)

**Template:**
```javascript
{
  config: {
    wells: { gravity: 0.5 },
    universe: { runDuration: 600 },
  },
  layout: {
    wellSpread: 'extreme',       // wells at far edges of map
    wreckDensity: 'sparse',      // few but high-value
    portalCount: 'low',
    scavengerCount: 'normal',
    wreckTierBoost: 1,
  },
}
```

---

## Signature Pool by Map Size

| Map Size | Available Signatures |
|----------|---------------------|
| 3x3 | the slow tide, the shattered merge, the thick dark, the graveyard, the rush |
| 5x5 | all six |
| 10x10 | the shattered merge, the graveyard, the deep |

3x3 excludes "the deep" (can't feel vast). 10x10 excludes signatures that work best at intimate scale (slow tide, thick dark, rush).

---

## Flow

1. Player selects map size on map select screen
2. Signature rolled from size-appropriate pool (streak protection: exclude previous signature)
3. Signature's CONFIG overrides applied
4. Signature's layout hints used by map loader to place entities
5. `entering: [name]` displayed with flavor + mechanical text
6. Signature name visible in HUD corner + pause screen throughout run

---

## Implementation

`signatures.js` module:

```javascript
let _lastSignature = null;

export function rollSignature(mapSize) {
  const pool = SIGNATURE_POOLS[mapSize].filter(s => s.name !== _lastSignature);
  const sig = pool[Math.floor(Math.random() * pool.length)];
  _lastSignature = sig.name;
  return sig;
}
```

Layout hints (`wellSpread`, `wreckDensity`, `portalCount`, `scavengerCount`) are interpreted by the map loader as multipliers or placement strategies, not absolute numbers. The map defines base entity counts; the signature scales them.

| Layout Hint | Meaning |
|------------|---------|
| `wellSpread: 'tight'` | Wells placed within 40% of map center |
| `wellSpread: 'normal'` | Default map placement |
| `wellSpread: 'wide'` | Wells pushed toward 60-80% of map radius |
| `wellSpread: 'extreme'` | Wells at map edges |
| `wreckDensity: 'sparse'` | 60% of base wreck count |
| `wreckDensity: 'normal'` | 100% |
| `wreckDensity: 'dense'` | 160% of base wreck count |
| `portalCount: 'low'` | -1 from base |
| `portalCount: 'normal'` | base |
| `portalCount: 'high'` | +1 from base |
| `scavengerCount: 'low'` | -1 from base |
| `scavengerCount: 'normal'` | base |
| `scavengerCount: 'high'` | +2 from base |
| `wreckTierBoost: N` | All wreck tiers increased by N |

---

## HUD Display

**During play:** small text in HUD corner, e.g. `[the slow tide]`. Subdued color, doesn't compete with gameplay info. Same style as other HUD text.

**Pause screen:** signature name + full flavor text + mechanical callouts. Players can study the rules of their current universe while paused.

**Run start overlay:**
```
entering: the slow tide

currents run long here. take your time — spacetime will not.
low gravity / high drift / extended collapse
```
Fades in 0.5s, holds 3s, fades out 1s. Lowercase. Dim teal or grey-white.

---

## Open Questions

1. **Scavenger behavior per signature?** "The rush" could make all scavengers vulture-like. "The graveyard" could make drifters ignore wrecks near wells (too cautious). Currently only count changes — behavior changes add flavor but scope.
2. **Signature-specific audio hint?** Each signature could tint the drone or well harmonics slightly. "The thick dark" = lower-pitched drone from the start. "The rush" = faster pulse on portals. Small touch, big feel.
3. **Difficulty rating?** Should signatures show a difficulty indicator? "The rush" is harder than "the slow tide." Or let players discover that.
