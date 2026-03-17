/**
 * CONFIG — single source of truth for every tunable value.
 * Every system reads from CONFIG every frame (never cached at init).
 * Dev panel sliders will bind directly to this object.
 *
 * V3: World-space (0-3 range). Entities use world-units.
 * Pixel-based values kept where they affect feel (thrustAccel, waveSpeed)
 * and converted at use-site.
 *
 * KNOB HYGIENE: Only expose knobs that produce visible changes when moved.
 * Stability guards (clamp radii, terminal speeds) are hardcoded where used.
 * Colors are hardcoded in the systems that inject them — density brightness
 * is the tunable, not RGB channels independently.
 */
export const CONFIG = {
  ship: {
    thrustAccel: 800,        // px/s² when thrusting — converted to world-units at use-site
    fluidCoupling: 1.2,      // how much currents carry you. 0 = ignores fluid, 1+ = fluid rider
    turnRate: 360,            // degrees/sec toward mouse
    drag: 0.06,              // velocity bleed per frame. Higher = stops faster
    size: 12,                 // ship triangle radius in pixels
    wake: {
      splatCount: 3,          // trail length (number of splats)
      splatSpacing: 0.004,    // gap between trail splats in fluid UV (scaled for 3x world)
      radius: 0.005,          // trail width in fluid UV (~4 ASCII cells at 3x)
      force: 0.004,           // flow disturbance strength
      brightness: 0.5,        // wake density injection
      speedThreshold: 0.15,   // fraction of max speed before wake appears
    },
  },
  fluid: {
    viscosity: 0.0001,
    resolution: 256,
    pressureIterations: 30,
    curl: 0.3,
    dissipation: 0.999,
    densityDissipation: 0.998,
    ambientTurbulence: 0.0004,
    ambientDensity: 0.0002,
    nearDissipation: 0.998,
    farDissipation: 0.985,
    dissipationNearRadius: 0.03,   // tighter in UV space since world is 3x
    dissipationFarRadius: 0.12,    // scaled from 0.35
  },
  wells: {
    gravity: 0.0015,          // fluid pull strength (operates in UV space, unchanged)
    falloff: 1.5,
    orbitalStrength: 0.4,
    shipPullStrength: 0.6,    // world-units/s² at 1.0 world-unit distance
    shipPullFalloff: 1.5,
    killRadius: 0.04,         // world-units (~12-25px equivalent)
    accretionRate: 0.015,
    accretionRadius: 0.023,   // fluid UV (~0.07/3)
    accretionSpinRate: 0.8,
    accretionPoints: 8,
  },
  events: {
    waveSpeed: 0.4,           // world-units/sec (was 150px/sec)
    waveWidth: 0.1,           // world-units wavefront thickness (was 40px)
    waveDecay: 0.97,
    waveMaxRadius: 2.0,       // world-units ring death radius (was 800px)
    waveShipPush: 0.8,        // world-units/s² push on ship (was 300px/s²)
    growthInterval: 45,       // seconds — slowed from 20 per Greg's request
    growthAmount: 0.02,       // mass increment — reduced from 0.05
    growthWaveAmplitude: 1.0,
  },
  ascii: {
    cellSize: 8,
    cellAspect: 1.5,
    contrast: 0.8,
    colorTemperature: 0.0,
  },
  color: {
    voidColor: [0.0, 0.0, 0.13],
    normalSpace: [0.0, 0.5, 0.5],
    nearWell: [0.9, 0.4, 0.1],
    hotWell: [0.9, 0.1, 0.05],
    densityScale: 0.015,
  },
  stars: {
    radiationStrength: 0.001,
    falloff: 1.8,
    orbitalStrength: 0.15,
    clearing: 0.2,
    rayCount: 6,
    rayLength: 0.08,          // fluid UV (~0.25/3)
    rayBrightness: 0.06,
    raySpinRate: 0.3,
    coreBrightness: 0.2,
    shipPushStrength: 0.45,   // world-units/s² at 1.0 world-unit distance
    shipPushFalloff: 1.8,
  },
  loot: {
    gravity: 0.0008,
    falloff: 3.0,
    densityRate: 0.015,
    glowRadius: 0.007,        // fluid UV (~0.02/3)
    shimmerSpeed: 3.0,
    shimmerRadius: 0.004,      // fluid UV (~0.012/3)
    overlaySize: 8,
    pulseRate: 1.5,
  },
  portals: {
    gravity: 0.0005,           // weak inward pull (1/3 of well gravity)
    captureRadius: 0.08,       // world-units — about 2x well kill radius
    densityRate: 0.02,         // purple glow brightness
    spiralArms: 3,
    spiralSpeed: 1.2,          // rad/s
    overlaySize: 12,           // pixels — bigger than loot
    pulseRate: 0.8,            // Hz — slower pulse than loot
  },
  planetoids: {
    bowShockForce: 0.003,
    bowShockRadius: 0.005,     // fluid UV
    wakeForce: 0.002,
    wakeRadius: 0.003,         // fluid UV
    trailLength: 4,
    trailSpacing: 0.003,       // fluid UV
    density: 0.01,
    orbitSpeed: 0.4,           // rad/s for orbits
    transitSpeed: 0.15,        // world-units/s for transits
    shipPushStrength: 0.3,     // world-units/s²
    shipPushRadius: 0.1,       // world-units
    mass: 0.04,
    size: 6,                   // overlay dot pixels
    spawnInterval: [15, 25],
    maxAlive: 6,
  },
  input: {
    method: 'auto',
    gamepadDeadzone: 0.15,
    gamepadTurnRate: 360,
    triggerThreshold: 0.05,
    brakeStrength: 0.15,
  },
  debug: {
    showVelocityField: false,
    showWellRadii: false,
    showFPS: true,
    showCoordDiagnostic: false,
    showFluidDiagnostic: false,
  },
};
