/**
 * CONFIG — single source of truth for every tunable value.
 * Every system reads from CONFIG every frame (never cached at init).
 * Dev panel sliders bind directly to this object for live tuning.
 *
 * UNIT CONVENTIONS:
 *   - World-space: 0 to WORLD_SCALE (3.0). Ship, entities, camera all use this.
 *   - Fluid UV:    0 to 1.0. The GPU sim texture. World ÷ 3 = UV.
 *   - Pixels:      Screen coordinates. World × pxPerWorld() = pixels.
 *   - px/s²:       Ship thrust is kept in pixel-units for feel continuity
 *                   with the original 1x1 map, and converted at use-site.
 *
 * KNOB HYGIENE: Only expose values that produce visible changes when moved.
 * Stability guards (clamp radii, terminal speeds) live here too so they're
 * tunable during playtesting, but they're not "feel" knobs.
 */
export const CONFIG = {
  ship: {
    thrustAccel: 1.7,        // world-units/s². Used directly (no px conversion).
                             // 1.7 ≈ old 800px/s² feel. Higher = zippier. 0.5 = sluggish.
    fluidCoupling: 1.2,      // Lerp rate toward fluid velocity (per second). 0 = ship ignores
                             // currents entirely. 1+ = fluid rider — currents carry you.
                             // Clamped to max 0.5 per frame to prevent velocity teleport.
    turnRate: 360,            // deg/s rotation toward mouse/stick. 360 = snappy, 120 = sluggish.
    drag: 0.06,              // Fraction of velocity removed per frame (not per second).
                             // Terminal velocity ≈ thrustAccel / (drag × pxPerWorld).
                             // 0.06 at 800 thrust → ~33 world-units/s terminal.
    size: 12,                 // Ship triangle radius in pixels (overlay rendering only).
    wake: {
      splatCount: 3,          // Number of splats in the trail behind the ship.
      splatSpacing: 0.004,    // Gap between trail splats in fluid UV. Smaller = tighter trail.
      radius: 0.005,          // Gaussian radius of each wake splat in UV. ~4 ASCII cells wide.
      force: 0.004,           // Velocity injection per splat. Compare to well gravity (0.0015).
                             // Higher = ship punches through orbital currents.
      brightness: 0.5,        // Density injection per splat. Controls teal trail visibility.
      speedThreshold: 0.15,   // Wake appears when speed exceeds this fraction of terminal velocity.
                             // Ramps from 0→1 over [threshold, 2×threshold].
    },
  },

  fluid: {
    viscosity: 0.0001,        // Navier-Stokes viscosity. Higher = syrupy, damps small eddies.
    resolution: 256,          // GPU sim grid size. 256 = good balance. 512 = detailed but heavy.
    pressureIterations: 30,   // Jacobi solver passes for incompressibility. 20-40 is fine.
    curl: 0.3,                // Vorticity confinement strength. Amplifies small-scale swirl.
    dissipation: 0.999,       // Velocity persistence per sim step. 0.99 = fast fade, 0.999 = long travel.
    densityDissipation: 0.998,// Base density persistence (overridden by distance-based pass below).
    ambientTurbulence: 0.0004,// Random velocity splats per frame — keeps the fabric alive with texture.
    ambientDensity: 0.0002,   // Random density splats per frame — faint background color.
    nearDissipation: 0.998,   // Density persistence near wells/stars/loot. High = persistent accretion.
    farDissipation: 0.985,    // Density persistence far from any source. Low = quick fadeout in void.
    dissipationNearRadius: 0.03, // UV radius where near-dissipation applies. Tight = only right at sources.
    dissipationFarRadius: 0.12,  // UV radius where transition to far-dissipation completes.
  },

  wells: {
    // --- Fluid forces (GPU-side, applied per texel via applyWellForce shader) ---
    gravity: 0.0015,          // Radial pull strength on fluid. Operates in UV-space per sim step.
                             // gravity × mass = effective pull. Higher = faster orbital currents.
    falloff: 1.5,             // Distance exponent for fluid pull. 1.0 = gentle, 2.0 = inverse-square.
                             // 1.5 = softer than real gravity — feels better for surfing.
    orbitalStrength: 0.4,     // Tangential swirl as fraction of radial pull. Creates accretion disk
                             // rotation. 0 = pure infall, 1 = equal swirl and pull.
    fluidClampRadius: 15,     // Texels from well center where force is clamped (prevents GPU singularity).
    fluidTerminalSpeed: 0.3,  // Max fluid velocity near well center (UV-units/step). Prevents blowup.

    // --- Ship forces (CPU-side, via physics.js inversePowerForce) ---
    shipPullStrength: 0.6,    // Ship gravity in world-units/s² at FORCE_REF_DIST (0.25 world-units).
                             // This is the "how hard does it trap you" knob.
    shipPullFalloff: 1.5,     // Distance exponent for ship pull. Matches fluid falloff for consistency.
    maxRange: 1.2,            // World-units — ship gravity fades to zero here via linear curve.
                             // Beyond this distance, the well exerts zero force on the ship.
                             // Creates genuine flat empty space between distant wells.

    // --- Death ---
    killRadius: 0.04,         // World-units — ship dies inside this radius. ~16px at 1200px screen.

    // --- Accretion disk visuals (fluid density injection) ---
    accretionRate: 0.015,     // Base density brightness per injection point. Scaled by well mass.
    accretionRadius: 0.023,   // Base disk radius in fluid UV. Scaled by well mass × ring.radiusMult.
    accretionSpinRate: 0.8,   // Disk rotation in rad/s. Per-well override available.
    accretionPoints: 8,       // Injection points per ring. More = smoother disk, more GPU splats.
    accretionRings: [
      // Each ring defines a concentric band of the accretion disk.
      // radiusMult: distance from center as fraction of accretionRadius.
      // brightness: density multiplier (inner rings are hotter/brighter).
      // r,g,b: color tint. splatR: Gaussian radius of each splat in UV.
      { radiusMult: 0.5, brightness: 5.0, r: 1.0, g: 0.9, b: 0.5, splatR: 0.002 },  // inner — hot white-yellow
      { radiusMult: 0.8, brightness: 3.0, r: 1.0, g: 0.6, b: 0.15, splatR: 0.002 }, // mid — bright amber
      { radiusMult: 1.2, brightness: 1.5, r: 0.8, g: 0.3, b: 0.05, splatR: 0.003 }, // outer — dim red-orange
    ],
    accretionTangentialForce: 0.002, // Velocity injection along disk rotation per ring. Feeds the swirl visually.
    horizonPoints: 12,        // Bright points in the innermost event horizon ring.
    horizonRadiusMult: 0.3,   // Horizon ring radius = accretionRadius × mass × this.
  },

  events: {
    waveSpeed: 0.4,           // World-units/sec — how fast wave rings expand outward.
    waveWidth: 0.1,           // World-units — thickness of the wavefront band.
                             // Ship only feels force when inside this band.
    waveDecay: 0.97,          // Amplitude multiplier per frame. 0.97 = fades in ~1s, 0.99 = long-lived.
    waveMaxRadius: 2.0,       // World-units — ring dies when radius exceeds this.
    waveShipPush: 0.8,        // Peak push on ship in world-units/s² when wavefront passes over.
    growthInterval: 45,       // Seconds between passive well growth events. Higher = calmer game.
    growthAmount: 0.02,       // Mass added to each well per growth event. Compounds over time.
    growthWaveAmplitude: 1.0, // Initial amplitude of growth wave rings (scaled by well mass).
  },

  ascii: {
    cellSize: 8,              // Character cell width in pixels. Smaller = more detail, more GPU work.
    cellAspect: 1.5,          // Cell height/width ratio. 1.5 = readable monospace proportions.
    contrast: 0.8,            // Power curve on luminance→character mapping. <1 = more chars in dark.
    colorTemperature: 0.0,    // Unused. Reserved for global color shift.
  },

  color: {
    // Display shader colors. These are the base palette for the fluid visualization.
    voidColor: [0.0, 0.0, 0.13],      // Deep void — darkest areas, the emptiness of space.
    normalSpace: [0.0, 0.5, 0.5],     // Teal — baseline fluid presence, "the fabric."
    nearWell: [0.9, 0.4, 0.1],        // Amber — fluid near wells, accretion zone.
    hotWell: [0.9, 0.1, 0.05],        // Deep red — very close to well singularity.
    densityScale: 0.015,              // Tone-mapping scale: 1-exp(-rawDensity × this). Controls how
                                      // quickly accumulated density saturates to bright. Lower = more
                                      // dynamic range in dense areas.
  },

  stars: {
    // --- Fluid forces (GPU-side, NEGATIVE gravity = outward push) ---
    radiationStrength: 0.001, // Outward push on fluid. Same formula as well gravity but negative.
    falloff: 1.8,             // Distance exponent. Steeper than wells (1.8 vs 1.5) — sharper edge.
    orbitalStrength: 0.15,    // Tangential twist on the outflow. Creates spiral radiation pattern.
    clearing: 0.2,            // Negative density injection at center — creates visible dark bubble.
                             // Also sets bubble radius: clearing × 0.13 in UV.
    fluidClampRadius: 20,     // Texels — wider than wells because stars push outward.
    fluidTerminalSpeed: 0.2,  // Lower terminal than wells — radiation is gentler.

    // --- Visual rays (fluid density injection) ---
    rayCount: 6,              // Number of rotating light rays.
    rayLength: 0.08,          // Length of each ray in fluid UV. ~0.24 world-units.
    rayBrightness: 0.06,      // Density per ray point. Scales with star mass.
    raySpinRate: 0.3,         // Ray rotation in rad/s. Min 0.3 for visual legibility.
    coreBrightness: 0.2,      // Core glow density. Also sets core radius: coreBrightness × 0.025.

    // --- Ship forces (CPU-side, repulsive) ---
    shipPushStrength: 0.45,   // Push on ship in world-units/s² at FORCE_REF_DIST.
    shipPushFalloff: 1.8,     // Distance exponent. Matches fluid falloff.
    maxRange: 0.6,            // World-units — push fades to zero here. Smaller range than wells
                             // because stars are local hazards, not long-range attractors.
  },

  loot: {
    // --- Fluid forces (micro-well obstruction) ---
    gravity: 0.0008,          // Very weak pull — just enough to create a visible eddy.
    falloff: 3.0,             // Extremely steep falloff — effect is hyper-local. Only within a
                             // few texels. Creates lee zones and vortex shedding.
    fluidClampRadius: 5,      // Very tight clamp. Loot is a point obstacle, not a gravity well.
    fluidTerminalSpeed: 0.05, // Low terminal — loot shouldn't accelerate fluid to dangerous speeds.

    // --- Visuals ---
    densityRate: 0.015,       // Glow brightness. Blue-cyan color hardcoded in loot.js.
    glowRadius: 0.007,        // Glow size in fluid UV. ~0.02 world-units diameter.
    shimmerSpeed: 3.0,        // Shimmer point rotation in rad/s. Faster = more lively.
    shimmerRadius: 0.004,     // Shimmer orbit radius in UV around the anchor.
    overlaySize: 8,           // Overlay dot size in pixels.
    pulseRate: 1.5,           // Overlay pulse frequency in Hz. Higher = more urgent.
  },

  portals: {
    // --- Fluid forces (weak inward pull, about 1/3 of well gravity) ---
    gravity: 0.0002,          // Very gentle pull. Reduced from 0.0005 — was dragging ship via
                             // fluid coupling from across the map (GPU gravity has no maxRange).
    falloff: 1.5,             // Same falloff curve as wells for consistency.
    fluidClampRadius: 10,     // Moderate clamp. Portal is smaller than a well.
    fluidTerminalSpeed: 0.1,  // Low terminal — portal shouldn't trap the ship via fluid alone.
    orbitalStrength: 0.2,     // Slight swirl on the inflow. Creates the spiral visual.

    // --- Extraction ---
    captureRadius: 0.08,      // World-units — ship extracts when closer than this.
                             // About 2× well kill radius, so portals are easier to enter.

    // --- Visuals ---
    densityRate: 0.02,        // Purple spiral brightness.
    spiralArms: 3,            // Number of rotating spiral arms.
    spiralSpeed: 1.2,         // Spiral rotation in rad/s.
    overlaySize: 12,          // Overlay ring size in pixels. Bigger than loot to stand out.
    pulseRate: 0.8,           // Overlay pulse in Hz. Slower than loot — stately, inviting.
  },

  planetoids: {
    // --- Fluid injection (creates surfable wakes) ---
    bowShockForce: 0.003,     // Velocity injection ahead of the planetoid. Creates pressure wave.
    bowShockRadius: 0.005,    // Gaussian radius of bow shock splat in UV.
    wakeForce: 0.002,         // Velocity injection for lateral wake vortex pair.
    wakeRadius: 0.003,        // Gaussian radius of each wake eddy in UV.
    trailLength: 4,           // Number of density splats in the comet trail behind.
    trailSpacing: 0.003,      // Gap between trail splats in UV.
    density: 0.01,            // Trail brightness. Blue-white color hardcoded in planetoids.js.

    // --- Motion ---
    orbitSpeed: 0.4,          // Angular speed for orbit/figure-8 paths in rad/s.
    transitSpeed: 0.15,       // Linear speed for transit paths in world-units/s.

    // --- Ship interaction ---
    shipPushStrength: 0.3,    // Push on ship in world-units/s² at distance=0 (linear fade).
    shipPushRadius: 0.1,      // World-units — push drops to zero at this distance.

    // --- Well consumption ---
    mass: 0.04,               // Mass added to well when a planetoid is consumed.
    size: 6,                  // Overlay dot radius in pixels.
    spawnInterval: [15, 25],  // [min, max] seconds between transit spawns.
    maxAlive: 6,              // Max concurrent planetoids. Caps GPU splat budget.
  },

  camera: {
    lerpSpeed: 3.0,           // Camera smoothing. Higher = tighter follow (less float).
                             // 3.0 = responsive. 1.0 = dreamy. 10 = locked to ship.
    leadAhead: 0.3,           // Seconds of velocity lead-ahead. Camera anticipates where the
                             // ship is going. 0 = centered on ship. 0.5 = looks far ahead.
    maxLerp: 0.5,             // Max lerp per frame. Prevents camera teleport on large dt.
  },

  input: {
    // --- Stick deadzone (scaled radial — no cardinal snapping) ---
    gamepadDeadzone: 0.15,    // Inner deadzone radius. Stick below this = zero output.
    gamepadOuterDeadzone: 0.05, // Outer deadzone. Clips near-max to ensure full-tilt is reachable.
                              // Output is remapped: [deadzone..1-outer] → [0..1], no jump at edge.

    // --- Aim state hysteresis (prevents flicker at deadzone boundary) ---
    gamepadAimEnter: 0.25,    // Stick must exceed this magnitude to start aiming.
                              // Higher than deadzone so player must push deliberately.
    gamepadAimExit: 0.10,     // Stick must drop below this to stop aiming.
                              // Lower than deadzone — absorbed by it.
    gamepadAimHoldMs: 80,     // Must stay below exit threshold for this long (ms) to confirm release.
                              // Absorbs spring oscillation when letting go of stick.

    // --- Angular smoothing (kills jitter, preserves responsiveness) ---
    gamepadSmoothTime: 0.08,  // Exponential decay time constant (seconds). Lower = snappier.
    gamepadSmallAngle: 3,     // Degrees — changes below this get full smoothing (invisible jitter).
    gamepadBigAngle: 15,      // Degrees — changes above this get zero smoothing (instant flick).
                              // Between small and big: linear blend.

    gamepadTurnRate: 360,     // Stick turn rate in deg/s (not currently used — facing is direct from stick).
    triggerThreshold: 0.05,   // Trigger activation threshold (0-1). Prevents ghost input.
    brakeStrength: 0.15,      // Extra drag per frame from L2 brake at full pull. Stacks with base drag.
  },

  debug: {
    showVelocityField: false, // Draw fluid velocity arrows on overlay canvas.
    showWellRadii: false,     // Draw well kill radii, star push radii, portal capture radii.
    showFPS: true,            // Show FPS, ship position, velocity, input method.
    showCoordDiagnostic: false, // Inject green dots at well positions to verify coord alignment.
    showFluidDiagnostic: false, // Show density/velocity readouts at well positions.
  },
};
