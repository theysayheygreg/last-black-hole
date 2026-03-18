# Directional ASCII — Flow-Aware Character Selection

> the characters ARE the physics made visible.

---

## Design Intent

Right now the ASCII shader maps luminance → character density. A bright cell picks a heavy character (`#`, `@`), a dim cell picks a light one (`.`, `:`) — but the characters don't tell you WHICH WAY the fluid is moving. Density without direction.

Directional ASCII adds a second axis: flow angle selects which CHARACTER SET to draw from. Horizontal flow picks from `- ~ =`, vertical from `| !`, diagonal from `/ \`. The player can literally read current direction from the ASCII texture. This is the single biggest visual upgrade remaining — it makes the fluid sim legible as physics, not just density noise.

---

## How It Works

### Four Character Ramps

Instead of one density ramp, we have four — one per flow direction:

| Ramp | Flow Direction | Characters (sparse → dense) |
|------|---------------|----------------------------|
| Isotropic | no flow / slow | `. ' - , : ; " ~ ^ * + = # @ ` |
| Horizontal | left/right | `. - ~ ─ — = ═ ≡ ░ ▒ ▓ █` |
| Vertical | up/down | `. : \| ! ¦ ‖ ║ │ ░ ▒ ▓ █` |
| Diagonal | 45° angles | `. / \\ × ╱ ╲ ╳ ░ ▒ ▓ █` |

Each ramp has ~12-16 characters sorted by visual weight, just like the current density ramp. The heavy end (░ ▒ ▓ █) is shared across all ramps — at very high density, direction matters less than "there's a lot of stuff here."

### Atlas Layout

The current 16×16 atlas grid has 256 positions. We use the first 4 rows:

```
Row 0 (idx  0-15): Isotropic — current behavior, no directional bias
Row 1 (idx 16-31): Horizontal — characters with horizontal emphasis
Row 2 (idx 32-47): Vertical — characters with vertical emphasis
Row 3 (idx 48-63): Diagonal — characters with diagonal emphasis
```

Each row is a complete sparse→dense ramp. The shader selects a row based on flow angle, then selects a column based on luminance.

### Shader Logic

The ASCII shader needs the fluid velocity texture (currently only has the scene color FBO).

```glsl
uniform sampler2D u_velocity;  // fluid velocity texture (NEW)

// In main():
// Sample velocity at this cell's fluid UV position
vec2 cellFluidUV = u_camOffset + (cellCenter - 0.5) / u_worldScale;
vec2 vel = texture(u_velocity, cellFluidUV).xy;
float speed = length(vel) * u_worldScale / 3.0;  // normalize to world-equivalent

// Select ramp based on flow angle
float rampOffset = 0.0;  // default: isotropic
float rampSize = 16.0;   // chars per ramp

if (speed > dirThreshold) {
  float angle = abs(atan(vel.y, vel.x));
  // 4 sectors: horizontal (±30°), vertical (60°-120°), diagonal (30°-60°, 120°-150°)
  if (angle < 0.52 || angle > 2.62)
    rampOffset = 16.0;       // horizontal
  else if (angle > 1.05 && angle < 2.09)
    rampOffset = 32.0;       // vertical
  else
    rampOffset = 48.0;       // diagonal
}

// Map luminance to position within the selected ramp
float charIdx = rampOffset + lum * (rampSize - 1.0);
```

### Speed Blending (Shimmer Integration)

Hard switching between isotropic and directional at a speed threshold would create visible seams. Instead, use probabilistic blending tied to the existing shimmer noise:

```glsl
float dirStrength = smoothstep(0.008, 0.04, speed);

// Use shimmer noise to probabilistically choose directional vs isotropic
// At low speed: always isotropic. At high speed: always directional.
// In between: cells randomly pick, creating organic emergence.
float useDir = step(1.0 - dirStrength, noise);
float finalRampOffset = useDir > 0.5 ? rampOffset : 0.0;
```

This means:
- **Still water:** all cells use isotropic ramp (current look, unchanged)
- **Fast current:** all cells use directional ramp (flow direction readable)
- **Transition zone:** cells randomly flicker between isotropic and directional, tied to the same noise that drives shimmer. The direction "emerges" from the noise. This IS the shimmer — directional characters appearing and disappearing at the edge of currents.

### Shimmer Compatibility

The existing shimmer system bumps `charIdx` by ±1-3 positions. With directional ramps, this still works — it jitters the density within the current ramp (e.g., from `-` to `~` in the horizontal ramp). The shimmer doesn't cross ramp boundaries because the bump is small relative to the 16-char ramp width.

The second shimmer layer (slower frequency) could occasionally push a cell from one direction to another at the ramp boundary. This creates a subtle "shimmer in direction" effect — a cell might flicker between horizontal and diagonal at the edge of a current. This is a feature, not a bug.

---

## Passing Velocity to the ASCII Shader

The ASCII renderer needs the fluid velocity texture, which it currently doesn't have.

**Option A: pass texture reference from main.js**
```javascript
// In main.js render section:
asciiRenderer.render(totalTime, camFU, camFV, WORLD_SCALE, fluid.velocity.read.tex);

// In ASCIIRenderer.render():
gl.activeTexture(gl.TEXTURE2);
gl.bindTexture(gl.TEXTURE_2D, velocityTex);
gl.uniform1i(this.uniforms['u_velocity'], 2);
```

This is the simplest approach. The velocity texture is already in GPU memory — we just bind it to an additional texture unit.

**Option B: encode in scene FBO alpha**
Encode flow angle in the display shader's alpha output. Avoids extra texture bind but loses precision and conflicts with any alpha-dependent rendering.

**Recommendation: Option A.** One extra texture bind per frame is free. Clean separation of concerns.

---

## Font Atlas Generation Changes

`generateFontAtlas()` needs to render 4 ramps instead of 1:

```javascript
const RAMPS = {
  isotropic:  " .`'-,_:;\"~^!/>+=*?|%#&$@",
  horizontal: " .-~─—=═≡░▒▓█",
  vertical:   " .:|!¦‖║│░▒▓█",
  diagonal:   " ./\\×╱╲╳░▒▓█",
};
```

Each ramp is padded/trimmed to exactly 16 characters. Characters are placed in the atlas at their row × 16 + column position.

**Fallback for missing glyphs:** some characters (═, ║, ╱) may not render in all monospace fonts. The atlas generator should check if a glyph renders (non-zero pixel area) and substitute ASCII fallbacks if not:
- `═` → `=`, `║` → `|`, `╱` → `/`, `╲` → `\`, `╳` → `x`

---

## CONFIG Integration

```javascript
ascii: {
  // ... existing ...
  dirThreshold: 0.01,    // speed below this = isotropic (world-equivalent units)
  dirBlendRange: 0.03,   // speed range over which directional emerges (adds to threshold)
},
```

---

## Performance Impact

- One extra texture sample per cell (velocity) — negligible
- One extra `atan()` per cell — slightly expensive but we're already computing noise per cell
- No extra draw calls
- Atlas stays 1024×1024, just uses more of it (64 positions vs 25)

Estimated impact: <1ms per frame. Well within budget.

---

## What This Looks Like

**Before:** all flow regions show the same characters at different densities. A horizontal current and a vertical current both render as `. : ; " ~ * #`. The player can see "something is happening" but can't read direction.

**After:** horizontal currents render as `- ~ = ─ ═`, vertical as `| ! ‖ ║`, diagonals as `/ \ ×`. The player can READ the flow field. Accretion disk orbital currents show as tangential characters. Star radiation shows as radial streaks. Ship wake shows as parallel lines behind the ship. The ASCII IS the physics.
