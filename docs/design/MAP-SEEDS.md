# Map Seeds: Run Variety from a Shared Catalog

> How each run feels different without hand-crafting every map.

---

## The Seed

Every run has a numeric seed. The seed determines everything procedural about the run: entity selection, wreck placement, portal schedule, fauna composition, AI personality picks. Same seed = same run structure (though player behavior makes outcomes different).

Seeds are shown on the results screen. Players can share seeds. "Run seed 4821 — there's a T4 at the 4-minute wreck near Charybdis."

---

## What the Seed Controls

### 1. Well Layout (Map-Level)

Wells are defined by the map file (Shallows = 4-5 wells, Depths = 8-10, Abyss = 15+). The seed determines:
- **Well mass variance:** each well's starting mass is base ± 15% (seed-driven)
- **Orbital direction:** which wells spin clockwise vs counter-clockwise
- **Growth rate variance:** each well grows at base ± 20%
- **Well names:** drawn from a name pool, seed determines which names appear

The well *positions* come from the map file, not the seed. This means the macro layout is designed (flow paths between wells are tested), but the micro behavior varies per run.

### 2. Entity Catalog Selection

The seed picks from the entity catalog to populate the run. Not every entity type appears every time.

| Category | Pool | Per-Run Selection | Seed Determines |
|----------|------|-------------------|-----------------|
| **Fauna (ambient)** | drift jellies, signal blooms | 1-2 types active | which types, spawn density multiplier (0.5×-1.5×) |
| **Sentries (active)** | gradient sentries | always present | count per well (2-3), orbit radius variance |
| **AI players** | 5 personalities × 5 hulls | 3 AI, at least 2 distinct personalities | personality + hull picks (see CLASSES-AND-PROGRESSION.md) |
| **Scavengers** | drifter, vulture | always both | count (3-6), faction ratio |
| **Inhibitor** | glitch → swarm → vessel | always present | wake threshold (0.82-0.98), spawn position |

### 3. Wreck Composition

The seed determines wreck spawn wave details within the constraints of LOOT-ECONOMY.md:
- **Wave count variance:** each wave spawns base ± 1 wrecks
- **Loot quality bias:** seed sets a "quality bias" per run (0.8×-1.2× on tier roll weights). A lucky seed has slightly better odds at higher tiers.
- **Spawn position bias:** seed determines which wells the late-wave wrecks cluster near
- **Special wrecks:** 10% chance per run of a "named wreck" — a unique derelict with guaranteed T3+ loot and a flavor name ("The Carthage", "Beacon of Last Light", "Hull 7")

### 4. Portal Schedule

Portal waves are defined in PORTAL_CONFIG but the seed adds variance:
- **Wave timing:** each wave ±10s from scheduled time
- **Portal type weights:** seed biases toward more standard/rift/unstable portals
- **Position clustering:** seed determines if portals tend to cluster near wells (dangerous extraction) or in open space (safe but requires travel)

### 5. Cosmic Signature (Stretch)

Each seed could produce a "cosmic signature" — a set of CONFIG overrides that give the run a distinct feel:

| Signature | Effect | Feel |
|-----------|--------|------|
| **Heavy Current** | currentCoupling ×1.3 for all entities | strong rivers, dramatic surfing |
| **Dead Calm** | currentCoupling ×0.5, drag ×0.8 | everything floats, hard to stop |
| **Signal Storm** | signalGenMult ×1.5, signalDecayMult ×0.7 | loud universe, inhibitor wakes fast |
| **Deep Gravity** | well gravity ×1.3, well growth ×0.7 | strong pull, slow collapse |
| **Thin Space** | well gravity ×0.7, portal lifespan ×0.6 | weaker wells, but portals vanish fast |
| **Dark Run** | sensorRange ×0.6 for all entities | can't see far, navigation by feel |

One signature per run. Shown on map select: "Shallows — seed 4821 — Heavy Current". Players learn to prefer certain signatures for their hull.

---

## Seed Implementation Shape

```javascript
function applyRunSeed(seed, mapState, session) {
  const rng = createSeededRNG(seed);

  // Well variance
  for (const well of mapState.wells) {
    well.mass *= 0.85 + rng() * 0.30;
    well.growthRate *= 0.80 + rng() * 0.40;
    well.orbitalDir = rng() > 0.5 ? 1 : -1;
    well.name = pickWellName(rng);
  }

  // Entity catalog selection
  session.activeFauna = pickFaunaTypes(rng);    // 1-2 from pool
  session.faunaDensity = 0.5 + rng() * 1.0;    // spawn rate multiplier
  session.sentryCountBias = rng() > 0.5 ? 3 : 2; // per-well

  // AI picks (done in spawnAIPlayers, but seed drives the RNG)
  session.aiSeed = Math.floor(rng() * 1e9);

  // Loot quality bias
  session.lootQualityBias = 0.8 + rng() * 0.4;  // multiplier on tier weights

  // Portal timing variance
  session.portalTimingBias = -10 + rng() * 20;   // seconds ± from schedule

  // Special wreck chance
  session.hasNamedWreck = rng() < 0.10;
  if (session.hasNamedWreck) {
    session.namedWreckWave = 3 + Math.floor(rng() * 3); // waves 3-5
    session.namedWreckName = pickWreckName(rng);
  }

  // Cosmic signature (stretch — one per run)
  session.cosmicSignature = pickSignature(rng);

  return { seed, rng };
}
```

### Seeded RNG

Use a simple but deterministic PRNG (e.g., mulberry32 or xoshiro128). The seed must produce identical output on every platform (no floating-point divergence). The RNG is consumed in a fixed order so adding new seed-controlled features doesn't change existing behavior for old seeds.

```javascript
function createSeededRNG(seed) {
  let state = seed | 0;
  return function() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

---

## Seed Display and Sharing

- **Map select screen:** shows seed number + cosmic signature name
- **Results screen:** shows seed for sharing
- **Seed input:** players can type a specific seed on map select to replay a run structure
- **Daily seed:** optional featured seed (stretch — requires server coordination)

---

## Open Questions

1. **How many cosmic signatures?** 6 feels right for variety without overwhelming. Each should be learnable — "Heavy Current favors Drifters, Signal Storm favors Shrouds."

2. **Named wreck pool:** how many named wrecks in the pool? 20-30 with hand-written flavor? Or procedural names from word lists?

3. **Seed stability:** when we add new entity types to the catalog, old seeds produce different runs. Is this acceptable? Leaning yes — seeds are ephemeral, not saveable.
