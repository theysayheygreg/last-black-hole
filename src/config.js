/**
 * CONFIG — single source of truth for every tunable value.
 * Every system reads from CONFIG every frame (never cached at init).
 * Dev panel sliders bind directly to this object for live tuning.
 *
 * UNIT CONVENTIONS:
 *   - World-space: 0 to WORLD_SCALE (3.0). Ship, entities, camera all use this.
 *   - Fluid UV:    0 to 1.0. The GPU sim texture. World ÷ WORLD_SCALE = UV.
 *   - Pixels:      Screen coordinates. World × pxPerWorld() = pixels.
 *
 * GPU SPLAT SCALING RULE:
 *   When calling fluid.splat(), UV-space radii must be scaled by uvScale()²
 *   (i.e. s2 = s * s where s = uvScale()). Force values scale by uvScale().
 *   This ensures splats cover the same world-space area regardless of map size.
 *   Every system follows this: wells, stars, loot, wrecks, ship wake, combat,
 *   planetoids, wave rings. If you add a new splat call, apply s2 to radius.
 *
 * SHADER DISTANCE RULE:
 *   The display shader converts UV distance to world-equivalent via:
 *     float dist = length(diff_uv) / uvS;  where uvS = u_refScale / u_worldScale
 *   Any shape/radius values passed as uniforms must be in world-space (not UV)
 *   so they compare correctly against dist. See wells.getRenderShapes().
 *
 * KNOB HYGIENE: Only expose values that produce visible changes when moved.
 * Stability guards (clamp radii, terminal speeds) live here too so they're
 * tunable during playtesting, but they're not "feel" knobs.
 */
export const CONFIG = {
  sim: {
    fixedHz: 60,            // Authoritative in-process sim tick. Keep 60 for jam stability now;
                            // decoupling work can lower this later without changing the client loop.
    maxStepsPerFrame: 4,    // Spiral-of-death guard if a frame stalls.
  },

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
      splatCount: 5,          // Number of splats in the trail behind the ship.
      splatSpacing: 0.004,    // Gap between trail splats in fluid UV. Smaller = tighter trail.
      radius: 0.008,          // Gaussian radius of each wake splat in UV. Wider = catches more ASCII cells.
      force: 0.015,           // Velocity injection per splat. Compare to well gravity (0.0015).
                             // Boosted 4x from 0.004 — ship must visibly deflect nearby fluid.
      brightness: 2.0,        // Density injection per splat. Boosted 4x from 0.5 to match
                             // accretion ring brightness scale (rings are 3-5).
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
    ambientTurbulence: 0.0008,// Random velocity splats per frame — keeps the fabric alive with texture.
                             // Boosted 2x from 0.0004 for more spatial variation in the ASCII field.
    ambientDensity: 0.0005,   // Random density splats per frame — faint background color.
                             // Boosted 2.5x from 0.0002 so void has enough signal for shimmer to work with.
    nearDissipation: 0.998,   // Density persistence near wells/stars/loot. High = persistent accretion.
    farDissipation: 0.985,    // Density persistence far from any source. Low = quick fadeout in void.
    dissipationNearRadius: 0.03, // [UV-space] radius where near-dissipation applies. Tuned for WORLD_SCALE=3.
                                  // fluid.js scales by 3/WORLD_SCALE when passing to shader.
    dissipationFarRadius: 0.12,  // [UV-space] radius where transition to far-dissipation completes.
                                  // Same scaling as nearRadius.
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
    voidRadius: 0.001,        // UV-space radius of the negative density splat at well center.

    // --- Accretion disk visuals (fluid density injection) ---
    accretionRate: 0.015,     // Base density brightness per injection point. Scaled by well mass.
    accretionRadius: 0.023,   // [UV-space] Base disk radius in fluid UV. Scaled by well mass × ring.radiusMult.
                              // getRenderShapes() converts to world-space via × WORLD_SCALE.
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
    contrast: 0.55,           // Power curve on luminance→character mapping. <1 = more chars in dark.
                             // Lowered from 0.8 — stretches void-to-fabric across more of the ramp.
    shimmer: 3.0,             // Quantum fluctuation probability. Controls what fraction of cells
                             // spontaneously blink per frame. Higher = more cells twinkle.
                             // 0 = dead static, 3 = rare sparkle, 6 = busy.
    colorTemperature: 0.0,    // Unused. Reserved for global color shift.
    dirThreshold: 0.01,       // Speed below this = isotropic chars (world-equivalent units)
  },

  color: {
    // Display shader colors. These are the base palette for the fluid visualization.
    voidColor: [0.0, 0.0, 0.13],      // Deep void — darkest areas, the emptiness of space.
    normalSpace: [0.0, 0.5, 0.5],     // Teal — baseline fluid presence, "the fabric."
    nearWell: [0.9, 0.4, 0.1],        // Amber — fluid near wells, accretion zone.
    hotWell: [0.9, 0.1, 0.05],        // Deep red — very close to well singularity.
    densityScale: 0.04,               // Tone-mapping scale: 1-exp(-rawDensity × this). Boosted from
                                      // 0.015 so accretion rings are clearly bright (~40-50% at
                                      // steady state). This is the PRIMARY brightness signal.
    gravityScale: 0.002,              // Gravity field tone-mapping — SUBTLE ambient only, capped at
                                      // 0.15 in shader. Prevents pure black near wells during
                                      // warm-up but never dominates the density ring signal.
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

    // Wave schedule: portals arrive in timed waves, each shorter-lived.
    waves: [
      { time: 45,  count: [2, 3], types: ['standard'],              lifespan: 90 },
      { time: 180, count: [1, 2], types: ['standard', 'unstable'],  lifespan: 75 },
      { time: 330, count: [1, 2], types: ['standard', 'rift'],      lifespan: 60 },
      { time: 450, count: [1, 1], types: ['unstable'],              lifespan: 45 },
      { time: 570, count: [1, 1], types: ['standard'],              lifespan: 30 },  // final
    ],
  },

  planetoids: {
    // --- Fluid injection (creates surfable wakes) ---
    bowShockForce: 0.012,     // Velocity injection ahead of the planetoid. Boosted 4x from 0.003.
    bowShockRadius: 0.007,    // Gaussian radius of bow shock splat in UV.
    wakeForce: 0.008,         // Velocity injection for lateral wake vortex pair. Boosted 4x from 0.002.
    wakeRadius: 0.005,        // Gaussian radius of each wake eddy in UV.
    trailLength: 4,           // Number of density splats in the comet trail behind.
    trailSpacing: 0.003,      // Gap between trail splats in UV.
    density: 0.05,            // Trail brightness. Boosted 5x from 0.01. Blue-white color in planetoids.js.

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

  wrecks: {
    pickupRadius: 0.08,           // world-units — ship within this = auto-loot
    wreckGlow: [0.04, 0.03, 0.01],      // gold density injection (rgb) — visible against fluid
    vaultGlow: [0.06, 0.05, 0.02],     // brighter gold for vaults
  },

  universe: {
    runDuration: 600,           // seconds — hard cap, final portal expires here
    wellGrowthVariance: 0.01,   // random range added to per-well growth rate
    wellKillRadiusGrowth: 0.3,  // kill radius expansion factor per unit mass gained
    planetoidSpawnAccel: 0.5,   // how much spawn rate increases over the run (0=constant, 1=doubles by end)
  },

  scavengers: {
    count: 3,                    // base count per map (overridden by signature layout)
    vultureRatio: 0.3,           // fraction that spawn as vultures
    size: 8,                     // overlay triangle radius in px (70% of player ship.size)
    thrustAccel: 0.5,            // world-units/s², slightly slower than player (1.7)
    drag: 0.06,                  // same as player — same terminal velocity per unit thrust
    fluidCoupling: 1.2,          // same as player — scavengers surf the same currents
    decisionInterval: 0.8,       // seconds between AI decision updates (not per-frame)
    sensorRange: 1.5,            // world-units — how far scavengers "see" wrecks/portals
    fleeWellDist: 0.15,          // world-units — flee when closer than this to a well
    safeWellDist: 0.25,          // world-units — stop fleeing when further than this
    lootPause: 0.8,              // seconds paused at a wreck while "looting"
    vulturePlayerTrackInterval: 2.5, // seconds between vulture player-position updates
    vultureSpeedBoost: 1.3,      // thrust multiplier when vulture is racing player
    spawnStagger: 60,            // seconds over which all scavengers spawn (not all at once)
    drifterLootTarget: 1,        // wrecks before extracting (+ random 0-1)
    vultureLootTarget: 2,        // wrecks before extracting (+ random 0-1)
    bumpRadius: 0.04,            // world-units — collision detection radius with player
    bumpForce: 0.3,              // world-units/s velocity impulse on bump
    deathSpiralDuration: 1.5,    // seconds of spiral animation before scavenger disappears
    pulseCooldown: 12.0,         // vulture pulse cooldown (much longer than player)
    pulseChance: 0.3,            // probability vulture fires pulse when competing for target
  },

  combat: {
    pulseCooldown: 4.0,             // Seconds between player pulses. Long enough to be strategic.
    pulseForce: 0.8,                // Fluid velocity injection per radial splat. Higher = more visible shockwave.
    pulseRadius: 0.06,              // Gaussian radius of each pulse splat in UV. Wider = softer wave.
    pulseEntityForce: 0.5,          // Peak velocity impulse on nearby entities (world-units/s).
                                    // Linear falloff to zero at pulseEntityRadius.
    pulseEntityRadius: 0.3,         // World-units — entities within this get pushed.
    pulseRecoil: false,             // When true, player gets launched backward on pulse fire.
    pulseRecoilForce: 0.4,          // Recoil velocity in world-units/s (only if pulseRecoil is true).
    pulseWellDisruptRadius: 0.15,   // World-units — wells within this get their accretion disk scattered.
    pulseWellDisruptDuration: 2.0,  // Seconds of counter-density disruption on hit wells.
  },

  audio: {
    enabled: false,              // master toggle — muted until audio is tuned
    masterVolume: 0.7,
    droneVolume: 0.15,
    droneBaseFreq: 60,           // Hz, start of run
    droneEndFreq: 35,            // Hz, end of run (pitch drops with universe age)
    droneDistortion: 0.3,        // waveshaper drive at end of run (0 = clean, 1 = harsh)
    wellHarmonicVolume: 0.12,
    wellBaseFreq: 180,           // Hz at mass 1.0
    wellFreqScale: 0.5,          // freq = baseFreq / (mass * scale)
    wellMaxDist: 2.0,            // world-units — beyond this, well is silent
    scavengerMaxDist: 0.8,
    portalMaxDist: 1.2,
    eventVolume: 0.3,
    pulseDuckAmount: 0.25,       // multiply other gains by this during pulse (= -12dB)
    pulseDuckDuration: 0.5,      // seconds
  },

  debug: {
    showVelocityField: false, // Draw fluid velocity arrows on overlay canvas.
    showWellRadii: false,     // Draw well kill radii, star push radii, portal capture radii.
    showFPS: true,            // Show FPS, ship position, velocity, input method.
    showCoordDiagnostic: false, // Inject green dots at well positions to verify coord alignment.
    showFluidDiagnostic: false, // Show density/velocity readouts at well positions.
  },
};
