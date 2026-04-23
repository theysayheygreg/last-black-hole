# Last Singularity

> Surfing spacetime on gravity waves out of a dying universe.

**Format:** Web game (browser, canvas/WebGL)
**Jam:** March 16–22, 2026 (code starts 12:01a Monday)
**Target:** Single-player with AI opponents. Multiplayer stretch goal.
**Tone:** Three Body Problem meets Revelation Space meets Caves of Qud. Hard sci-fi cosmic dread with a roguelike extraction loop.

---

## One-Sentence Pitch

You are the last black hole surfer — drop into collapsing universe instances, scavenge wreckage of dead civilizations while riding gravity waves, and extract through an evaporating portal before spacetime itself swallows you whole.

---

## Core Loop

```
PREP → DROP → SCAVENGE → SIGNAL → EXTRACT → UPGRADE → REPEAT
```

1. **Prep** — Choose loadout, apply mutations/upgrades from previous runs
2. **Drop** — Enter a procedurally generated collapsing universe
3. **Scavenge** — Navigate fluid spacetime, loot civilization wrecks, harvest exotic matter
4. **Signal** — Every action emits signal. More signal = faster loot discovery, but attracts threats. The central risk/reward dial.
5. **Extract** — Reach an evaporating portal before the universe becomes unplayable
6. **Upgrade** — Spend salvage on ship mods, mutations, knowledge. Stub currencies for now.

---

## The Universe as Clock

No countdown timer. The universe visibly dies around you through stacking mechanics:

### Black Hole Growth
- Black holes are attractors in the fluid sim
- They accrete mass over time, growing their pull radius
- Small wells early → merged monsters late
- Playable space literally shrinks as fluid drains toward singularities

### Portal Evaporation
- Multiple extraction portals exist at run start
- They blink out over time: consumed by black holes, used by other "players," or spontaneous collapse
- Longer you stay = fewer exits, more dangerous paths to reach them
- Last portal out is always the hardest

### Hawking Radiation
- Growing black holes emit more radiation
- Visual noise, sensor interference, damage zones
- The universe gets louder and more hostile as it dies

### Spacetime Viscosity
- The fluid sim thickens over time
- Early: waves are fast, surfing is responsive
- Late: everything is sluggish, heavy, dragging toward collapse
- The controls themselves degrade — you feel the universe dying through the input

---

## Movement & Physics

### Thrust-Based Mouse Control
- **Mouse position** sets thrust direction (ship nose points at cursor)
- **Click/hold** for thrust — acceleration, not teleportation
- **Release** — drift with the fluid current (momentum carries)
- **Fluid velocity adds to ship velocity** — surfing means reading waves and riding

### Fluid Interaction (Core Skill Axis)
- **With the wave** = speed boost, less steering control
- **Against the current** = slow, precise maneuvering
- **Near attractors** = pulled in, screen distorts. Thrust alone can't escape — need to catch an outbound wave
- **Wave reading** is the primary skill. Good players see patterns and ride. New players fight currents and burn fuel.

---

## Threat Hierarchy (PvPvE)

| Tier | Entity | Behavior | Threat |
|------|--------|----------|--------|
| **Scavengers** | AI "players" — ships from dying civilizations | Loot wrecks, avoid danger, extract via portals, sometimes hostile | Moderate — compete for resources and exits |
| **Fauna** | Spacetime predators — native to the universe | Attracted by signal/movement, territorial near wrecks | Annoying → dangerous in groups |
| **Inhibitors** | Extradimensional entities from dead universes | Dormant until signal threshold. Once active: relentless, unkillable, fast | Existential — evade or die |

### Dark Forest Mechanic
- The Inhibitors embody dark forest theory
- They don't chase you because they hate you — your existence is a statistical threat
- Signal management IS survival: every scan, every thruster burn, every loot pickup adds to your signal footprint
- Crossing the threshold is irreversible within a run — once they wake, they don't sleep

### Scavenger AI
- Mirror the player's behavior: navigate waves, loot wrecks, head for portals
- Some are passive (avoid conflict), some are aggressive (attack for your loot)
- They use portals — a portal used by a scavenger is gone
- Creates organic time pressure beyond the universe collapse

---

## Visual Design

### Visual Core: ASCII Dithered Fluid Rendering

The entire game world is rendered through an **ASCII dithering shader**. The fluid sim and gravity field are not drawn as smooth gradients — they're translated into colored ASCII characters on a black background. Think colored terminal art meets fluid dynamics.

**References:**
- [SHL0MS ASCII dithering](https://x.com/SHL0MS/status/2032619306689720726) — characters as density, color as mood
- [Hermes Agent ASCII Video Skill](https://github.com/NousResearch/hermes-agent/tree/main/skills/creative/ascii-video) — full pipeline: density ramps (`.:-=+#@█`), multi-grid layering, OKLCH color, feedback buffer for temporal decay/motion trails, reaction-diffusion fields. CPU/NumPy implementation but concepts port to WebGL shaders.

**How it maps:**
- **Fluid density** → character weight. Dense flow regions = heavy characters (`X`, `$`, `#`, `@`). Thin/vacuum = sparse characters (`.`, `:`, `;`)
- **Velocity/direction** → character selection. Horizontal flow = `=`, `~`, `-`. Vertical = `|`, `!`. Turbulence = `+`, `*`, `%`
- **Energy/temperature** → color tint. Cold void = deep blue sparse dots. Warm radiation near black holes = amber/red dense characters. Portals = green/cyan glow
- **Wrecks** — dense character clusters forming recognizable shapes against the flowing background
- **Inhibitors** — glitch characters. Wrong symbols. Unicode that doesn't belong in the ASCII set. Visually alien.
- **Ship** — one of the few clean geometric elements (or a bright distinct character), standing out against the dithered world

**Implementation:** Post-process shader. Render fluid sim to framebuffer → divide screen into character cells → sample density/velocity/color per cell → look up ASCII character from font texture atlas based on luminance → tint with sampled color. GPU-friendly, 60fps.

### Three-Layer Stack

**Layer 1 — Background: Spacetime Grid (under the ASCII)**
- Deformable grid visible through sparse ASCII regions
- Star particle field that swirls around mass sources
- Grid lines distort and stretch around black holes
- Subtle — the ASCII layer is dominant, grid is structural

**Layer 2 — Midground: ASCII-Rendered Fluid + Entities**
- Fluid sim rendered through the ASCII dithering shader
- Gravity waves visible as character-density ripples propagating across space
- Ships, wrecks, portals, fauna, Inhibitors as distinct character clusters or clean overlays
- The world breathes and flows in characters

**Layer 3 — HUD: EVA/NERV Command Aesthetic (clean overlay)**
- Clean geometric panels floating over the churning ASCII world
- The contrast between messy dithered spacetime and crisp UI is the aesthetic
- Background: deep navy (#000053) / black
- Nominal: green (#58F2A5)
- Warning: orange (#F0903A)
- Critical: red (#E81900)
- Data: blue (#54A2D4)
- Bold serif font for warnings ("SIGNAL DETECTED", "PORTAL EVAPORATING")
- Monospace/sans-serif for data readouts
- Flickering, overlapping, "believed not read" — UI creates stress
- Scan lines, hexagonal accents, pulsing indicators

---

## Procedural Generation

### "Vines on Iron Trellis" (Qud approach)
- **Handcrafted:** Core mechanics, entity behaviors, upgrade tree structure, portal mechanics
- **Generated:** Universe layouts, wreck names/histories, loot tables, entity placement, civilization death logs

### Wreck Generation
Each wreck has:
- Generated civilization name
- Generated cause of death (dimensional collapse, Inhibitor contact, internal war, entropy)
- Age (millions to billions of years)
- Loot table weighted by civilization type and cause of death
- Optional: readable logs/inscriptions (flavor text fragments)

Example: *"Wreck of the Ascending Chorus — collapsed attempting dimensional transit — 4.7 billion years dormant"*

---

## Between-Run Progression (Stub)

Currencies and systems TBD. Structural placeholders:

- **Exotic Matter** — primary currency from scavenging
- **Signal Echoes** — knowledge currency, unlocks map intel for future runs
- **Mutation Exposure** — passive accumulation from proximity to exotic physics
- Ship modifications (thrust, hull, sensors, signal dampening)
- Mutations (Qud-style: arrive with them, don't grind for them)
- Meta-knowledge (portal frequency patterns, entity behaviors, wreck locations)

---

## Tech Stack (Planned)

- **Renderer:** WebGL (raw or Pixi.js — TBD based on fluid sim integration needs)
- **Fluid Sim:** Fork of [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) adapted for gameplay
- **Gravity Visualization:** Vertex shader grid distortion + particle field
- **Game Logic:** Vanilla JS (no framework — jam speed)
- **Build:** Vite or none (single HTML file if possible)
- **Deploy:** Static hosting (GitHub Pages, Netlify, or itch.io)

---

## Open Questions

### Gameplay
- [x] How does loot pickup work mechanically? **Fly-over for v1.** Tractor beam and docking as future mechanics.
- [x] Fuel as a resource? **Free thrust for v1.** Fuel as a future tuning axis.
- [ ] Can you damage/destroy other scavengers? Or is combat purely avoidance?
- [ ] What happens at the moment of extraction? Cinematic? Instant? Do you have to hold position on the portal while it charges?
- [x] How big is a "universe"? **Small scrollable area (few screens square) for prototype.** Eventually large — offscreen threats and limited visibility are core tension. Tuning axes: visibility range, scanning distance.
- [x] Camera? **Follow-cam centered on ship, with viewport into larger universe.**

### Visual
- [x] ASCII characters for entities or geometric/particle-based? **ASCII dithering for the world. Ship and key interactive elements as clean overlays for readability.**
- [ ] How much screen real estate does the HUD take? EVA UIs are dense — but gameplay needs visibility
- [ ] Day/night or brightness variation within a run? Or consistently dark?

### Technical
- [ ] Fluid sim resolution vs performance — how dense can the simulation grid be while maintaining 60fps with game logic on top?
- [ ] Fluid sim as gameplay: reading velocity at ship position is straightforward. But what about fluid-entity interaction (wrecks blocking flow, portals as drains)?
- [ ] Sound design — even placeholder. What does spacetime sound like? Low drones, gravitational wave audio translations?
- [ ] Mobile support? Touch controls? Or desktop-only for jam?

### Scope
- [ ] What's the minimum viable "run"? Ship + fluid + one black hole + one wreck + one portal + one threat?
- [ ] AI scavenger complexity — pathfinding through fluid? Or simpler (waypoint-based, fluid-aware velocity adjustment)?
- [ ] How many entity types for v1? Minimum: 1 scavenger type, 1 fauna type, 1 Inhibitor type?
