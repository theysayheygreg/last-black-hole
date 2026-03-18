# Wrecks — Salvage from Dead Civilizations

> The universe is littered with the remains of those who didn't make it out.
> Every wreck is a grave and a gift.

---

## Design Intent

Wrecks are the reason you're here. They're the loot, the terrain, and the narrative all at once. Each wreck tells a micro-story through its name and placement. Mechanically, they obstruct fluid flow (creating navigable terrain features) and reward risk-taking (the best loot is near the most dangerous wells).

---

## Base Object: `Wreck`

Every wreck is an instance of the base `Wreck` class with per-instance properties:

```javascript
{
  wx, wy,           // world-space position
  type: 'derelict', // wreck type (see Types below)
  tier: 1,          // 1=surface, 2=deep, 3=core
  size: 'medium',   // small, medium, large — affects fluid obstruction + visual footprint
  loot: [],         // items generated at spawn (1-5 depending on type/tier)
  looted: false,    // dims to gray when true
  alive: true,      // false = fully consumed by well growth
  name: '...',      // generated flavor name
}
```

Map files define wrecks the same way as other entities:
```javascript
wrecks: [
  { x: 1.2, y: 0.8, type: 'derelict', tier: 1, size: 'medium' },
  { x: 2.0, y: 2.3, type: 'vault', tier: 3, size: 'small' },
]
```

---

## Wreck Types

### Derelict (common, 60%)
Standard wreck. A dead ship or station, mid-size fluid obstacle. The bread and butter.
- **Size range:** small–large
- **Loot:** 1–3 items, mixed quality
- **Fluid obstruction:** moderate — creates visible lee zone and vortex shedding
- **Visual:** gold/amber ASCII cluster (`#D4A843`), irregular shape

### Debris Field (common, 25%)
Scattered remains. Multiple small obstacles instead of one big one. Creates a maze-like flow pattern.
- **Size range:** always "scattered" — 3–6 small pieces in a cluster radius
- **Loot:** 1–2 items per piece (but more pieces = more total), low individual value
- **Fluid obstruction:** light per piece, but the cluster creates complex eddy patterns
- **Visual:** dim gold dots/dashes spread across area, less dense than derelict

### Vault (rare, 15%)
Hardened storage. Small but extremely valuable. Always placed near danger (wells, between wells, in orbital paths).
- **Size range:** always small — hard to spot
- **Loot:** 3–5 items, high quality, unique items possible
- **Fluid obstruction:** minimal — tiny, almost invisible in the flow
- **Visual:** bright white-gold (`#FFE8A0`), compact, pulsing glow like loot but gold-tinted

---

## Tiers (Placement Risk)

Tiers define where wrecks spawn relative to danger, not what they contain (though higher tiers have better loot tables):

| Tier | Name | Placement | Risk | Loot Quality |
|------|------|-----------|------|------------|
| 1 | Surface | Safe zones: between wells, near portals, in star push zones | Low | Common salvage |
| 2 | Deep | Mid-distance from wells, in orbital current paths | Medium — currents pull you, need to navigate out | Uncommon + rare chance |
| 3 | Core | Near well kill radii, between closely-spaced wells, in gravity lanes | High — real chance of death | Rare + unique chance |

Tier distribution per map:
- 3×3 (Shallows): 5–8 wrecks, 60/30/10 split
- 5×5 (Expanse): 12–18 wrecks, 55/30/15 split
- 10×10 (Deep Field): 30–50 wrecks, 50/30/20 split

---

## Fluid Interaction

Wrecks are fluid obstacles. They don't have well-like gravity — they're inert masses that block and redirect flow.

**Implementation:** Each wreck injects a zero-velocity splat at its position every frame (same pattern as current loot anchors). Size scales the splat radius. The surrounding fluid flows around the wreck, creating:

- **Lee zone** — calm pocket downstream of the wreck (relative to prevailing flow). Safe resting spot.
- **Vortex shedding** — alternating eddies form behind the wreck when flow speed is high. Visible as flickering ASCII density.
- **Bow wave** — density buildup on the upstream face. Visual indicator of flow direction.

Large wrecks create more dramatic flow features than small ones.

---

## Pickup Mechanic

- **Range:** ship within `pickupRadius` world-units of wreck center (CONFIG tunable, starts at ~0.08)
- **Trigger:** automatic on proximity — no button press. Fly-over looting.
- **Feedback:**
  - Wreck dims from gold to gray (`#555555`)
  - Brief flash/pulse on the overlay
  - Loot items added to inventory array
  - Console log (until HUD exists): `"Salvaged: Wreck of the Ascending Chorus — 3 items"`
- **Partial loot:** v1 is all-or-nothing. Future: large wrecks could require multiple passes.

---

## Loot Items

v1 items are simple data objects with generated names. No stats, no equipment — just names and values for the extraction score screen.

```javascript
{
  name: 'Quantum Lattice Fragment',
  value: 150,          // score contribution
  tier: 'uncommon',    // common, uncommon, rare, unique
  source: 'Wreck of the Ascending Chorus',
}
```

### Name Generation

**Wreck names:** `"[Wreck/Remains/Hulk] of the [Adjective] [Noun]"`
- Adjectives: Ascending, Crystalline, Shattered, Infinite, Dreaming, Ossified, Luminous, Drifting, Harmonic, Forgotten
- Nouns: Chorus, Lattice, Meridian, Archive, Theorem, Garden, Beacon, Chrysalis, Mandate, Confluence

**Item names:** `"[Material] [Object]"`
- Materials: Quantum, Exotic, Null, Phase, Stellar, Void, Dark, Temporal, Prismatic, Entropic
- Objects: Fragment, Core, Lattice, Matrix, Coil, Lens, Shard, Seed, Engine, Key

---

## Wreck Destruction

Wells can consume wrecks as they grow:
- When a well's kill radius expands to overlap a wreck position, the wreck is destroyed
- Visual: wreck dims, then rapid density drain toward the well (like planetoid consumption)
- Wave ring spawned on destruction
- Un-looted wrecks that get consumed = lost opportunity. The universe doesn't wait.

---

## Performance Notes

Each wreck adds ~2 splat passes (obstruction + glow). At 50 wrecks on a 10×10 map: ~100 extra passes. Camera culling already skips off-screen entities, so actual cost is ~10–15 passes (visible wrecks only). No shader changes needed — reuses existing splat infrastructure.
