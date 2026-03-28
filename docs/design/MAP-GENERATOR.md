# Procedural Map Generator

> Spawn logic, not explicit positions. Every run gets a unique universe.

## Core Insight

Wells define the map's gravity topology. Everything else is placed relative to that topology — how close to danger, how reachable by fluid currents, how visible from a distance. The generator reasons about risk zones, not coordinates.

## Algorithm: Three Phases

```
1. WELLS    → establish gravity skeleton (Poisson-disk rejection sampling)
2. STARS    → fill neutral space (avoid wells)
3. WRECKS   → place loot by risk zone (surface / deep / core tiers)
4. COMETS   → reference wells for orbit/figure-8 paths
5. PORTALS  → unchanged (wave-timer driven, not placed by generator)
```

Each phase reads the output of previous phases. Everything flows from a single seeded PRNG — same seed + same params = identical map.

## Seeded RNG

```javascript
function createRNG(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}
```

No `Math.random()` anywhere in the generator.

## Parameters

```javascript
{
  seed: 0,
  worldScale: 3.0,

  // Wells
  wellCount: 5,                    // or 'auto' → 2 + worldScale * 1.2
  megaWell: true,                  // central mega-well on maps >= worldScale 4
  wellMinSeparation: 0.6,         // world-units between well centers
  wellMaxCenterDist: 0.75,        // fraction of map radius

  // Stars
  starDensity: 1.5,               // stars per world-unit² area
  starWellClearance: 0.15,        // min world-units from any well

  // Wrecks
  wreckDensity: 2.0,              // wrecks per world-unit² area
  wreckTierWeights: [0.5, 0.35, 0.15],  // tier 1/2/3 distribution
  debrisClusterChance: 0.3,       // chance a wreck spawns as debris field
  difficulty: 0.5,                // 0 = core zone wide, 1 = core zone tight

  // Comets
  cometCount: 4,                  // base, plus ~0.5 per well

  // Signature override
  cosmicSignature: null,
}
```

Counts scale with area: `count = density × worldScale²`.

## Phase 1: Well Placement

Rejection sampling within a bounded annulus.

**Central mega-well** (worldScale >= 4): placed at map center with high mass (1.5-2.5), large kill radius.

**Remaining wells**: random angle, random distance from center (min 0.3, max 0.75 × worldScale). Rejected if closer than `wellMinSeparation` to any existing well. Kill radius correlates with mass.

**Kill radius from mass**: `killRadius = baseKR + (mass / 2.0) * 0.03`

Exhausting 200 attempts is OK — fewer wells = more open space. Log warning if < 60% target count placed.

## Phase 2: Star Placement

Uniform random within map bounds. Reject if closer than `starWellClearance` to any well. No star-to-star minimum — clumps are fine.

**Type distribution**: yellowDwarf 55%, redGiant 20%, whiteDwarf 15%, neutronStar 10%.

**Neutron star bias**: prefer 0.2-0.5 world-units from nearest well (close enough to interact with gravity, far enough to not get swallowed instantly). Reroll with 70% probability if outside this range.

## Phase 3: Wreck Placement

The risk/reward engine. Three concentric zones per well:

```
CORE_ZONE    = killRadius × coreMult    // tier 3 — fluid actively pulls you in
DEEP_ZONE    = killRadius × 7           // tier 2 — gravity noticeable
SURFACE      = everything else           // tier 1 — safe
```

`coreMult` scales with difficulty: `lerp(4.0, 2.0, difficulty)`. At high difficulty, tier 3 wrecks spawn closer to the kill radius.

**Placement rules**:
- Tier 1: must be outside DEEP_ZONE of all wells
- Tier 2: must be inside DEEP_ZONE but outside CORE_ZONE
- Tier 3: must be inside CORE_ZONE but outside killRadius × 1.5

**Debris clusters**: 30% chance any wreck spawns 1-3 extra scattered pieces within 0.05 world-units.

**Vault distribution**: tier 3 wrecks have ~30% chance of being 'vault' type (highest loot quality).

## Phase 4: Comet Spawning

Comets reference wells by index. Count = `cometCount + floor(wellCount × 0.5)`.

**Type weights**: orbit 40%, figure-8 35%, transit 25%.

**Figure-8 constraint**: only connect wells within 1.0 world-units of each other. Beyond that the path is too long to be interesting.

**Transit comets**: get random edge-to-edge paths at runtime (no well reference needed).

## Output Shape

```javascript
{
  name: `Sector ${seed}`,
  worldScale: 3.0,
  generated: true,       // flag for loader
  seed: 12345,           // for replay/sharing
  wells: [...],          // same format as static maps
  stars: [...],
  wrecks: [...],
  planetoids: [...],
}
```

Identical to static map format. No loader changes needed beyond recognizing `generated: true`.

## Validation Pass

After generation, verify:
- At least 2 wells (gravity topology needs tension)
- No wreck inside any kill radius × 1.2
- At least one tier 3 wreck exists (there must be a prize)
- No entity outside map bounds × 1.05

If validation fails, increment seed and regenerate.

## Cosmic Signature Override

The signature system can twist generator knobs before generation:

```javascript
if (params.cosmicSignature) {
  // e.g., "Dense Collapse" increases well count and difficulty
  if (sig.wellDensity) params.wellCount = sig.wellDensity;
  if (sig.hazardLevel) params.difficulty = sig.hazardLevel;
  if (sig.lootRichness) params.wreckDensity *= sig.lootRichness;
}
```

Generator stays dumb about signatures. Signatures decide what knobs to twist.

## What This Doesn't Do (Yet)

- **Named regions / biomes**: no zone naming. Layer on top later.
- **Path safety**: no guarantee player can reach tier 3 without passing a kill radius. Fluid sim makes static reachability analysis impractical. Playtest instead.
- **Hand-authored landmarks**: "always place X at center" overrides. Easy post-generation fixup, not needed for v1.

## File Location

```
src/maps/generate.js      — generator function
src/maps/gen-params.js    — default params + validation
```

Next to static maps. Loader picks based on game mode.

## Decisions (2026-03-28)

1. **Seed visibility:** Hidden for now. Future: expose for sharing ("try seed 48271"), daily seeds for leaderboards. Backlogged.
2. **Reroll:** No. Doesn't mesh with persistent pilot identity — you play what the universe gives you.
3. **Title screen:** Explore generative title screens from fixed/rotating seeds. Potential for dramatic, unique backdrops each session.
4. **Map topology:** Always toroidal. No bounded maps.

## Backlog: Seed Features
- Daily seed mode (same seed for all players, shared leaderboard)
- Seed display on death/extract screen
- Seed input for challenge runs
- Seeded leaderboards per map size
