# Rendering Stack — The Full Pipeline

> five layers. physics at the bottom, cockpit at the top. everything in between is the art.

---

## Design Intent

The rendering stack exists to solve one problem: the fluid sim is both the physics engine and the visual identity, but those two roles have conflicting needs. Physics wants stability and predictability. Visuals want drama, readability, and beauty. When they share the same buffers, tuning one breaks the other.

The solution: separate what the sim computes from what the player sees. Physics runs on its own buffers. A visual layer adds cosmetic effects on top. The ASCII shader reads both. The player sees a richer, more readable world without the physics being distorted.

---

## The Five Layers

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: HUD                                           │
│  DOM overlay. Timer, portal count, salvage, warnings.   │
│  z-index 10+. Pointer-events none. Pure information.    │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Particle VFX                                  │
│  2D canvas overlay. One-shot effects: pickup flashes,   │
│  portal collapse bursts, extraction sparkles.           │
│  Rendered on the overlay canvas above ASCII.            │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Entity Overlay                                │
│  2D canvas overlay. Ship, wrecks, portals, planetoids.  │
│  Clean geometry over the ASCII substrate.               │
│  Currently: ship triangle, star halos, loot dots,       │
│  portal rings, planetoid markers, wave ring circles.    │
├─────────────────────────────────────────────────────────┤
│  Layer 1: ASCII Post-Process                            │
│  GPU shader. Reads scene FBO + velocity + visual FBO.   │
│  Divides into cells, picks characters, applies shimmer, │
│  directional selection, tinting. THE visual identity.   │
├─────────────────────────────────────────────────────────┤
│  Layer 0: Fluid Sim + Visual Buffer                     │
│  GPU. Physics buffers (velocity, density, pressure).    │
│  Visual-only buffer (cosmetic density). Display shader  │
│  composites both into the scene FBO for Layer 1.        │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 0: Fluid Sim + Visual Buffer

### Physics Buffers (existing)

These are the Navier-Stokes simulation state. They're advected, diffused, pressure-corrected every frame. The ship reads velocity from here. Forces inject into here. This is the source of truth for gameplay physics.

| Buffer | Format | Contents | Who writes | Who reads |
|--------|--------|----------|-----------|----------|
| **Velocity** | RGBA16F, 256² (or 512²) | Fluid velocity (xy). Per-texel flow direction and speed. | Well force shader, splat forces (thrust, planetoid wakes) | Ship (fluid coupling), display shader (speed brightness, flow tinting), ASCII shader (directional chars) |
| **Density** | RGBA16F, 256² | Fluid density (rgb). Visible "stuff" in the fluid. | Density splats (accretion disks, star rays, wakes, loot glow) | Display shader (brightness, color), dissipation shader |
| **Pressure** | RGBA16F, 256² | Pressure field (x). Intermediate solver state. | Jacobi iteration | Gradient subtraction |

**The problem with density:** it's both visual and physical. Accretion disk density makes wells look cool AND affects dissipation calculations. Star ray density makes stars look bright AND changes how nearby density fades. You can't make the accretion disk brighter without changing the dissipation behavior around wells.

### Visual Density Buffer (NEW)

A new RGBA16F texture at the same resolution as the sim. Same UV space. But the sim never touches it — no advection, no dissipation, no pressure correction. It's a "paint layer" on top of the physics.

| Buffer | Format | Contents | Who writes | Who reads |
|--------|--------|----------|-----------|----------|
| **Visual density** | RGBA16F, 256² | Cosmetic density (rgb). Pure visual effects. | Entity systems via `fluid.visualSplat()` | Display shader (additive with physics density) |

**Lifecycle per frame:**
1. Clear visual density buffer (or apply fast fade — 0.9× per frame for trails)
2. Entity systems call `fluid.visualSplat()` for cosmetic effects
3. Display shader reads `u_density + u_visualDensity` for total visible density
4. ASCII shader reads the composite scene FBO (unchanged)

**What lives in the visual buffer (candidates — migrate gradually):**

| Effect | Currently in | Move to visual? | Why |
|--------|-------------|-----------------|-----|
| Accretion disk density | Physics density | Yes | Disk brightness shouldn't affect dissipation |
| Star ray density | Physics density | Yes | Rays are decorative, not physical |
| Star core glow | Physics density | Yes | Same — visual landmark |
| Loot shimmer points | Physics density | Maybe | Very small effect either way |
| Portal spiral density | Physics density | Yes | Spiral is decorative |
| Ship wake density | Physics density | Partial | Keep wake force in physics velocity, move density trail to visual |
| Planetoid trail density | Physics density | Yes | Trail is visual, bow shock force stays in physics |
| Event horizon void | Physics density (negative) | Maybe | The void IS physical — density absence matters |

**What stays in physics:**

| Effect | Why it stays |
|--------|-------------|
| Well gravity force (velocity) | This IS the physics |
| Star push force (velocity) | Ship needs to be pushed |
| Loot flow obstruction (velocity) | Creates lee zones the ship can hide in |
| Portal inward pull (velocity) | Creates visible vortex AND affects ship |
| Ship wake force (velocity) | Creates surfable currents |
| Planetoid bow shock force (velocity) | Creates surfable pressure waves |

**Rule of thumb:** if the ship or other entities REACT to it physically, it stays in the physics buffer. If it's only there to look cool, it moves to the visual buffer.

### Display Shader Changes

The display shader currently reads `u_velocity` and `u_density`. Add `u_visualDensity`:

```glsl
uniform sampler2D u_visualDensity;  // NEW

// In main():
vec3 physDens = texture(u_density, fluidUV).xyz;
vec3 visDens = texture(u_visualDensity, fluidUV).xyz;
vec3 totalDens = physDens + visDens;

float rawDensity = length(totalDens);  // use combined for brightness
```

The rest of the display shader is unchanged — speed brightness, flow tinting, well proximity coloring all work on the combined signal.

### fluid.js API Addition

```javascript
// New method — injects into visual buffer only (no physics effect)
visualSplat(x, y, r, g, b, radius) {
  // Same splat shader, targets visualDensity instead of density
}
```

Separate from the existing `splat()` which injects into BOTH velocity and density (physics).

### Visual Buffer Fade

The visual buffer needs its own fade behavior. Options:

**Option A: clear every frame, re-inject.** Simplest. Every entity re-injects its visual density each frame. No persistence. Current behavior for most effects anyway (accretion points are re-splatted every frame).

**Option B: slow fade (0.9× per frame).** Visual density persists briefly, creating short trails and afterglow. Good for ship wake trails, portal collapse remnants, wreck destruction effects. A simple clear pass with `fragColor = existing * 0.9` each frame.

**Recommendation:** Option B with a configurable fade rate. Most effects re-inject every frame anyway, so the fade only matters for one-shot effects (explosions, pickups, collapses).

---

## Layer 1: ASCII Post-Process

The ASCII shader is already its own layer. It reads the scene FBO (output of the display shader) and converts to ASCII characters.

**Current inputs:**
- Scene FBO (display shader color output)
- Font atlas texture
- Camera offset, world scale, time (for shimmer)

**New inputs (with directional ASCII + visual buffer):**
- Velocity texture — for flow-direction character selection
- (Scene FBO already contains the combined physics+visual density via the display shader)

**The ASCII shader never writes to any physics buffer.** It's pure output. Shimmer, directional selection, contrast curves — all visual-only. This layer is already fully decoupled from physics.

See DIRECTIONAL-ASCII.md for the directional character selection design.

---

## Layer 2: Entity Overlay

The 2D canvas overlay. Clean geometry rendered above the ASCII substrate.

**Currently renders:** wave rings, star halos, loot dots, portal rings, planetoid markers, ship.

**The contract:** entities exist in BOTH Layer 0 (fluid disturbance) and Layer 2 (overlay marker). The fluid disturbance says "this affects the physics." The overlay marker says "this is here, interact with it." Without the disturbance, entities feel like stickers. Without the overlay, they're lost in the ASCII noise.

**No changes needed** for the visual buffer work. The overlay is already decoupled.

---

## Layer 3: Particle VFX

One-shot visual effects that don't need to live in the fluid sim at all. Rendered on the overlay canvas (same as Layer 2, just conceptually separate).

**Examples:**
- Wreck pickup flash (brief gold burst)
- Portal collapse shockwave (expanding ring, already exists as wave ring)
- Extraction sparkle (ship shrinks into portal)
- Planetoid consumption burst
- Well growth pulse

**These are overlay canvas effects.** They don't inject into the fluid, don't affect the ASCII shader, don't touch physics. Pure cosmetic. The existing `WaveRingSystem` is already a Layer 3 effect (overlay circles that also inject into fluid — a hybrid).

**Future consideration:** some VFX might want to ALSO inject into the visual density buffer for a "bleeds into the fabric" effect. A portal collapse could leave a visual afterglow in the ASCII that fades over a few seconds. This is where the visual buffer + slow fade shines.

---

## Layer 4: HUD

DOM overlay. See HUD.md for full spec.

**The HUD never touches any GPU buffer.** It's HTML/CSS, updated via `textContent` and `style` changes from the game loop. Completely decoupled from everything below it.

---

## Visual Buffer Compositing Modes

How the display shader combines physics density and visual density. The mode affects how entity visuals interact with the fluid fabric.

### Current: Max (v1)
`totalDens = max(physDens, visDens)` — whichever signal is stronger wins per channel. No double-stacking, no moiré. Fluid currents visible where visual density is low, entity visuals dominate where they're strong.

### Alternatives (for polish phase)

**Additive:** `totalDens = physDens + visDens` — the original approach. Both signals stack. Creates moiré patterns where both are active because the ASCII shader maps the combined luminance to characters and the two spatial frequencies interfere. Looks noisy around accretion disks.

**Replace with threshold:** `totalDens = length(visDens) > threshold ? visDens : physDens` — visual buffer takes over entirely above a threshold. Clean separation but loses "fluid flowing through the accretion disk" look. Good for UI elements or sharp-edged effects.

**Multiplicative modulation:** `totalDens = physDens * (1 + visDens)` — visual buffer brightens the physics signal rather than adding its own layer. Accretion disk makes existing fluid glow brighter. Subtle, organic. Loses the "glow from nothing" in empty space where physics density is near zero.

**Alpha blend:** `totalDens = mix(physDens, visDens, visDensAlpha)` — visual buffer's alpha channel controls the crossfade. Most flexible — can smoothly transition from "see through to physics" to "visual takes over." Requires the visual buffer to carry meaningful alpha (currently unused). Good for future effects like portals that should occlude the fabric, or Inhibitor corruption that replaces the ASCII with alien characters.

---

## Migration Plan

Don't move everything at once. The visual buffer is additive infrastructure — nothing breaks by adding it. Migration is per-effect, one at a time:

**Phase 1 (tonight): stub the buffer**
- Create the visual density FBO in fluid.js
- Add `visualSplat()` method
- Wire it into the display shader (additive read)
- Pick ONE effect to move as proof of concept (star rays — visual only, low risk)
- Verify: stars look the same, physics unchanged, 60fps

**Phase 2 (tuning passes): migrate effects gradually**
- Move accretion disk density to visual buffer
- Move portal spiral density to visual buffer
- Move planetoid trail density to visual buffer
- Each migration: verify visual match, verify physics unchanged

**Phase 3 (creative): exploit the freedom**
- Make accretion disks 3x brighter without affecting dissipation
- Add dramatic ship wake trails that persist in visual buffer
- Add wreck "debris field" visual halos
- One-shot VFX that bleed into the fabric via visual buffer

---

## Performance Notes

The visual density buffer adds:
- 1 RGBA16F texture (256² = 512KB VRAM, or 512² = 2MB)
- 1 clear/fade pass per frame (~0.1ms)
- N splat passes per frame (same cost as current density splats — we're moving them, not adding)
- 1 extra texture sample per pixel in the display shader (~0.5ms at 1080p)

Net cost: ~1ms per frame. The splat cost is moved from physics density to visual density, not doubled. The only new cost is the display shader's extra texture read.

---

## What This Enables

1. **Tune physics feel and visual drama independently.** Make wells look terrifying without making them physically stronger.
2. **Persistent visual effects.** Wake trails, explosion afterglow, portal remnants — things that fade from the visual fabric over seconds, not the 16ms physics timestep.
3. **Richer entity visuals without physics cost.** Bright halos, dramatic accretion disks, shimmering portals — all without destabilizing the Navier-Stokes solver.
4. **Clean separation for directional ASCII.** The velocity texture is read-only for character selection. Visual density is read-only for brightness. Physics is never contaminated by visual tuning.
5. **Foundation for Layer 3 VFX.** One-shot effects can optionally bleed into the visual buffer for "fabric impact" — an explosion that leaves a glowing scar in the ASCII field.
