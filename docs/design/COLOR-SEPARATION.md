# Color Separation: Wells vs Inhibitors

> Two visual languages. One universe. They should never be confused.

## The Problem

Wells and the Inhibitor both live in the fluid/fabric layer. Both are bright, hot, attention-grabbing. If their color palettes overlap, the player can't instantly parse what's a gravity well (opportunity) and what's the Inhibitor (threat). That split-second read is the difference between surfing toward loot and surfing into death.

Current well colors lean red:
- `nearWell`: `[0.9, 0.4, 0.1]` — amber
- `hotWell`: `[0.9, 0.1, 0.05]` — deep red

The Inhibitor design locks magenta/fuchsia (`#FF2D7B`). That's close enough to deep red that a hot well inner ring and a nearby Swarm tendril could visually merge. Not good.

## The Fix: Two Color Families

### Wells: White → Gold → Amber

Wells are natural. They're part of the universe's physics. Their color language should feel like light and heat — stellar, not alien.

```
Far accretion  →  Near accretion  →  Inner ring  →  Event horizon rim  →  Core (black)
   teal/blue        warm gold          white-hot         bright amber          void
```

**New CONFIG values:**

```javascript
color: {
  voidColor: [0.0, 0.0, 0.13],       // unchanged — deep void
  normalSpace: [0.0, 0.5, 0.5],      // unchanged — teal fabric
  nearWell: [1.0, 0.85, 0.4],        // warm gold (was [0.9, 0.4, 0.1] amber)
  hotWell: [1.0, 0.95, 0.8],         // white-hot (was [0.9, 0.1, 0.05] deep red)
}
```

**What this changes in the shader:**

The `ringColor` blend (fluid.js line 316) currently interpolates from amber → deep red. With new values it interpolates from gold → white-hot:

```glsl
// Current: amber → deep red (too close to inhibitor magenta)
vec3 ringColor = mix(u_nearWellColor, u_hotWellColor, energy);
// [0.9, 0.4, 0.1] → [0.9, 0.1, 0.05]

// New: warm gold → white-hot (stellar, natural, far from magenta)
// [1.0, 0.85, 0.4] → [1.0, 0.95, 0.8]
```

The event horizon rim (line 326) also uses this blend. It shifts from orange-red to bright gold — more legible against the dark core.

The surf hint band (line 338) stays cool cyan `[0.05, 0.22, 0.3]` — it's already in the right family, contrasting the warm ring without touching magenta.

**Accretion ring config** (not yet injected but defined):

```javascript
accretionRings: [
  { radiusMult: 0.5, brightness: 5.0, r: 1.0, g: 0.95, b: 0.8, splatR: 0.002 },  // inner — white-hot
  { radiusMult: 0.8, brightness: 3.0, r: 1.0, g: 0.80, b: 0.35, splatR: 0.002 }, // mid — bright gold
  { radiusMult: 1.2, brightness: 1.5, r: 0.7, g: 0.55, b: 0.25, splatR: 0.003 }, // outer — warm amber
],
```

### Inhibitors: Magenta → Fuchsia → Hot Pink

The Inhibitor is NOT natural. It uses colors nothing else in the game uses. When you see magenta, you know immediately: this is wrong.

```
Far influence  →  Near corruption  →  Core presence
 faint pink        hot magenta          bright fuchsia
```

**Inhibitor palette** (from INHIBITOR.md, locked):

```javascript
CONFIG.inhibitor = {
  corruptionColor: [255, 45, 123],   // #FF2D7B — the wrong pink (0-255 for CSS/canvas)
  // Shader-space equivalents:
  // corruptionNear: [1.0, 0.18, 0.48]  — hot magenta
  // corruptionFar:  [0.6, 0.08, 0.25]  — faint bruise
  // corruptionCore: [1.0, 0.35, 0.65]  — bright fuchsia (lighter, not darker at center)
};
```

Note: the Inhibitor gets LIGHTER at its center, not darker. Wells have a dark core (void). The Inhibitor has a bright core (wrong). This is another visual inversion that reinforces "this doesn't belong."

## Color Distance Analysis

Measuring perceptual distance in rough HSL terms:

| Element | Hue Range | Saturation | Lightness |
|---------|-----------|------------|-----------|
| **Well inner** | 40-55° (gold → white) | Medium-low | High (white-hot) |
| **Well outer** | 30-45° (amber → gold) | Medium | Medium |
| **Surf hint** | 185-195° (cyan) | Medium | Low |
| **Fabric** | 180° (teal) | Medium | Low |
| **Inhibitor** | 330-345° (magenta-fuchsia) | Very high | Medium-high |
| **Star: yellow dwarf** | 45-55° (warm yellow) | Medium | High |
| **Star: red giant** | 15-25° (red-orange) | High | Medium |
| **Star: white dwarf** | 220-230° (blue-white) | Low | High |
| **Star: neutron** | 180-185° (cyan) | High | High |

The minimum hue gap between wells (30-55°) and inhibitor (330-345°) is **~85°** — nearly a quarter of the color wheel. With the old deep-red hotWell (hue ~5°), the gap was only **~30°**. Triple the separation.

## Reserved Visual Languages

### Wells Own:
- Gold/amber/white-hot color ramp
- Circular geometry (rings, halos, cores)
- Orbital motion (tangential flow, spinning rings)
- Dark cores (void at center)
- Standard ASCII density characters

### Inhibitors Own:
- Magenta/fuchsia/hot-pink palette
- **No** other system uses any hue in 300-360° range
- Corrupted/mathematical Unicode: `Ψ Ω ∞ ⌁ ∑ ∫ √ ∂ ∆ ≈ ≠ ± × ÷`
- Box-drawing geometry (Vessel): `╔ ║ ╗ ═ ╬ ░ ▓ █`
- Bright cores (inverted from well convention)
- Straight lines cutting through organic patterns
- 15-20% character flicker rate (vs 0.5-2% normal)

### Shared by Neither:
- Teal/cyan stays neutral (fabric, surf hints)
- Star colors are per-type and don't overlap inhibitor range
- Fauna gets cool purple/blue (from THREAT-MODEL.md) — different from both

## Halo and Gravity Field Colors

The current gravity field visualization (`gravityScale: 0.002`) is extremely subtle. If we ever boost it, it should tint toward the well's gold, not toward warm red. In the shader, the gravity ambient should blend toward `u_nearWellColor` (gold) rather than using a separate warm tint.

When the Inhibitor activates (THREAT-MODEL.md Phase 3), the doc says "fluid base color shifts warmer." With this new palette, that warm shift should go toward amber/orange — NOT toward pink/magenta. The Inhibitor's own color is separate from the universe-warming effect. The universe gets warmer. The Inhibitor is wrong-colored. Two different signals.

## Star Color Interaction

Stars inject `coreDensity` into the visual density buffer. These blend additively with the display shader's color output:

| Star Type | Core Density | Interaction with New Wells |
|-----------|-------------|---------------------------|
| Yellow dwarf | [1.0, 0.95, 0.6] | Harmonizes — gold on gold |
| Red giant | [1.0, 0.5, 0.2] | Amber-orange, warmer than well gold but still in family |
| White dwarf | [0.8, 0.9, 1.0] | Cool contrast — blue-white reads as different from well gold |
| Neutron | [0.6, 1.0, 1.0] | Cyan — matches fabric, contrasts with both well and inhibitor |

Red giant is the closest to overlapping but stays in the orange family (hue ~20°), well clear of magenta.

## Implementation

This is a **config-only change** for wells — two values in `CONFIG.color`:

```javascript
nearWell: [1.0, 0.85, 0.4],   // was [0.9, 0.4, 0.1]
hotWell: [1.0, 0.95, 0.8],    // was [0.9, 0.1, 0.05]
```

No shader code changes needed. The display shader already reads these as uniforms every frame. Change config, see results immediately via dev panel.

The inhibitor color system is new uniforms that get added when the Inhibitor shader code lands (see INHIBITOR-IMPLEMENTATION.md).

## What This Doesn't Touch

- Star canvas rendering (overlay colors, halos) — those are separate from shader
- Wreck type colors (canvas overlay) — already distinct
- HUD colors — separate CSS system
- Audio — not a visual concern
