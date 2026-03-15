# Last Black Hole — Design Deep Dive

> Companion to DESIGN.md. Detailed technical design for each system, informed by research into fluid sims, rendering, AI, and UI. No code — implementation starts Monday.

---

## 1. Fluid Simulation Architecture

### Physics Architecture: Parallel Experiments

> **Status:** Two approaches will be built in parallel Monday night (see DECISION-LOG.md, Pillar 6: Run It Twice). Compare Tuesday morning, merge if complementary, pick the winner if not.

**Approach A: Single Fluid Sim + Oscillating Force Injection** (Forge's recommendation)
- Navier-Stokes only. Fake waves through periodic force patterns from gravity wells.
- Based on Jos Stam's "Stable Fluids" (GPU Gems Chapter 38) / PavelDoGreat fork
- Runs on a 256×256 grid for the prototype (tunable)
- Operations per step: advection → diffusion → force injection → pressure solve (Jacobi iteration, 20-40 steps) → divergence correction
- Ship reads velocity at its position and adds it to its own velocity vector
- Waves are created by oscillating the force injection amplitude at well locations — simpler, proven, shippable

**Approach B: Dual Solver** (deep dive design)
- Navier-Stokes (local physics) + wave equation solver (gravity wave propagation) on separate grids, coupled
- Wave equation: `u(t+1) = 2*u(t) - u(t-1) + c²*∇²u(t) - damping*u(t)`
- Wave amplitude feeds into the fluid sim as a force multiplier — where waves crest, fluid velocity increases
- Physically accurate surfing. Research-level complexity.

**Why run both:**
- Pure Navier-Stokes may not naturally produce the long-range propagating waves we need for surfing — or it might, if the force injection is tuned right
- The dual solver is more physically accurate but may be overbuilt for a jam
- Agent compute is cheap. Design regret is expensive. (Pillar 6)
- Both get built Monday night, compared Tuesday morning

### Gravity Well Implementation

Black holes inject force into both systems:

**Into the fluid:**
- Radial force toward center: `F = G * mass / r²` (clamped to prevent infinity)
- Creates persistent inward flow — the "drain" effect
- Accretion disk forms naturally as angular momentum prevents direct infall
- Multiple wells create complex flow patterns at interference boundaries

**Into the wave equation:**
- Periodic perturbation at well location: `source(t) = amplitude * sin(frequency * t)`
- Amplitude scales with black hole mass (bigger = stronger waves)
- Frequency decreases with mass (bigger = slower, more powerful waves)
- When two wells merge, a massive wave burst propagates outward — the "merger shockwave"

### Spatially-Varying Parameters (Spacetime Scars)

Instead of uniform viscosity/damping across the map, use parameter textures:

- **Viscosity texture** — regions of thick/thin spacetime. Wrecks of dead civilizations might leave viscous patches. Black holes increase local viscosity as spacetime degrades
- **Damping texture** — controls how quickly waves decay. Near Inhibitor spawn points, damping drops to zero (waves ring forever, creating visual chaos)
- **Temperature/energy texture** — drives color in the ASCII renderer. Near wells: hot (amber/red). Deep void: cold (blue/purple)

These textures start clean and degrade over the run, encoding the "universe dying" without a timer.

### Object-Fluid Coupling

**Ship → Fluid:**
- Thrust injects force into the fluid at ship position (small radial push)
- Creates a wake behind the ship — visible in the ASCII render as disturbed characters
- Higher thrust = more force injection = more signal (gameplay consequence)

**Fluid → Ship:**
- Ship velocity = thrust velocity + fluid velocity at position (sampled bilinearly)
- Near wells: fluid velocity is strongly inward, requiring thrust to counteract
- In wave crests: fluid velocity is high in wave direction — surfing!

**Wrecks → Fluid:**
- Static obstacles that deflect flow (boundary conditions in the pressure solve)
- Creates interesting eddies and sheltered zones behind wrecks
- Gameplay: you can hide in a wreck's wake to reduce signal while the current flows around you

**Portals → Fluid:**
- Act as sinks — fluid drains into them (like small gravity wells but with a sharp cutoff radius)
- Visual: swirling vortex pattern in the ASCII around active portals
- When a portal evaporates, the sink disappears and fluid rebounds outward — a visible shockwave marks the loss

---

## 2. ASCII Dithering Renderer

### Recommended Starting Point

`pmndrs/postprocessing` ASCIIEffect — production-ready WebGL ASCII shader. Key files: `ASCIIEffect.js`, `ascii.frag`, `ASCIITexture.js`. The approach: pixelate UVs into cells, sample luminance, index into a glyph atlas texture, multiply by scene color. Single fullscreen quad draw call. Easily 60fps.

**Nobody has combined WebGL fluid sim + WebGL ASCII shader in a browser game before.** This is novel.

### 4-Pass GPU Pipeline

```
Pass 1: Fluid sim (advect, diffuse, project)        → fluid FBO (512×512)
Pass 2: Render fluid density/velocity as color       → scene FBO (full res)
Pass 3: Feedback blend with previous frame (trails)  → feedback FBO
Pass 4: ASCII post-process (cell → atlas lookup)     → screen
```

Total: ~3-5ms per frame. Well within 16ms budget for 60fps even on integrated GPUs.

### Font Atlas Generation

- Rasterize all glyphs onto a 1024×1024 canvas using 2D context (white on transparent)
- 16×16 grid = 64×64px per glyph cell, 256 character slots
- Upload once to GPU as a texture — the GPU doesn't care what the glyphs look like
- Simple geometric shapes (blocks, braille) rasterize more crisply at small sizes than complex curves
- Characters sorted by visual weight so luminance → index is a direct mapping

### Character Cell Grid

- Screen divided into cells (e.g., 8×12 pixels each for a readable monospace character)
- At 1920×1080: ~240×90 character grid
- Each cell samples the fluid sim at its center point
- Multiple data channels sampled: density, velocity (x,y), pressure, energy

### Density-to-Character Mapping

Two-axis lookup — **density** selects weight, **velocity direction** selects shape:

**Density ramp (sparse → dense):**
```
. · : ; = + * # % @ █
```

**Braille characters** (U+2800-U+28FF) — sleeper option:
```
⠁ ⠃ ⠇ ⠏ ⠟ ⠿ ⣿
```
256 patterns available, each a 2×4 dot grid = 8 sub-pixels per cell for quasi-dithering. Highest visual fidelity for smooth fluid density. Could use braille for the fluid layer and traditional ASCII for entity overlays.

**Directional variants:**
| Direction | Characters |
|-----------|-----------|
| Horizontal flow (|vx| > |vy|) | `- ~ = ═ ≡` |
| Vertical flow (|vy| > |vx|) | `\| ! ‖ ║` |
| Diagonal (↗↙) | `/ ╱` |
| Diagonal (↘↖) | `\ ╲` |
| Turbulent (high curl) | `+ * × ※ ⊕` |
| Stagnant (low velocity) | `. · ° ○` |
| Very high energy | `# @ █ ▓ ▒` |

**Implementation:** Font texture atlas with all glyphs packed in a grid. Shader samples atlas UV based on (density_index, direction_index). Single texture lookup per cell.

### Color System (OKLCH-Inspired)

Temperature/energy texture drives hue, density drives lightness:

| Zone | Hue Range | Lightness | Saturation |
|------|-----------|-----------|------------|
| Deep void | 250-270° (blue-purple) | 0.15-0.25 | 0.3-0.5 |
| Normal space | 200-220° (teal) | 0.3-0.45 | 0.4-0.6 |
| Warm radiation | 30-50° (amber) | 0.5-0.65 | 0.6-0.8 |
| Hot (near well) | 10-25° (red-orange) | 0.6-0.75 | 0.7-0.9 |
| Portal glow | 150-170° (cyan-green) | 0.6-0.8 | 0.8-1.0 |
| Inhibitor | 300-330° (magenta) | 0.4-0.7 | 0.9-1.0 |

Colors computed in shader, converted to RGB for output. Smooth transitions via lerp between zones.

### Temporal Effects

**Motion trails (feedback buffer):**
- Previous frame's ASCII output blended with current at 85-95% decay
- Moving objects leave fading character trails
- Black holes accumulate persistent character density (they "burn in")
- Adjustable per-pixel: faster decay in calm areas, slower near energy sources

**Flicker/noise:**
- Random character substitution at low probability (0.5-2% per frame)
- Increases near Inhibitors (up to 15-20%)
- Creates the "signal noise" effect without any special rendering
- Some cells randomly shift to a wrong character for 1-3 frames

### Multi-Grid Layering

Three character grids at different scales, composited:

1. **Fine grid** (8×12 cells) — primary rendering, shows fluid detail
2. **Medium grid** (16×24 cells) — shows large-scale flow patterns, lower opacity
3. **Coarse grid** (32×48 cells) — shows gravity well structure, very low opacity

Composited with alpha: fine at 100%, medium at 20%, coarse at 10%. Creates depth without actual 3D.

---

## 3. Entity Rendering & IFF (Identification Friend or Foe)

### The Readability Problem

Everything is ASCII characters. How do you distinguish a wreck from a wave from a ship? Triple-redundant identification:

### Shape Language

| Entity | Shape | ASCII Cluster |
|--------|-------|---------------|
| **Player ship** | Clean geometric — NOT ASCII. Small triangle/chevron rendered as a sprite overlay | `▶` or actual geometry |
| **Scavenger** | Diamond/rhombus cluster | `◇ ◈` or `<>` pattern |
| **Wreck** | Dense rectangular block | `[####]` or `{===}` patterns |
| **Portal** | Circular/ring | `(○)` or rotating ring of chars |
| **Fauna** | Organic/amorphous | `~∽≈` shifting blob |
| **Inhibitor** | WRONG — glitch, Unicode that doesn't belong | `Ψ Ω ∞ ⌁ ☠` flickering |
| **Black hole** | Absence — the negative space IS the entity | Empty center, dense ring |

### Color Assignment

Strict color ownership — no sharing:

| Entity | Color | Hex |
|--------|-------|-----|
| Player | Bright white/silver | `#E8E8E8` |
| Scavenger (passive) | Yellow-green | `#A8D86E` |
| Scavenger (hostile) | Orange | `#F0903A` |
| Wreck (unlooted) | Gold/amber | `#D4A843` |
| Wreck (looted) | Dim gray | `#555555` |
| Portal (active) | Cyan-green | `#58F2A5` |
| Portal (dying) | Flickering cyan → red | transition |
| Fauna | Pale blue-white | `#B8D4E8` |
| Inhibitor | Magenta/wrong-pink | `#FF2D7B` |
| Black hole ring | Red-shift amber | `#FF6B35` |

### Animation Signatures

Each entity type has a unique motion pattern:

- **Player**: responsive, follows input (duh)
- **Scavengers**: smooth pathing with occasional course corrections
- **Wrecks**: static but shimmer slightly (character substitution at 1-2 Hz)
- **Portals**: pulsing size oscillation (breathe in/out every 2-3 seconds), accelerates when dying
- **Fauna**: erratic, twitchy movement with sudden direction changes
- **Inhibitors**: unnaturally smooth, constant velocity, no acceleration/deceleration — they don't obey physics
- **Black holes**: the ring characters rotate slowly, always

### Foreground/Background Separation

Entities must pop against the fluid background:

1. **Local dimming**: ASCII cells within N cells of an entity reduce to 30-50% brightness
2. **Reserved color space**: entity colors are never used by the fluid renderer (no amber wrecks lost in amber radiation zones — radiation is red-orange, wrecks are gold)
3. **Glow/bloom**: entities emit a 2-3 cell halo of their signature color at low opacity
4. **Z-order**: entities always render on top of fluid characters, never behind

---

## 4. NERV/EVA HUD Architecture

### DOM-over-Canvas Compositing

The HUD is NOT rendered in WebGL. It's HTML/CSS overlaid on the canvas:

```
┌────────────────────────────────────────┐
│  HTML layer (HUD, warnings, panels)    │ ← z-index: 10+
│  ┌──────────────────────────────────┐  │
│  │  Canvas (WebGL)                  │  │ ← z-index: 1
│  │  - Fluid sim                     │  │
│  │  - ASCII renderer                │  │
│  │  - Entity overlays               │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Why DOM instead of in-shader HUD:**
- CSS animations are free (GPU-composited, don't touch the WebGL pipeline)
- Text rendering quality — WebGL text is painful, DOM text is perfect
- Easier to iterate on layout during jam
- CRT effects via CSS filters on the HUD container
- `mix-blend-mode` for that scan-line interference look

### nerv-ui Integration

[TheGreatGildo/nerv-ui](https://github.com/TheGreatGildo/nerv-ui) provides the base CSS:
- Color palette already defined (near-match for our scheme)
- CRT screen effect (scan lines, vignette, chromatic aberration)
- Panel styling with hexagonal accents
- Font recommendations (we'll use free alternatives)

**Font stack:**
- Headers/warnings: `Chakra Petch` (free, geometric, EVA-adjacent) or `Orbitron`
- Data readouts: `JetBrains Mono` or `IBM Plex Mono`
- Critical alerts: `bold + uppercase + letter-spacing: 0.2em`

### HUD Layout

```
┌─────────────────────────────────────────────────────┐
│ ┌─SIGNAL──────┐                    ┌─PORTALS────┐  │
│ │ ████░░░░░░  │                    │ ◉ 3 ACTIVE │  │
│ │ 34% ▲       │                    │ ← 240m NE  │  │
│ └─────────────┘                    └────────────┘  │
│                                                     │
│                    [GAME WORLD]                      │
│                                                     │
│ ┌─HULL────────┐                    ┌─INVENTORY──┐  │
│ │ ████████░░  │                    │ 3 items    │  │
│ │ 78%         │                    │ [collapse] │  │
│ └─────────────┘                    └────────────┘  │
│                                                     │
│          ┌─────────────────────────────┐            │
│          │ ⚠ SIGNAL DETECTED — SECTOR 7│            │
│          └─────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

**Corner panels** — persistent, small footprint:
- Top-left: Signal meter (bar + percentage + trend arrow)
- Top-right: Portal status (count + nearest direction + distance)
- Bottom-left: Hull integrity (bar + percentage)
- Bottom-right: Inventory (count + collapsible list)

**Center warnings** — transient, attention-grabbing:
- Fade in over 0.3s, hold 2-3s, fade out
- Stack if multiple active
- Color-coded: green (info) → orange (warning) → red (critical)
- Bold serif, uppercase, letter-spacing
- Examples:
  - `SIGNAL DETECTED` (orange)
  - `PORTAL EVAPORATING` (red, with countdown)
  - `INHIBITOR ACTIVE` (red, with scan-line distortion on the entire HUD)
  - `WRECK SCANNED` (green)
  - `EXTRACTION AVAILABLE` (cyan)

### HUD Degradation

As the universe dies, the HUD degrades:

1. **Hawking radiation phase**: Occasional flicker. Random panels briefly show wrong values. Scan line intensity increases.
2. **Inhibitor active**: Panels jitter position by 1-3px. False readings flash briefly. Color bleeds between panels.
3. **Critical collapse**: Major glitching. Panels overlap, duplicate, show garbage characters. The HUD itself becomes unreliable — you must rely on the game world directly.

Implemented via CSS: `transform: translate(random, random)`, `opacity` flicker, `clip-path` corruption, `filter: hue-rotate()` on random panels.

---

## 5. Universe Generation & Match Flow

### Generation Parameters

Each run generates a universe with:

| Element | Count | Placement Rule |
|---------|-------|---------------|
| Central black hole | 1 | Map center ± 15% offset |
| Satellite black holes | 2-4 | Orbit at 40-70% map radius, evenly spaced with jitter |
| Wrecks | 15-25 | Clustered in 3-5 "civilization zones" between wells. Dense near but not inside danger radius |
| Portals | 3-5 | Map edges and midpoints. Never within 30% radius of a well at spawn |
| AI Scavengers | 3-6 | Staggered entry — 2 at start, rest appear at 30s intervals |
| Fauna spawners | 3-5 | Near wreck clusters (they're territorial) |

### Wreck Tiers

| Tier | Frequency | Loot Quality | Signal Cost | Location |
|------|-----------|-------------|-------------|----------|
| **Surface** | 60% | Common parts, low value | Low | Easy to reach, safe zones |
| **Deep** | 30% | Rare components, moderate value | Medium | Closer to wells, harder navigation |
| **Core** | 10% | Exotic matter, high value | High | Near well danger zones, requires skill to reach and escape |

### 10-Minute Match Timeline

Target run length: 8-12 minutes. Escalation curve:

```
0:00-2:00   EXPLORATION
├── All portals active
├── Wells at base strength
├── Fluid is responsive, fast
├── 2 passive scavengers roaming
├── Fauna idle near wrecks
└── Signal threshold: far away

2:00-4:00   ESCALATION
├── First portal evaporates (random)
├── Wells begin growing (1% mass/10s)
├── Scavenger #3 enters
├── Fauna activate if player signal > 20%
├── Viscosity begins increasing (+5%/min)
└── Wave amplitude grows with well mass

4:00-6:00   TENSION
├── Second portal gone (or used by scavenger)
├── Wells noticeably stronger — visible flow distortion
├── Scavenger #4-5 enter (some aggressive)
├── Fauna swarms form near high-signal areas
├── Two satellite wells may begin merging (if close enough)
├── Signal threshold approachable
└── HUD shows first flickers

6:00-8:00   CRISIS
├── 1-2 portals remain
├── Wells have doubled in strength
├── Merger events possible — massive wave bursts
├── Aggressive scavengers hunting player
├── Fluid thick — controls feel heavy
├── Signal threshold danger zone
└── Inhibitor may wake if player was noisy

8:00-10:00  COLLAPSE
├── Last portal flickering
├── Wells dominating the map — most space is danger zone
├── Fluid nearly solid — movement is a struggle
├── If Inhibitor active: hunting
├── Extract NOW or die
└── HUD severely degraded
```

### Scavenger AI

**Personality types** (assigned at spawn):
- **Cautious** (40%): Loots surface wrecks, avoids wells, extracts early via nearest portal
- **Greedy** (30%): Targets deep wrecks, stays longer, may fight player for contested loot
- **Aggressive** (20%): Hunts player if player has valuable loot, fights for portals
- **Desperate** (10%): Erratic, rushes core wrecks near wells, high risk tolerance

**Behavior state machine:**
```
ENTER → SCAN → NAVIGATE → LOOT → EVALUATE → EXTRACT
  ↑                                    ↓
  └──────────── FLEE ←─────── THREAT ←─┘
```

**Fluid-aware pathfinding:**
- Scavengers don't pathfind on a grid — they read fluid velocity like the player
- They prefer to ride currents when moving between targets
- They avoid swimming directly against strong currents (too slow, too much signal)
- Near wells, they follow orbital paths rather than straight lines
- Implementation: weighted waypoint system where waypoint attractiveness factors in current-alignment

**Portal competition:**
- Scavengers evaluate: "Is a portal reachable before it evaporates?"
- They race for portals when portal count drops to 2
- A scavenger entering a portal triggers a flash + the portal disappears
- Creates organic time pressure: "That scavenger is heading for MY portal"

### Fauna Types

| Type | Behavior | Threat Level | Spawn |
|------|----------|-------------|-------|
| **Drift Jellies** | Float with currents, passive. Damage on contact. Bioluminescent (character glow) | Low — avoid them | Spawn in deep void, drift with fluid |
| **Signal Moths** | Attracted to signal sources. Swarm. Each one adds minor signal to your footprint | Medium — they amplify your signal | Spawn near wrecks when signal > 15% |
| **Rift Eels** | Patrol along gravity gradients. Fast, territorial. Attack if you enter their patrol zone | High — dangerous solo, lethal in groups | Spawn along well orbital paths |

### Inhibitor Mechanics

**Threshold system:**
- Global signal level tracked (sum of all signal sources: player, scavengers, fauna)
- Player's contribution weighted 3x (you're the main character)
- Threshold at approximately 70% — exact value randomized ±10% per run (hidden)
- Once crossed: irreversible. 5-second warning (HUD distortion, audio cue) before spawn

**Hunting behavior:**
- Spawns at map edge farthest from player
- Moves toward player's last known signal position (not current position!)
- Speed: 1.5x player maximum thrust speed (you cannot outrun it with thrust alone)
- Ignores fluid physics — moves in straight lines, phases through obstacles
- Updates target every 3 seconds based on accumulated signal since last update
- **Countermeasure**: stop thrusting, drift silently. If your signal drops to near-zero for 5+ seconds, the Inhibitor pauses and searches in a pattern around last known position
- It NEVER gives up. It NEVER leaves. But it can be evaded through discipline.

**The hiding mechanic:**
- Near a wreck: your signal is partially masked (wreck's own residual signature provides cover)
- Drifting with the current: lower signal than thrusting against it
- In a well's accretion disk: your signal is drowned out by the well's radiation (but you're in a death spiral)
- Trade-offs everywhere: the safest hiding spots are the most dangerous places

---

## 6. Sound Design Direction

No implementation, but establishing the aesthetic:

### Ambient Layer
- **Base drone**: low-frequency oscillator, always present. Pitch drops as universe degrades.
- **Wave audio**: fluid velocity mapped to filtered noise. Fast currents = higher harmonics.
- **Well hum**: each black hole emits a tone proportional to its mass. Multiple wells create chords that shift as they grow.

### Event Sounds
- **Thrust**: white noise burst, filtered by direction
- **Loot pickup**: crystalline chime, Caves of Qud style
- **Portal evaporation**: descending tone + static burst
- **Scavenger nearby**: distant engine hum, Doppler-shifted
- **Fauna contact**: organic crunch/squelch
- **Signal threshold warning**: rising sinusoidal alarm
- **Inhibitor wake**: all audio inverts/distorts for 2 seconds, then returns with a new persistent high-frequency tone (tinnitus effect)
- **Merger shockwave**: deep bass impact that distorts all other audio for 1-2 seconds

### Implementation Notes
- Web Audio API for synthesis (no sample files needed for prototype)
- Tone.js if we need more structure
- All procedural — no pre-recorded assets needed for v1

---

## 7. Camera & Viewport

### Follow Camera
- Centered on ship, smooth follow with slight lag (lerp factor 0.08-0.12)
- Look-ahead: camera leads slightly in thrust direction (ship not exactly centered)
- Zoom: fixed for v1. Stretch goal: zoom out when near wells, zoom in when in tight spaces.

### Viewport into Larger Universe
- Game world is larger than screen (2-4x in each dimension for prototype)
- Off-screen threats indicated by edge markers (colored pips at screen edge showing direction to nearest portal, scavenger, Inhibitor)
- Minimap: stretch goal. The HUD portal indicator serves as a minimal version.

### Screen Shake
- Black hole mergers: large, slow shake (2-3 cycles over 1 second)
- Fauna contact: short, sharp shake
- Inhibitor proximity: continuous low-amplitude vibration that increases as it gets closer

---

## 8. Open Design Decisions (For Monday)

These need to be resolved by playing with the prototype:

1. **Fluid sim resolution**: 256×256 target. Need to verify 60fps with ASCII post-process on mid-range hardware. If too slow: drop to 128×128 (still looks good through ASCII dithering since cells are coarser than fluid pixels).

2. **Character cell size**: 8×12 feels right for readability vs density. Smaller (6×8) = more detail, harder to read. Larger (10×16) = easier to read, less fluid detail. Test on Monday.

3. **Wave-fluid coupling strength**: How much do gravity waves affect local fluid velocity? Too little = waves are cosmetic. Too much = movement is chaotic. This is the primary tuning axis for "does surfing feel good?"

4. **Signal decay rate**: Fast decay = forgiving, patient play is easy. Slow decay = every action has lasting consequences. Probably want slow decay to force the push-your-luck tension.

5. **Inhibitor speed vs player speed**: 1.5x is a starting point. If too easy to evade: 2x. If impossible: 1.2x. The Inhibitor should feel inevitable but not instant.

6. **Wreck loot time**: Instant fly-over for v1. But should there be a brief hover time (0.5s)? Forces you to slow down near wrecks, increasing signal and vulnerability. Might add interesting risk.

7. **Portal charge time**: Do you fly through instantly, or do you have to hold position for 2-3 seconds while a charge animation plays? The hold mechanic adds tension but might feel frustrating. Test it.

---

## 9. Ambition Targets (Swing for the Fences)

Things that would make this exceptional if we nail them:

1. **The fluid sim IS the game** — if moving through the fluid feels as good as skating in Titanfall or swinging in Spider-Man, everything else is gravy. This is the bet.

2. **The Inhibitor as a horror mechanic** — the transition from exploration to terror should be a felt moment. Audio inversion, HUD corruption, the music changing. You should feel dread.

3. **The ASCII aesthetic as a statement** — not retro for retro's sake. The characters ARE the physics. Density is visible. Flow is readable. The rendering is the gameplay feedback.

4. **A run that tells a story** — the procedural names, the civilization death logs, the wreck flavour text. Each run should feel like exploring a unique dead universe, not just a random level.

5. **The "one more run" loop** — extraction success should feel earned. Death should feel like "I almost had it." The between-run progression (even minimal) should make you want to go again.
