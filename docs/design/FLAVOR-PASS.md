# Flavor Pass: Entity Identity & Visual Polish

> Making the universe feel lived-in. Every object gets a name, a shape, and a reason to look at it.

## Overview

Seven systems to touch, roughly in dependency order:

1. Dev panel cleanup
2. Replace loot anchors (L objects) with stars or remove
3. Star types + visual differentiation
4. Star orbital systems (asteroids/planetoids)
5. Planetoids → comets
6. Wreck/vault visual differentiation
7. Proximity-based flavor text labels on everything

---

## 1. Dev Panel Cleanup

**Current state:** 11 CONFIG sections exposed. Control type selector at top (keyboard/mouse/controller) — this was useful during early input prototyping but input is now fixed.

**Changes:**
- Remove the control type dropdown from the top
- Add missing tuning sections that matter for feel: `camera.*`, `wrecks.*`, `scavengers.*`, `combat.*`
- Keep hidden: `sim.*` (constants), `audio.*` (disabled), `debug.*` (booleans not sliders)
- No architectural change — just update the `PANEL_CONFIG` entries

**Size:** ~30 lines changed in dev-panel.js

---

## 2. Loot Anchors → Stars or Remove

**Current state:** "L objects" in maps are `LootAnchor` instances — decorative fluid obstacles with micro-gravity. They pulse blue-gold and create local eddies. They are NOT collectible. They have no loot, no names, no interaction. They were a pre-wreck placeholder for "interesting things on the map."

**Problem:** With wrecks, portals, stars, and planetoids all functional, loot anchors are redundant. They occupy map positions and GPU splats without adding gameplay value.

**Recommendation:** Replace each loot anchor position with a star in the map definitions. This gives those positions actual physics (push force), actual visuals (halo + rays), and contributes to the star ecosystem below. Then remove `src/loot.js` and its CONFIG section entirely.

Alternative: if we want non-star points of interest, convert them to wreck spawn points or asteroid clusters.

**Greg's call needed:** Replace with stars, or convert to something else?

---

## 3. Star Types

**Current state:** Single star type. White-yellow halo + 4 rotating rays. Mass varies but all look identical except size.

**Proposed types:**

| Type | Color | Halo | Rays | Size mult | Push strength | Special |
|------|-------|------|------|-----------|---------------|---------|
| **Yellow dwarf** | warm yellow (255, 240, 180) | standard | 4, medium length | 1.0× | 1.0× | baseline, most common |
| **Red giant** | deep red-orange (255, 120, 60) | large, diffuse | 6, long, slow rotation | 1.8× | 0.6× | huge but gentle, easy to navigate around |
| **White dwarf** | blue-white (220, 230, 255) | small, intense | 4, short, fast rotation | 0.5× | 2.0× | compact and punchy, hard to approach |
| **Neutron star** | pale cyan (180, 255, 255) | tiny, sharp | 2, very fast spin | 0.3× | 3.0× | intense, high-value wreck zone |

**Visual differentiation beyond color:**
- **Red giant:** corona effect — large outer glow ring with slow pulsing, denser ray pattern (6 rays), rays have visible thickness gradient
- **White dwarf:** lens flare cross — 2 perpendicular thin bright lines through center, sharp edge to halo (no soft fade)
- **Neutron star:** rotation pulse — the entire star flashes brighter at its spin rate (like a pulsar), plus a narrow beam ray that sweeps

**Map format change:**
```javascript
stars: [
  { x: 1.5, y: 1.65, mass: 0.8, orbitalDir: 1, type: 'redGiant' },
  { x: 0.45, y: 0.75, mass: 0.5, orbitalDir: -1, type: 'whiteDwarf' },
]
```

Falls back to `yellowDwarf` if type omitted (backward compat).

---

## 4. Star Orbital Systems

**Concept:** Stars aren't alone — they have orbiting bodies. Small asteroid clusters and planetoid moons create local navigation texture around each star.

**Implementation:**
- Each star spawns 2-5 small asteroids in stable orbits at creation time
- Orbit radius: 0.08-0.2 world-units from the star center
- Asteroids are tiny (3-4px), gray, no fluid interaction (too small)
- They drift along their orbits at the star's orbital speed
- Visual only — no collision, no loot, just life in the universe

**Star drift:**
- Stars slowly drift position (0.001-0.003 world-units/s, random direction)
- Their orbital systems move with them
- If a star drifts into a well's kill radius: consumed with dramatic effect
  - Well gains mass (0.5 × star mass — significant)
  - Large wave ring (3× normal amplitude)
  - Flash of the star's color across the screen (brief overlay tint)
  - All orbiting asteroids scatter (brief burst of tiny particles)

**Rarity of consumption:** At 0.002 world-units/s drift, a star would take ~500s to drift 1 world-unit. Most runs end before a star reaches a well. When it happens, it's a memorable event.

---

## 5. Planetoids → Comets

**Current state:** Planetoids are tiny blue dots (6px) that orbit wells or trace figure-8 paths. They create bow shocks and wake eddies in the fluid. They get consumed by wells.

**Conversion to comets:**

**Visual:**
- Body: teardrop shape instead of circle. Pointed end faces velocity direction. 8-10px body.
- Color: ice-blue core (200, 230, 255) with warmer trailing edge (180, 200, 220)
- Tail: 3-5 trailing segments behind the body, each progressively dimmer and wider
  - Segment spacing: 0.02 world-units
  - Color: starts as body color, fades to translucent cyan
  - Width: 2px at body, spreads to 6px at tail end
- Coma (head glow): small radial gradient around the body, 15px radius, very faint

**Naming:** Each comet gets a procedural name: `[Prefix] [Greek letter]-[Number]`
- Prefixes: "Comet", "Wanderer", "Drifter"
- Greek: "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"
- Number: 1-99
- Example: "Comet Zeta-47", "Wanderer Alpha-3"

**Behavior unchanged:** Same orbit/figure8/transit paths. Same bow shock + wake fluid effects. Same well consumption. Just looks and feels like a comet now.

**Map format:** No change needed — existing `planetoids` array works as-is. Just rename internally.

---

## 6. Wreck Visual Differentiation

**Current state:** All three wreck types (derelict, debris, vault) use the same gold ring marker with slight size/brightness variations. Vaults get an extra bright center dot.

**Proposed visual overhaul:**

| Type | Shape | Color | VFX |
|------|-------|-------|-----|
| **Derelict** | Broken rectangle — two offset parallel lines | Gray-blue (160, 180, 200) | Slow drift/tumble rotation, faint sparks |
| **Debris** | Scattered dots — 3-4 tiny circles in a cluster | Dull orange (180, 140, 80) | No pulse, static, dusty |
| **Vault** | Diamond/rhombus — rotated square | Gold (255, 215, 60) | Bright pulse, golden particle orbit (like loot shimmer but gold) |

**Fluid VFX differentiation:**
- Derelict: current zero-velocity splat (obstacle), blue-gray glow
- Debris: no glow (too small/scattered), minimal fluid interaction
- Vault: golden glow (warm visual density), stronger fluid obstruction

**Loot preview on approach:** When within 2× pickup radius, show the wreck's name and a count: "Wreck of the Shattered Archive (3 items)"

---

## 7. Proximity Flavor Text Labels

**The big one.** Every named object gets a floating label that fades in as you approach and fades out as you leave.

**Fade distances (world-space):**
- Fully visible: < 0.15
- Fade in/out: 0.15 — 0.4
- Invisible: > 0.4

**Per-object-type styling:**

| Object | Label content | Font | Color | Position |
|--------|--------------|------|-------|----------|
| **Wells** | Name | 11px mono, allcaps | Dark red (180, 40, 40, alpha) | Below center, outside kill radius |
| **Stars** | Scientific designation | 10px mono | Star's type color, dimmed | Below center |
| **Comets** | Name | 9px mono | Ice blue | Trailing behind body |
| **Wrecks** | Wreck name + item count | 10px mono | Type color (gray-blue/orange/gold) | Below marker |
| **Portals** | Already have type labels | — | — | Keep existing |
| **Scavengers** | Faction + archetype | 9px mono | Archetype color | Above ship |

**Name generation:**

Wells (foreboding):
- Format: "The [Adjective] [Noun]"
- Adjectives: Hungering, Endless, Silent, Abyssal, Forsaken, Ravenous, Eternal, Hollow, Consuming, Inexorable
- Nouns: Maw, Abyss, Void, Terminus, Oblivion, Singularity, Collapse, Devourer, Remnant, Eye

Stars (scientific):
- Format: "[Type prefix] [Catalog]-[Number]"
- Type prefixes: "Sol" (yellow dwarf), "Betelgeuse" (red giant), "Sirius" (white dwarf), "Vela" (neutron)
- Catalog: "HD", "HIP", "GJ", "LHS"
- Number: 4-6 digits
- Example: "Sol HD-224817", "Vela GJ-0912"

Scavengers (faction + name):
- Format: "[Faction] [Name]"
- Drifter names: peaceful/nature-themed — "Quiet Tide", "Still Wake", "Ash Petal", "Cold Harbor"
- Vulture names: predatory/sharp — "Keen Edge", "Rust Claw", "Burnt Lance", "Bitter Claim"
- Faction prefix from the three factions: "Collector", "Reaper", "Warden"
- Example: "Collector Quiet Tide", "Reaper Burnt Lance"

Wrecks already have names (procedurally generated from ADJ + NOUN arrays).

---

## Implementation Order

1. **Dev panel cleanup** — 30 min, no dependencies
2. **Loot anchors removal** — 30 min, unblocks star placement
3. **Star types** — 2-3 hrs, stars.js + config + maps
4. **Comets (planetoid rename + visuals)** — 1-2 hrs, planetoids.js
5. **Wreck visuals** — 1-2 hrs, wrecks.js
6. **Name generation + proximity labels** — 2-3 hrs, new labels.js + main.js wiring
7. **Star orbital systems + drift** — 2-3 hrs, stars.js expansion

Items 1-2 are cleanup. Items 3-5 can be parallelized. Items 6-7 depend on 3-5 for the names.

---

## Open Questions for Greg

1. **Loot anchors:** Replace with stars, convert to asteroid clusters, or just delete?
2. **Star consumption by wells:** Dramatic event or quiet removal?
3. **Scavenger factions:** Assign randomly from the three existing factions (collectors/reapers/wardens), or keep faction-less for now?
4. **Label density:** All objects labeled, or only "important" ones (wells, vaults, named NPCs)?
5. **Comet tails:** Canvas overlay only, or also inject tail density into the fluid sim?
