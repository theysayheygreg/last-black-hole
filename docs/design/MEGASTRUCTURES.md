# Megastructures

> Ancient constructions. Cosmic landmarks. Things that make you feel small.

## Design Intent

Megastructures are rare, large, visually striking objects that break the natural pattern of wells + stars + wrecks. They serve three purposes:

1. **Navigation landmarks** — visible from further than anything else, orient the player
2. **Gameplay variety** — each type offers a unique interaction (loot zone, speed boost, warp, beacon)
3. **Worldbuilding** — evidence of civilizations that came before. Who built these? Why are they still here?

## Scale Approach

Start mid-sized (0.2-0.5 world-units across) and multi-part. Individual pieces are entity-scale, but the arrangement spans a large area. This avoids the "bigger than the camera" problem while still reading as massive.

The game's scale is already abstract — wells are supermassive black holes, stars are light-years apart but visible on the same screen. Megastructures live in the same abstraction. They're big enough to be landmarks, not so big they break the visual language.

## Five Types

### 1. Dyson Swarm

**What it is:** A ring of orbiting panels/debris around a star. Not a solid shell — gaps everywhere, like a belt of asteroids but clearly artificial (regular spacing, geometric shapes).

**Visual:** 20-40 small rectangular panels orbiting a star at 0.15-0.25 world-units radius. Each panel is 4-6px, light gray with a faint golden tint. The ring as a whole reads as a dotted circle. Panels rotate slowly to catch "light" (brightness oscillation).

**Gameplay:**
- Panels create fluid obstruction (like wreck zero-velocity splats but smaller)
- Flying through the swarm is like a slalom — currents deflect around each panel
- Some panels are lootable (ancient tech, tier 2-3 components)
- The star inside still pushes outward — you're fighting push while dodging panels

**Multi-part:** Each panel is an independent entity. Destroyed panels don't respawn. The swarm degrades over time as wells consume stray panels via drift.

**Size:** 0.3-0.5 world-units diameter total. Individual panels ~0.01 world-units.

**Spawning:** 1 per map on 5x5+, always around a star (preferably redGiant for visual contrast).

---

### 2. Halo Ring

**What it is:** A massive ring structure orbiting a well at a fixed distance. Ancient, partially intact. The ring plane is tilted relative to the camera, creating a visible ellipse.

**Visual:** Canvas-rendered ellipse (two arcs — front and back). The back arc renders behind the ship layer, the front arc renders on top. This creates the Z-sorting fly-through moment: approach the ring, pass through the plane, and the arc flips from behind you to in front of you.

**Rendering approach:**
```
// Back arc (behind entities)
ctx.strokeStyle = 'rgba(180, 200, 220, 0.3)';
ctx.ellipse(cx, cy, radiusX, radiusY, tilt, Math.PI, Math.PI * 2);  // bottom half

// ... render ship, entities, etc ...

// Front arc (in front of entities)
ctx.strokeStyle = 'rgba(180, 200, 220, 0.6)';
ctx.ellipse(cx, cy, radiusX, radiusY, tilt, 0, Math.PI);  // top half
```

The tilt angle slowly rotates over time (0.02 rad/s), making the ring appear to precess.

**Gameplay:**
- Interior of the ring is a loot-rich zone — 4-6 wrecks clustered inside
- Ring itself has no collision (you fly through it)
- The well it orbits creates the danger — you're looting near a gravity well
- Ring provides a visual reference for "how close to the well am I?"
- Halo surface could have docked objects (small lootable nodes on the ring itself)

**Size:** Ring radius 0.15-0.25 world-units from the well center. Ring "thickness" (stroke width) 3-5px.

**Spawning:** 0-1 per map. Only on maps with 5+ wells. Orbits a mid-mass well (not the mega-well — too dangerous, and the mega-well is dramatic enough on its own).

---

### 3. Stargate

**What it is:** Two anchor pylons connected by an energy bridge. Fly through the bridge for a speed boost or a warp to a paired gate elsewhere on the map.

**Visual:** Two bright points (8-10px each, cyan-white) with an energy line between them. The line pulses and has a particle flow effect (small dots traveling along it). Gate entrance has a subtle radial glow. Distance between pylons: 0.08-0.12 world-units (ship can fly through).

**Gameplay — two variants:**

**Boost Gate (common):** Fly through for a 2-3× speed burst lasting 1-2 seconds. Direction is the gate's facing — you exit in the direction perpendicular to the pylon line. Good for escaping wells or covering distance fast.

**Warp Gate (rare):** Gates come in pairs. Enter one, exit the other. Instantaneous transport. Huge tactical value — skip across the map. But you arrive at the other gate's position, which might be near a well. Risk/reward.

**Size:** Pylon-to-pylon span: 0.08-0.12 world-units. Each pylon has a small visual radius (10px).

**Spawning:** 1-2 boost gates per map. 0-1 warp gate pairs (only on 10x10). Placed in navigable space between wells — they're transit infrastructure, not danger.

---

### 4. Beacon (The Astronomicon)

**What it is:** A massive signal emitter visible from anywhere on the map. Ancient navigation aid. Emits a visible "beam" in a fixed direction that rotates slowly — like a lighthouse in space.

**Visual:** Central structure (12-15px bright point, pulsing). Beam: a long thin cone/line that extends 0.5-1.0 world-units in one direction, rotating at 0.1 rad/s. Beam color: warm amber/gold (distinct from star colors and well accretion). Beam fades with distance from the beacon.

The beam should be visible at the edges of the screen even when the beacon is off-screen — it's a directional landmark. If you can see the beam sweeping past, you know roughly where the beacon is.

**Gameplay:**
- Navigation landmark — always visible, helps orientation on large maps
- The beacon itself is lootable (tier 3 data cores — "ancient navigation archives")
- If the signal system is built: beacon proximity reduces signal generation (it's masking you). Creates a "safe zone" near the beacon where you can play aggressively with less signal cost.
- Beam interaction: flying through the beam gives a brief sensor boost (see labels from further away for 5s)

**Size:** Central point is small. Beam extends 0.5-1.0 world-units.

**Spawning:** 0-1 per map. Only on maps with worldScale >= 5. Placed far from wells (it's a safe harbor, not a danger zone).

---

### 5. Derelict Station

**What it is:** A massive wreck cluster. Not one wreck — a whole dead station broken into connected pieces. The biggest loot jackpot on the map, but also the most conspicuous (signals scavengers, maybe attracts the Inhibitor).

**Visual:** A cluster of 6-10 wreck markers in a tight formation (0.1 world-unit radius). Central hub piece (large wreck marker, 20px). Connected by faint lines (structural remnants). Slowly tumbling (entire cluster rotates at 0.05 rad/s).

**Gameplay:**
- Each piece is individually lootable (mix of tier 2 and tier 3)
- The hub piece is a vault with guaranteed rare/unique loot
- The whole cluster drifts toward the nearest well (like regular wrecks but the cluster moves as a unit)
- Station mass creates a micro-gravity field — very weak, but enough to pull nearby debris and comets toward it
- If signal system exists: looting a station piece generates 2× normal signal (the station's systems briefly power up when disturbed)

**Size:** Cluster diameter: 0.1-0.15 world-units. Individual pieces: standard wreck sizes.

**Spawning:** 0-1 per map. Only on 5x5+. Placed in deep zone (between wells, moderate risk). The drift system means it won't stay there — it'll slowly migrate toward a well over the course of a run.

---

## Megastructure Spawning in the Generator

Add a phase between comets and output:

```
5. MEGASTRUCTURES → place 0-3 based on worldScale and params
```

**Budget per map size:**
- 3x3: 0-1 megastructures (small map, keep it focused)
- 5x5: 1-2 megastructures
- 10x10: 2-3 megastructures

**Type weights by map size:**

| Type | 3x3 | 5x5 | 10x10 |
|------|-----|-----|-------|
| Dyson Swarm | 30% | 25% | 20% |
| Halo Ring | 20% | 25% | 25% |
| Stargate (boost) | 30% | 20% | 15% |
| Stargate (warp) | 0% | 10% | 15% |
| Beacon | 0% | 10% | 15% |
| Derelict Station | 20% | 10% | 10% |

Small maps get simpler structures. Large maps get the exotic ones.

## Naming

Each megastructure gets a procedural name:

- Dyson Swarm: "The [Adjective] Swarm" — Shattered, Crystalline, Dormant, Fractured
- Halo Ring: "Ring of [Noun]" — Silence, Convergence, the Forgotten, Eternity
- Stargate: "[Adjective] Gate" — Collapsed, Resonant, Flickering, Ancient
- Beacon: "The [Noun]" — Astronomicon, Lighthouse, Spire, Lodestar
- Derelict Station: "Station [Greek]-[Number]" — Station Omega-7, Station Theta-12

## Visual Priority

Megastructures should be the second-most-visible thing on the map (after wells). They need to read from at least 0.3 world-units away. The edge indicator system should include them (distinct icon/color — white or amber).

## Implementation Order

1. **Derelict Station** — simplest, it's just a wreck cluster with extra properties
2. **Stargate (boost)** — two points + energy line + trigger zone, self-contained
3. **Dyson Swarm** — multi-entity system around a star, moderate complexity
4. **Beacon** — beam rendering + rotation + gameplay effects
5. **Halo Ring** — Z-sorting rendering is the technical challenge, save for last

## Decisions (2026-03-28)

1. **Persistence:** Each run = new seed = new map = new megastructure layout. No cross-run persistence of structure state. The seed determines the stage; player choices determine the play. Revisit seed determinism when more systems interact with it (signal, inhibitor, faction state).

## Open Questions (remaining)

2. **Can wells consume megastructures?** Drift means they'd eventually reach a well. Dyson swarm panels definitely. Whole stations maybe. Halo rings probably not (they orbit a well). Stargates and beacons are anchored (no drift).
3. **Should megastructures interact with the signal system?** The beacon definitely should (signal dampening zone). The station should amplify signal. Others neutral.
4. **Art direction:** These are canvas-rendered like everything else. But they need to feel *different* from natural objects. Suggestion: use straight lines and geometric shapes exclusively (no arcs, no organic curves). Ancient tech = sharp angles against the organic fluid background.
