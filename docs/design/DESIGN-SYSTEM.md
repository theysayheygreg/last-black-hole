# LBH Design System

> Machine-readable design tokens and visual contracts for AI agents building UI, shaders, and HUD elements.
> This is the source of truth for how LBH looks, sounds, and feels at the implementation level.

---

## 1. Visual Theme & Atmosphere

LBH is an ASCII-dithered space extraction game rendered through a GPU fluid simulation. Every pixel passes through a character-mapped display shader that converts fluid density and velocity into directional ASCII glyphs. The result is a living, breathing text-art universe — not retro pastiche, but a modern rendering technique that makes the fluid sim legible as cosmic terrain.

The palette is dominated by void black, accretion gold, and teal flow currents. Color enters through physical simulation — gravity wells glow gold-to-white-hot, radiation sources clear dark bubbles, and portals spiral in cool violet. The Inhibitor system bleeds magenta-cyan corruption across the field.

**Key Characteristics:**
- ASCII shader is core identity, not decoration — Art Is Product (Pillar 1)
- All color comes from simulation, never from decoration
- Void is `[0.0, 0.0, 0.13]` — deep blue-black, not pure black
- Accretion: gold `[1.0, 0.85, 0.4]` → white-hot `[1.0, 0.95, 0.8]` (85° hue gap from inhibitor magenta)
- Teal fluid base `[0.0, 0.5, 0.5]` — the color of "normal space"
- Glitch corruption: magenta `[0.8, 0.1, 0.5]` + cyan `[0.1, 0.8, 0.7]`
- HUD overlays use deep blue-black panels `rgba(0, 2, 12, 0.6)` — never veil the simulation underneath

---

## 2. Color Palette & Roles

### Simulation Colors (RGB normalized)
| Role | Value | Hex Approx | Usage |
|------|-------|-----------|-------|
| **Void** | `[0.0, 0.0, 0.13]` | `#000021` | Empty space, background |
| **Fluid Base (Teal)** | `[0.0, 0.5, 0.5]` | `#008080` | Normal spacetime fabric |
| **Near Well (Gold)** | `[1.0, 0.85, 0.4]` | `#FFD966` | Accretion zone warmth |
| **Hot Well (White-hot)** | `[1.0, 0.95, 0.8]` | `#FFF2CC` | Inner ring danger |
| **Star Core** | bright 0.2 | — | Radiation source center |
| **Wreck Glow** | `[0.04, 0.03, 0.01]` | — | Subtle gold density |
| **Vault Glow** | `[0.06, 0.05, 0.02]` | — | 5× brighter gold (high-value loot) |
| **Glitch Magenta** | `[0.8, 0.1, 0.5]` | `#CC1A80` | Inhibitor corruption |
| **Glitch Cyan** | `[0.1, 0.8, 0.7]` | `#1ACCB3` | Inhibitor secondary |
| **Glitch White** | `[0.9, 0.9, 0.9]` | `#E6E6E6` | Corruption highlight |

### HUD Colors (rgba)
| Role | Value | Usage |
|------|-------|-------|
| **Timer (normal)** | `rgba(150, 170, 200, 0.7)` | Collapse countdown |
| **Timer (warning)** | `rgba(240, 144, 58, 0.9)` | <60s remaining |
| **Timer (critical)** | `rgba(232, 25, 0, 0.9)` | <30s remaining |
| **Portal Count** | `rgba(180, 120, 255, 0.8)` | Exit indicator |
| **Salvage Count** | `rgba(212, 168, 67, 0.8)` | Cargo indicator |
| **Signal Meter** | `rgba(80, 200, 180, 0.85)` | Signal level bar |
| **Panel Background** | `rgba(0, 2, 12, 0.6)` | HUD card fill |
| **Panel Border** | `rgba(80, 100, 140, 0.2)` | Subtle accent edge |

---

## 3. Typography Rules

### Font Family
- **Primary**: `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`
- **ASCII Shader**: System monospace rendered to atlas at 85% cell size (64×64px per glyph, 1024×1024 atlas)

### Hierarchy
| Role | Size | Weight | Style | Notes |
|------|------|--------|-------|-------|
| Timer | 16px | 400 | normal | Top-left, always visible |
| Panel text | 13px | 400 | normal | HUD cards, counts |
| Label | 9px | 400 | uppercase | Letter-spacing 0.15em |
| Warning | 16px | 600 | normal | Center screen, transient |
| Menu title | 24px | 600 | ALLCAPS | Title screen only |
| Menu body | 14px | 400 | lowercase | Everything else lowercase |

### Principles
- **Monospace only** — the ASCII shader is the game's identity; UI type should feel like the same instrument
- **ALLCAPS for titles only** — lowercase everything else. No shouting.
- **Glow, not weight** — emphasis via `text-shadow: 0 0 6px currentColor`, not bold weight
- **No overlay veils** — text sits on transparent or near-transparent panels, never obscures the simulation

---

## 4. Component Stylings

### HUD Panels
- **Background**: `rgba(0, 2, 12, 0.6)` — translucent deep blue-black
- **Border**: `1px solid rgba(80, 100, 140, 0.2)`
- **Radius**: 2px
- **Padding**: 8px 12px
- **Shadow**: none (panels float via transparency, not elevation)

### Signal Meter
- **Width**: 120px
- **Height**: 4px
- **Fill**: zone-colored (ghost=dim, scout=teal, beacon=amber, flare=orange, broadcast=red, threshold=white)
- **Position**: below collapse timer, top-left

### Warning Messages
- **Position**: center screen
- **Fade in**: 0.3s (opacity 0→1, scale 0.95→1.0)
- **Hold**: 2500ms
- **Fade out**: 0.5s (opacity 1→0, scale 1.0→1.02)
- **Text shadow**: glow matches warning severity color

### Menu / Title Screen
- **Void center**: ~60% of screen area
- **No decorative overlays** on the fluid sim background
- **Buttons**: monospace text, minimal chrome, glow on hover

---

## 5. Layout Principles

### Spacing System
- **Base unit**: 8px
- **Scale**: 4, 8, 12, 16, 24, 32, 48px
- **HUD margins**: 16px from screen edge

### HUD Placement
| Position | Element |
|----------|---------|
| Top-left | Collapse timer (mm:ss) |
| Below timer | Signal meter + zone indicator |
| Top-right | Portal count (◉ N exits) |
| Bottom-left | Salvage count (◈ N salvage) |
| Center | Warning messages (transient) |
| Bottom-center | Hull abilities (keybinding indicators) |

### Whitespace Philosophy
The simulation IS the content. HUD elements are annotation, not interface. They exist at the edges and fade when not needed. The center of the screen belongs to the fluid sim — never stack UI over the player's movement space.

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| **Simulation** | Full-screen, always behind | The game world |
| **HUD panels** | `rgba(0, 2, 12, 0.6)` translucent | Score, timer, indicators |
| **Warnings** | Centered, scaled, glow shadow | Transient alerts |
| **Menus** | Over simulation, minimal chrome | Title, map select, results |
| **Glitch overlay** | `u_glitchIntensity` 0→1 shader uniform | Dimensional tear transition |

**Depth Philosophy:** There are only two visual layers — the simulation and the annotations on top of it. The ASCII shader is not a filter applied to a "real" game underneath; it IS the rendering. Depth comes from simulation density and color, not from UI layering.

---

## 7. Do's and Don'ts

### Do
- Use monospace for all text — `'JetBrains Mono'` stack
- Let simulation color be the primary visual signal
- Use `text-shadow` glow for emphasis, not font-weight
- Keep HUD at screen edges, center belongs to gameplay
- Use ALLCAPS only for titles; lowercase body text
- Match accretion gold `[1.0, 0.85, 0.4]` for positive indicators (loot, portals)
- Match inhibitor magenta `[0.8, 0.1, 0.5]` for threat indicators
- Use `rgba(0, 2, 12, 0.6)` for any panel background

### Don't
- Don't put decorative overlays or veils over the fluid sim
- Don't use sans-serif or serif fonts — monospace only
- Don't use pure black `#000000` — void is `#000021`
- Don't use cool blue for "safe" — teal `#008080` is the base, blue is neutral/dim
- Don't bold text above weight 600
- Don't stack multiple UI layers — the game has two layers: simulation and HUD
- Don't use border-radius above 4px — this is precision machinery, not soft UI
- Don't animate HUD elements continuously — animation is for warnings and transitions only

---

## 8. Animation & Juice

### Scene Transitions (Dimensional Tear)
The signature transition: ASCII characters progressively corrupt into glitch noise, the scene swaps invisibly at peak corruption, then resolves into the new scene.

| Phase | Duration | Behavior |
|-------|----------|----------|
| **Ramp up** | 0.6s | `u_glitchIntensity` 0.0 → 1.0. Characters randomly replaced with glitch glyphs. Probability increases with intensity. |
| **Hold** | 0.25s | Full corruption — scene is invisible. Scene swap fires here. |
| **Ramp down** | 0.6s | `u_glitchIntensity` 1.0 → 0.0. New scene resolves from noise. |
| **Total** | 1.45s | |

- Glitch character selection: random index into full ASCII ramp
- Glitch colors: magenta `[0.8, 0.1, 0.5]`, cyan `[0.1, 0.8, 0.7]`, white `[0.9, 0.9, 0.9]` — random per cell per frame
- Brightness: `0.5 + 0.5 × glitchIntensity` (glitch is always visible, even against black)
- Noise seed: `sin(dot(cellIndex + floor(time × 30.0) × 0.37, vec2(43.23, 71.97))) × 43758.5453`

### HUD Animations

**Warning Messages**
| Phase | Duration | Easing | Properties |
|-------|----------|--------|------------|
| Fade in | 0.3s | ease-out | opacity 0→1, scale 0.95→1.0 |
| Hold | 2500ms | — | Static |
| Fade out | 0.5s | ease-in | opacity 1→0, scale 1.0→1.02 |

**Timer Color Transitions**
- Normal → warning: instant swap at 60s remaining
- Warning → critical: instant swap at 30s remaining
- No smooth transitions — hard cuts match the urgency

**Signal Meter**
- Fill width lerps smoothly to target (CSS transition or per-frame lerp)
- Zone color changes are instant — no blending between zone colors

### Simulation Juice

**ASCII Shimmer**
- `u_shimmer`: 3.0 (probability weight for character flicker)
- Characters randomly shift ±1 in the ramp each frame based on noise
- Dead areas (shimmer 0) = static. Active areas (shimmer 6) = constant flicker.
- Creates "breathing" texture in the fluid — the space itself seems alive

**Directional Character Emergence**
- Below `u_dirThreshold` (0.01 world-units velocity): isotropic characters (row 0)
- Above threshold: directional characters emerge probabilistically from shimmer noise
- Transition is stochastic, not smooth — characters flicker between isotropic and directional near the threshold

**Accretion Ring Rotation**
- Spin rate: 0.8 rad/s per ring
- 8 points per ring, 3 concentric rings per well
- Brightness decreases outward: inner 5.0, mid 3.0, outer 1.5

**Scavenger Death Spiral**
- Duration: 1.5s
- Motion: orbit around killing well with decreasing radius
- Visual: entity fades while spiraling into the well

**Portal Pulse**
- Rate: 0.8 Hz
- 3 spiral arms, spin speed 1.2 rad/s
- Density: 0.02 brightness per arm

**Wave Ring Expansion**
- Speed: 0.4 world-units/s outward
- Band width: 0.1 world-units
- Decay: 0.97 per frame (multiplicative)
- Max radius: 2.0 world-units

### Animation Principles
- **Simulation drives motion** — animation comes from the physics, not from UI tweens. Wells rotate because of orbital mechanics, not because someone added a CSS animation.
- **Instant state changes** — HUD color swaps, zone transitions, and mode changes are hard cuts. The game is tense; smooth fades dilute urgency.
- **Stochastic texture** — the ASCII shimmer and directional emergence use noise, not interpolation. This gives the rendering its organic quality.
- **Corruption is the only transition** — scene changes use the glitch/corruption effect exclusively. No fades, no slides, no wipes. The dimensional tear IS the visual language of transition.
- **Glow for emphasis** — `text-shadow: 0 0 6px currentColor` pulses or intensifies, never slides or bounces.

---

## 9. Responsive Behavior

### Target Platforms
| Platform | Resolution | Notes |
|----------|-----------|-------|
| Desktop browser | 1200×800 minimum | Primary target, 60fps |
| Packaged desktop (Electron) | Native resolution | `npm start` experience |
| Mobile | Not targeted | Controls require keyboard/gamepad |

### ASCII Cell Scaling
- **Cell size**: 8px base width
- **Cell aspect**: 1.5 (height = 12px)
- At lower resolutions, cell count decreases naturally (fewer characters on screen = coarser ASCII art)
- At higher resolutions, the grid stays at 8px — more cells, more detail

### HUD Scaling
- Font sizes are fixed px, not responsive
- HUD positions are relative to screen edges (16px margin)
- Warning text scales with viewport for center positioning

---

## 10. Agent Prompt Guide

### Quick Color Reference
- Void: `#000021`
- Fluid base: `#008080` (teal)
- Accretion gold: `#FFD966`
- White-hot: `#FFF2CC`
- Inhibitor magenta: `#CC1A80`
- Inhibitor cyan: `#1ACCB3`
- HUD panel: `rgba(0, 2, 12, 0.6)`
- HUD border: `rgba(80, 100, 140, 0.2)`
- Timer normal: `rgba(150, 170, 200, 0.7)`
- Timer warning: `rgba(240, 144, 58, 0.9)`
- Timer critical: `rgba(232, 25, 0, 0.9)`
- Portal: `rgba(180, 120, 255, 0.8)`
- Salvage: `rgba(212, 168, 67, 0.8)`
- Signal: `rgba(80, 200, 180, 0.85)`

### Example Component Prompts
- "Build a HUD panel with JetBrains Mono 13px, background rgba(0, 2, 12, 0.6), border 1px solid rgba(80, 100, 140, 0.2), radius 2px, padding 8px 12px, text-shadow 0 0 6px currentColor"
- "Build a results screen: ALLCAPS title 24px weight 600, lowercase body 14px, monospace font, no background overlay, void color #000021 behind content"
- "Build a warning message: centered, 16px weight 600, fade in 0.3s scale 0.95→1.0, hold 2500ms, fade out 0.5s scale 1.0→1.02, glow shadow matching text color"
- "Build a signal meter: 120px × 4px bar, fill color varies by zone, positioned below timer top-left"

### Iteration Guide
1. Always use the monospace font stack — never substitute
2. Panel backgrounds must be translucent, never opaque
3. The simulation must always be visible through/around UI elements
4. ALLCAPS is title-only — if it's not a screen title, it's lowercase
5. Gold means value/loot, magenta means threat, teal means neutral/signal
6. Glow (`text-shadow`) is the primary emphasis tool, not bold
7. 2px border-radius maximum for panels — this is space machinery
8. Center of screen is sacred — HUD lives at edges
