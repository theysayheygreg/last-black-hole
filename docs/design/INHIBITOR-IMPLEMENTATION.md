# Inhibitor Implementation Plan

> Build order, file changes, shader strategy, integration points.
> Reference: INHIBITOR.md (behavior design), SIGNAL-SYSTEM.md (wake mechanics), COLOR-SEPARATION.md (palette).

## Architecture Overview

The Inhibitor is three systems wearing one coat:

1. **InhibitorSystem** (new `src/inhibitor.js`) — game logic: pressure accumulation, form transitions, position/velocity, AI behavior
2. **Display shader additions** (`src/fluid.js` FRAG_DISPLAY) — fabric-layer corruption: color injection, density distortion
3. **ASCII shader additions** (`src/ascii-renderer.js` FRAG_ASCII) — character corruption: glyph substitution, flicker rate

The Inhibitor does NOT render on the canvas overlay. It renders in the shader pipeline. This is the hard constraint from INHIBITOR.md: "It's not a creature in space — it's space becoming hostile."

## Rendering Strategy: How to Put an Entity in the Shader

The display shader already loops over wells (up to 256). The Inhibitor uses the same pattern: pass position, radius, and form data as uniforms, loop in the shader, apply visual effects.

But the Inhibitor is NOT a well. It gets its own uniform block and its own loop — no shared arrays, no overloading well data. Clean separation.

### New Display Shader Uniforms

```glsl
// Inhibitor state — passed every frame from InhibitorSystem
uniform int u_inhibitorForm;           // 0=inactive, 1=glitch, 2=swarm, 3=vessel
uniform vec2 u_inhibitorPos;           // position in fluid UV space
uniform float u_inhibitorRadius;       // corruption zone radius in UV
uniform float u_inhibitorIntensity;    // 0.0-1.0, ramps up during transitions
uniform vec3 u_inhibitorColor;         // [1.0, 0.18, 0.48] — the wrong pink
uniform float u_inhibitorTime;         // local time for animation (shimmer, pulse)

// Vessel-specific (Form 3)
uniform float u_vesselAngle;           // orientation angle for geometric rendering
uniform float u_vesselGravityRange;    // pull radius in UV

// Swarm tendrils (Form 2) — up to 8 tendril endpoints
uniform vec2 u_swarmTendrils[8];       // positions in fluid UV
uniform int u_swarmTendrilCount;
```

### Display Shader: Inhibitor Rendering Block

After the per-well loop (line 342) and before the vignette (line 344), add the Inhibitor block:

```glsl
// === INHIBITOR CORRUPTION ===
if (u_inhibitorForm > 0) {
  vec2 inhDiff = wrappedFluidUV - u_inhibitorPos;
  inhDiff = inhDiff - round(inhDiff);  // TOROIDAL WRAPPING RULE
  float inhDist = length(inhDiff) * u_worldScale;

  if (u_inhibitorForm == 1) {
    // FORM 1: GLITCH — localized corruption zone
    // Faint magenta bleed at edges, character corruption handled by ASCII shader
    float glitchFade = smoothstep(u_inhibitorRadius * 1.5, u_inhibitorRadius * 0.5, inhDist);
    float pulse = 0.5 + 0.5 * sin(u_inhibitorTime * 3.0 + inhDist * 40.0);
    col += u_inhibitorColor * glitchFade * pulse * u_inhibitorIntensity * 0.3;
  }

  else if (u_inhibitorForm == 2) {
    // FORM 2: SWARM — roiling mass with color injection
    float swarmCore = smoothstep(u_inhibitorRadius, u_inhibitorRadius * 0.3, inhDist);
    float swarmEdge = smoothstep(u_inhibitorRadius * 2.0, u_inhibitorRadius, inhDist);

    // Core: dense magenta injection
    col = mix(col, u_inhibitorColor, swarmCore * u_inhibitorIntensity * 0.7);

    // Edge: subtle color bleed
    float edgePulse = 0.7 + 0.3 * sin(u_inhibitorTime * 2.0 + atan(inhDiff.y, inhDiff.x) * 4.0);
    col += u_inhibitorColor * swarmEdge * (1.0 - swarmCore) * edgePulse * u_inhibitorIntensity * 0.15;

    // Tendrils: lines of corruption along fluid currents
    for (int t = 0; t < 8; t++) {
      if (t >= u_swarmTendrilCount) break;
      vec2 tDiff = wrappedFluidUV - u_swarmTendrils[t];
      tDiff = tDiff - round(tDiff);
      float tDist = length(tDiff) * u_worldScale;
      float tendrilFade = smoothstep(0.03, 0.005, tDist);
      col += u_inhibitorColor * tendrilFade * u_inhibitorIntensity * 0.25;
    }
  }

  else if (u_inhibitorForm == 3) {
    // FORM 3: VESSEL — geometric override
    // Project onto vessel's axis to create hard rectangular shape
    float cosA = cos(u_vesselAngle);
    float sinA = sin(u_vesselAngle);
    vec2 rotDiff = vec2(
      inhDiff.x * cosA + inhDiff.y * sinA,
      -inhDiff.x * sinA + inhDiff.y * cosA
    ) * u_worldScale;

    // Hard rectangular mask — sharp edges (the anti-fluid)
    float halfW = u_inhibitorRadius * 0.3;
    float halfH = u_inhibitorRadius * 1.2;
    float rectMask = step(abs(rotDiff.x), halfW) * step(abs(rotDiff.y), halfH);

    // Grid pattern inside — the geometric wrongness
    vec2 gridUV = rotDiff * 80.0;
    float grid = step(0.85, fract(gridUV.x)) + step(0.85, fract(gridUV.y));
    grid = min(grid, 1.0);

    // Hard override: vessel replaces scene color, doesn't blend
    vec3 vesselColor = u_inhibitorColor * (0.6 + grid * 0.4);
    col = mix(col, vesselColor, rectMask * u_inhibitorIntensity);

    // Edge glow — bright slash at boundary
    float edgeDist = max(abs(rotDiff.x) - halfW, abs(rotDiff.y) - halfH);
    float edgeGlow = smoothstep(0.02, 0.0, edgeDist) * (1.0 - rectMask);
    col += u_inhibitorColor * edgeGlow * 0.5;

    // Gravity pull visualization (rings toward vessel)
    float pullZone = smoothstep(u_vesselGravityRange, u_vesselGravityRange * 0.5, inhDist);
    float pullRings = sin(inhDist * 120.0 - u_inhibitorTime * 4.0) * 0.5 + 0.5;
    col += u_inhibitorColor * pullZone * pullRings * 0.08 * (1.0 - rectMask);
  }
}
```

### ASCII Shader: Character Corruption

The ASCII shader already has a glitch system (lines 133-154) that randomizes characters when `u_glitchIntensity > 0`. The Inhibitor needs a **localized** version — corruption in a radius, not screen-wide.

New uniforms for the ASCII shader:

```glsl
uniform int u_inhibitorForm;
uniform vec2 u_inhibitorPos;       // fluid UV
uniform float u_inhibitorRadius;   // UV-space
uniform float u_inhibitorIntensity;
uniform float u_inhibitorTime;
```

After the existing glitch block (line 154), add:

```glsl
// === INHIBITOR CHARACTER CORRUPTION ===
if (u_inhibitorForm > 0) {
  vec2 inhDiff = wrappedFluidUV - u_inhibitorPos;
  inhDiff = inhDiff - round(inhDiff);
  float inhDist = length(inhDiff) * u_worldScale;

  float corruptionZone = smoothstep(u_inhibitorRadius * 1.5, u_inhibitorRadius * 0.3, inhDist);
  float corruptionChance = corruptionZone * u_inhibitorIntensity;

  // Form 2/3: higher flicker rate (15-20% vs normal 0.5-2%)
  if (u_inhibitorForm >= 2) corruptionChance *= 1.5;

  float inhNoise = fract(sin(dot(cellIndex + floor(u_inhibitorTime * 20.0) * 0.43,
                   vec2(53.23, 91.97))) * 43758.5453);

  if (inhNoise < corruptionChance) {
    // Force to upper-half characters (dense/complex glyphs)
    // The actual math-symbol substitution happens via a dedicated charset ramp
    // (row 5+ in the font atlas once we add the inhibitor charset)
    float rndChar = fract(sin(dot(cellIndex * 1.7 + u_inhibitorTime * 13.0,
                    vec2(127.1, 311.7))) * 43758.5453);
    charIdx = floor(rndChar * rampSize * 0.4 + rampSize * 0.6);

    // Force magenta tint
    sceneColor.rgb = vec3(1.0, 0.18, 0.48) * (0.4 + 0.6 * u_inhibitorIntensity);
  }
}
```

**Font atlas expansion (future):** To render the reserved math symbols (`ΨΩ∞⌁∑∫√∂∆≈≠±×÷`) and box-drawing chars (`╔║╗═╬░▓█`), we add row 5 (math/corruption) and row 6 (box-drawing) to the font atlas. For now, corruption uses existing dense characters from the upper ramp — still reads as "wrong" because of the magenta tint and high flicker rate.

## Game Logic: InhibitorSystem

New file: `src/inhibitor.js` (~300 lines estimated)

```javascript
export class InhibitorSystem {
  constructor(config) {
    this.config = config;
    this.pressure = 0;
    this.threshold = 0;  // set per-run
    this.form = 0;       // 0=inactive, 1=glitch, 2=swarm, 3=vessel
    this.wx = 0;         // world position
    this.wy = 0;
    this.vx = 0;
    this.vy = 0;
    this.intensity = 0;  // 0-1, ramps during transitions
    this.swarmTargetX = 0;
    this.swarmTargetY = 0;
    this.swarmTrackTimer = 0;
    this.vesselTimer = 0;
    this.tendrils = [];   // [{wx, wy}] for swarm tendril endpoints
    this.localTime = 0;
  }

  initRun(rng) {
    this.pressure = 0;
    this.form = 0;
    this.intensity = 0;
    const cfg = this.config.inhibitor;
    this.threshold = cfg.thresholdMin + rng() * (cfg.thresholdMax - cfg.thresholdMin);
  }

  update(dt, signalLevel, ship, wells, flowField, runElapsedTime, runDuration) { ... }
  getShaderData(camX, camY, worldScale) { ... }  // returns uniform values
}
```

### Pressure Accumulation (per frame)

```javascript
// Signal is primary driver (decided: threshold + variance)
this.pressure += signalLevel * this.config.inhibitor.pressureFromSignal * dt;
// Time contributes — universe ages regardless
this.pressure += (runElapsedTime / runDuration) * this.config.inhibitor.pressureFromTime * dt;
// Well growth contributes — more mass = more disturbance
this.pressure += totalWellMassGrowth * this.config.inhibitor.pressureFromGrowth;
```

### Form Transitions

```
pressure > threshold × 0.7  → Form 1 (Glitch)     — can revert if signal drops
pressure > threshold         → Form 2 (Swarm)      — IRREVERSIBLE
pressure > threshold × 1.3   → Form 3 (Vessel)     — or 90-120s after Swarm
signal >= 1.0 while Swarm    → Form 3 immediately
```

### Movement AI

**Form 1 (Glitch):**
- Spawns at map edge farthest from player
- Drifts toward last high-signal position at 0.02 wu/s
- If signal < 0.15 for 10s: dissipate (form → 0, pressure stays)
- If signal > 0.35: speed increases to 0.04 wu/s

**Form 2 (Swarm):**
- Tracks accumulated signal position (updated every 3s)
- Speed from lookup table based on player state
- Silent 5+ seconds → expanding spiral search pattern
- Tendrils follow fluid velocity field outward from body center (sample flowField at 8 radial offsets, extend along current direction)

**Form 3 (Vessel):**
- Constant 0.08 wu/s toward player current position
- No search pattern, no evasion, no flare distraction
- Angle rotates slowly to face movement direction

### Contact Effects (wired into main.js game loop)

**Swarm contact** (distance < swarmRadius × 0.5):
- Drain 1 cargo item per second
- Apply control debuff: `ship.controlMult = 0.4` for 5 seconds
- Signal spike: `+0.25`
- Ship within swarmRadius × 0.15: inject turbulence into flowField

**Vessel contact** (distance < vesselKillRadius):
- Instant death. No grace period.

**Vessel gravity** (distance < vesselGravityRange):
- Pull toward vessel center: `strength × (1 - dist/range)²`
- Applied to ship velocity in world-space

## Integration Points

### main.js

```javascript
// In game state / getState():
inhibitorSystem     // the InhibitorSystem instance

// In run initialization:
inhibitorSystem.initRun(rng);

// In update loop (after signal system update):
inhibitorSystem.update(dt, signalLevel, ship, wellSystem, flowField, ...);

// In render call — pass inhibitor shader data alongside well data:
const inhData = inhibitorSystem.getShaderData(camX, camY, WORLD_SCALE);
fluid.render(sceneTarget, wellUVs, camFU, camFV, WORLD_SCALE, totalTime,
             wellMasses, wellShapes, inhData);

// ASCII renderer also needs inhibitor data:
asciiRenderer.render(sceneTarget, velocityTex, inhData, ...);
```

### fluid.js render()

Extend signature to accept inhibitor data object:
```javascript
render(target, wellPositionsUV, camOffsetU, camOffsetV, worldScale, totalTime,
       wellMasses, wellShapes, inhibitorData = null)
```

Set new uniforms from `inhibitorData`:
```javascript
if (inhibitorData) {
  gl.uniform1i(u['u_inhibitorForm'], inhibitorData.form);
  gl.uniform2f(u['u_inhibitorPos'], inhibitorData.posU, inhibitorData.posV);
  gl.uniform1f(u['u_inhibitorRadius'], inhibitorData.radius);
  // ... etc
} else {
  gl.uniform1i(u['u_inhibitorForm'], 0);
}
```

### audio.js

Wake moment (Form 1 → Form 2 transition):
- Drone drops octave
- Deep boom
- 2s silence
- Return with dissonant harmonic (drone × √2 ring modulation)

Ongoing Form 2:
- Ring modulation intensity scales with proximity
- Mix takeover: other audio suppressed as Swarm approaches

Form 3 arrival:
- Key change to tritone
- Tinnitus effect at close range

### test-api.js

```javascript
getInhibitorState() {
  const { inhibitorSystem } = getState();
  if (!inhibitorSystem) return null;
  return {
    form: inhibitorSystem.form,
    pressure: inhibitorSystem.pressure,
    threshold: inhibitorSystem.threshold,
    wx: inhibitorSystem.wx,
    wy: inhibitorSystem.wy,
    intensity: inhibitorSystem.intensity,
  };
},

setInhibitorPressure(value) {
  const { inhibitorSystem } = getState();
  if (!inhibitorSystem) return false;
  inhibitorSystem.pressure = value;
  return true;
},
```

### HUD Degradation

As proximity to any Inhibitor form decreases:
- Panel CSS transforms: `translate(${jitterX}px, ${jitterY}px)` where jitter = random ±1-3px
- False readings: briefly flash wrong values in HUD text
- Color bleed: CSS `filter: hue-rotate(${degrees}deg)` on panels
- Scales with `1 / distance` clamped to [0, 1]

This is CSS-only — no shader work needed for HUD effects.

## Build Order

Each step is independently testable. Commit after each.

### Step 1: Pressure System + Form Transitions
- Create `src/inhibitor.js` with InhibitorSystem class
- Pressure accumulation from signal, time, well growth
- Form state machine (0 → 1 → 2 → 3)
- Wire into main.js update loop
- Test API: `getInhibitorState()`, `setInhibitorPressure()`
- **Verify:** dev panel shows pressure rising, form transitions fire at correct thresholds

### Step 2: Form 1 — The Glitch (Visual)
- Add Inhibitor uniform block to FRAG_DISPLAY
- Implement Glitch rendering: localized magenta bleed, pulsing
- Add Inhibitor uniforms to FRAG_ASCII for character corruption
- Wire `getShaderData()` through fluid.render() and asciiRenderer.render()
- **Verify:** visible corruption zone appears when pressure > threshold × 0.7

### Step 3: Form 1 — The Glitch (Behavior)
- Spawn at map edge farthest from player
- Drift toward last high-signal position
- Dissipation when signal drops
- Solidification when signal stays high
- **Verify:** Glitch follows player activity, dissipates during silence

### Step 4: Form 2 — The Swarm (Wake Event)
- Screen flash + audio hook
- Irreversible state transition
- Events log: "something has noticed you"
- **Verify:** wake moment is unmistakable

### Step 5: Form 2 — The Swarm (Hunting + Visuals)
- Signal-based speed scaling
- Target tracking (3s update interval)
- Search pattern on silence
- Swarm rendering in display shader (core + edge + tendrils)
- Tendrils follow flowField velocity samples
- **Verify:** Swarm pursues player, tendrils flow along currents

### Step 6: Form 2 — The Swarm (Contact Effects)
- Cargo drain on contact
- Control debuff
- Signal spike
- Proximity turbulence injection into flowField
- **Verify:** contact is punishing but survivable

### Step 7: Audio Integration
- Wake moment audio (octave drop, boom, silence, return)
- Ring modulation on Swarm (drone × √2)
- Mix takeover by proximity
- Form 1 high-frequency whine
- **Verify:** audio communicates threat before visual confirmation

### Step 8: HUD Degradation
- CSS jitter, false readings, color bleed
- Proximity-scaled intensity
- **Verify:** HUD feels wrong near Inhibitor without being unreadable

### Step 9: Form 3 — The Vessel
- Geometric rendering in display shader
- Constant advance AI
- Well consumption (absorb mass, grow gravity field)
- Portal blocking (portals within range become non-functional)
- Ship gravity pull
- Instant death on contact
- **Verify:** Vessel is terrifying and visually distinct from Swarm

### Step 10: Final Portal + Endgame
- 60s after Vessel: guaranteed portal spawn at farthest point
- 15s lifespan
- If missed: universe collapse, run ends
- **Verify:** endgame is tense but fair — escape is possible

### Step 11: Signal Flare Interaction
- Flare creates decoy signal source
- Swarm + Glitch track highest signal
- Vessel ignores flares
- Flare dropped into current drifts with flow
- **Verify:** flare buys time, doesn't guarantee safety

## Performance Budget

The Inhibitor adds to the display shader's main loop:
- 1 distance calculation (same cost as 1 well iteration)
- 1 form-specific rendering block (branched, only one executes)
- Up to 8 tendril distance calculations (Form 2 only)

Total: equivalent to ~9 extra wells in the shader loop. At 256 max wells with headroom, this is negligible. The ASCII shader adds 1 distance calculation per cell — also negligible.

The game logic (InhibitorSystem.update) is trivial: a few distance calculations, one state machine, one velocity integration per frame.

**Risk:** Tendril calculation in the flowField (JS-side, sampling fluid velocity at 8 points) requires `readPixels` or a CPU-side velocity cache. If flowField.sample() already exists (it does — used by test-api.js line 25), this is free. If not, we'd need to add it.

## Files Modified

| File | Change | Lines (est.) |
|------|--------|-------------|
| `src/inhibitor.js` | **NEW** — InhibitorSystem class | ~300 |
| `src/fluid.js` | Add uniforms + Inhibitor block to FRAG_DISPLAY, extend render() | +80 |
| `src/ascii-renderer.js` | Add Inhibitor uniforms + corruption block to FRAG_ASCII | +40 |
| `src/main.js` | Wire InhibitorSystem into update + render loops | +30 |
| `src/audio.js` | Wake event, ring modulation, mix takeover | +80 |
| `src/test-api.js` | `getInhibitorState()`, `setInhibitorPressure()` | +15 |
| `src/config.js` | `CONFIG.inhibitor` block (from INHIBITOR.md) | +30 |
| `index-a.html` | HUD degradation CSS (jitter, color bleed) | +20 |

## Dependencies

- **Signal system** must exist before Step 1. InhibitorSystem reads `signalLevel` every frame.
- **Color separation** (CONFIG changes) should land before Step 2 so well colors don't conflict with Inhibitor magenta during development.
- **Codex architecture work** (client/server split) may affect where InhibitorSystem lives. If the sim goes server-authoritative, Inhibitor state should be server-side with visual data synced to client. For now, build client-side and migrate later — the `getShaderData()` interface isolates rendering from logic cleanly.

## What This Doesn't Cover

- **Font atlas expansion** for math symbols and box-drawing — separate task, visual upgrade
- **Map mutations** (wells drifting, portals destabilizing) — separate system per INHIBITOR.md
- **Fauna interaction** with Inhibitor — fauna design not yet specced
- **Multiplayer Inhibitor** — deferred until multiplayer lands
- **Signal equipment interaction** — equipment changes signal shape, Inhibitor reads signal level, they compose naturally without special coupling
