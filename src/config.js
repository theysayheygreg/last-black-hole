/**
 * CONFIG — single source of truth for every tunable value.
 * Every system reads from CONFIG every frame (never cached at init).
 * Dev panel sliders will bind directly to this object.
 *
 * V2 SIMPLIFICATION: Forge was right about config complexity.
 * Collapsed redundant knobs, disabled affordances until V2 wave
 * interactions are designed, removed values that weren't earning
 * their keep. See devlog Day 1 entry.
 */
export const CONFIG = {
  ship: {
    thrustAccel: 2500,       // pixels/sec² when thrusting (one number, no mass/scale indirection)
    fluidCoupling: 0.6,      // 0 = ignores fluid, 1 = pure fluid rider. How much currents carry you.
    turnRate: 360,            // degrees/sec — fast, responsive. Mouse aim should feel instant.
    drag: 0.03,              // velocity damping per frame. Low = ice-skating. High = responsive stops.
    size: 12,                 // ship triangle radius in pixels
  },
  fluid: {
    viscosity: 0.0001,        // fluid thickness. Higher = syrup, damps small motion.
    resolution: 256,          // sim grid size
    pressureIterations: 30,   // Jacobi solver accuracy
    curl: 0.3,                // vorticity confinement — creates visible eddies and swirls
    dissipation: 0.999,       // velocity persistence — higher = disturbances last longer, richer patterns
    densityDissipation: 0.998,// how long visible color persists — higher = living, persistent fabric
    ambientTurbulence: 0.0004,// random force injection per frame — quantum fluctuation feel
    ambientDensity: 0.0002,   // random density injection — keeps the fabric textured even in calm areas
  },
  wells: {
    gravity: 0.0015,          // fluid-space gravity constant — how strongly wells shape the currents
    falloff: 1.5,             // distance exponent. 1.5 = softer than inverse square
    orbitalStrength: 0.4,     // tangential force fraction. Creates circular currents around wells.
    shipPullStrength: 250,    // direct gravitational pull on ship in px/s² at 100px
    shipPullFalloff: 1.5,     // ship pull distance exponent
    clampRadius: 15,          // sim-space singularity prevention
    terminalInflowSpeed: 0.3, // cap fluid speed near well center
    gravityClampDist: 40,     // pixel-space min distance for ship gravity calc
    accretionRate: 0.008,     // density injection rate for accretion disk — higher = brighter disk
    accretionRadius: 0.06,    // UV radius of the accretion ring injection
    accretionSpinRate: 0.8,   // how fast the accretion injection points rotate (radians/sec)
    accretionPoints: 6,       // number of injection points around the ring
  },
  events: {
    waveSpeed: 150,           // pixels/sec ring expansion
    waveWidth: 40,            // pixels — wavefront thickness
    waveDecay: 0.97,          // amplitude decay per frame
    waveMaxRadius: 800,       // ring death radius in pixels
    waveShipPush: 300,        // force on ship when ring passes (px/s²)
    growthInterval: 20,       // seconds between well growth events
    growthAmount: 0.05,       // mass added per growth event
    growthWaveAmplitude: 1.0, // initial wave amplitude from growth
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
  },
  debug: {
    showVelocityField: false,
    showWellRadii: false,
    showFPS: true,
    showCoordDiagnostic: false,  // bright green splats at well fluid UV positions + overlay dots
  },
};
