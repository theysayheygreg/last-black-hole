# Entity Types — Force Models & Interaction Matrix

> Defines every entity that affects the fluid sim and/or ship physics.
> Each entity's force model, visual injection, and ship interaction are documented here.

---

## Entity Overview

| Entity | File | Force on Fluid | Force on Ship | Visual Layer |
|--------|------|---------------|---------------|-------------|
| Well | wells.js | Gravity pull + orbital | Direct gravity pull | Fluid (accretion disk, event horizon) |
| Star | stars.js | Radiation push (negative gravity) | Direct push (repulsive) | Fluid (core, rays) + Overlay (marker) |
| Loot Anchor | loot.js | Zero-velocity splat (obstruction) | None (passive) | Fluid (glow, shimmer) + Overlay (pulse dot) |
| Wreck | wrecks.js | Zero-velocity splat (obstacle) | None (passive) | Fluid (obstruction + glow) + Overlay (marker) |
| Portal | portals.js | Weak inward pull + spiral density | None | Fluid (purple vortex) + Overlay (pulsing ring) |
| Planetoid | planetoids.js | Bow shock + wake vortex + trail | Push (proximity) | Fluid (wake) + Overlay (dot + velocity line) |
| Ship | ship.js | Bullet wake (speed-based splats) | Self (thrust + drag + fluid coupling) | Overlay (triangle + trail) |
| Wave Ring | wave-rings.js | Fluid distortion (injected into sim) | Outward push when wavefront passes | Overlay (expanding circle) |

---

## Wells (Gravity Sinks)

**Purpose:** Primary terrain. Create orbital currents, accretion zones, and navigational hazards.

**Fluid force:** `applyWellForce()` with positive gravity + orbital tangential component. Creates steady inward spiral flow.

**Ship force:** Direct gravitational pull in pixel-space. `shipPullStrength * mass / dist^falloff`.

**Visual:** Multi-ring accretion disk (hot white inner → dim red outer), spinning injection points with spiral arm pattern. Event horizon: negative density void at center + bright innermost ring.

**Interaction with other entities:** Stars create equilibrium points when push balances pull. Loot anchors near wells create tension (flow obstruction vs gravity pull). Ship wake is pulled into orbital currents.

---

## Stars (Radiant Push Sources)

**Purpose:** Gravitational inverse of wells. Create cleared bubbles, radial streaks, and equilibrium zones.

**Fluid force:** `applyWellForce()` with **negative gravity**. Pushes fluid outward. Small tangential spin gives outflow a twist. Clearing bubble (negative density) at center.

**Ship force:** Direct push away from star. Same formula as well pull but reversed direction.

**Visual:** Bright white-yellow core splat. 6 rotating radial rays (4 points per ray, warm white → blue-white at tips). Overlay: pulsing glow dot.

**Equilibrium zones:** Between a star and a well, the push and pull balance at some radius, creating a navigable channel or calm zone. These are the Lagrange-like points — stable-ish regions where fluid pools.

**CONFIG section:** `stars.*`

---

## Loot Anchors (Flow Obstacles)

**Purpose:** Static points that resist fluid flow. Create lee zones (calm downstream) and vortex shedding (eddies). Future loot pickup locations.

**Fluid force:** Zero-velocity splat at position each frame. No well force (removed for performance — splat-only anchoring is sufficient). Shimmer density injection creates visible marker in fluid.

**Ship force:** None. Passive obstacle.

**Visual:** Ambient glow (cool blue-cyan density). 4 rotating shimmer points (warm white). Overlay: pulsing dot with glow ring.

**Lee zones:** Downstream of loot (relative to prevailing flow), density and velocity are lower — a calm pocket. Upstream, vortex shedding creates small eddies.

**CONFIG section:** `loot.*`

---

## Interaction Matrix

| | Well | Star | Loot | Ship | Wave Ring |
|---|---|---|---|---|---|
| **Well** | Accrete (growth events) | Equilibrium zones | Lee zone in well flow | Gravity trap / death | Spawns rings on growth |
| **Star** | Equilibrium zones | (no interaction) | Outflow clears near loot | Push away (safe zone) | — |
| **Loot** | Dangerous to reach | Outflow affects wake | (no interaction) | Future: pickup | — |
| **Ship** | Pulled in, can die | Pushed away | Future: collect | — | Pushed outward |
| **Wave Ring** | Source | — | — | Pushes ship | — |

---

## Performance Budget

Each entity type adds shader passes per frame:

| Entity | Passes per instance | Instances | Total per frame |
|--------|-------------------|-----------|-----------------|
| Well | 1 applyWellForce + ~30 splats | 4 | ~124 passes |
| Star | 1 applyWellForce + ~28 splats | 2 | ~60 passes |
| Loot | ~6 splats | 3 | ~18 passes |
| Ship | 3 splats (wake) | 1 | ~3 passes |

Total new passes from stars + loot: ~78. At 256x256 resolution, each pass is trivial on discrete GPU. Headless Chrome may show FPS drop.
