/**
 * CONFIG — single source of truth for every tunable value.
 * Every system reads from CONFIG every frame (never cached at init).
 * Dev panel sliders will bind directly to this object.
 */
export const CONFIG = {
  ship: {
    thrustForce: 5.0,       // force applied when clicking
    fluidCoupling: 0.8,     // 0 = ignores fluid, 1 = pure fluid
    turnRate: 180,           // degrees/sec base rotation toward cursor
    turnCurvePower: 2.0,     // ease-in exponent for turn speed
    turnDeadZone: 5,         // degrees — no rotation below this offset
    mass: 1.0,
    dragInCurrent: 0.02,     // low drag when riding flow
    dragAgainstCurrent: 0.06,// higher drag when fighting
    thrustSmoothing: 0.05,   // seconds — lerp on facing (50ms)
    thrustRampTime: 0.2,     // seconds to full thrust force
    size: 12,                // ship triangle radius in pixels
  },
  fluid: {
    viscosity: 0.0001,
    resolution: 256,         // sim grid resolution
    pressureIterations: 30,  // Jacobi solver iterations
    curl: 0.4,               // vorticity confinement strength
    dissipation: 0.995,      // velocity dissipation per step (closer to 1 = longer waves)
    densityDissipation: 0.99, // density persists longer for visible wave fronts
  },
  wells: {
    gravity: 0.001,          // G constant for force (in UV-space units) — dominant inward pull
    falloff: 1.5,            // exponent: 1.5 = softer than inverse square
    waveAmplitude: 2.0,      // oscillation force amplitude multiplier (< gravity for net inward)
    waveFrequency: 0.6,      // Hz — slower for more visible propagation
    clampRadius: 15,         // minimum radius in sim cells to prevent singularity
    terminalInflowSpeed: 0.3,// cap infall speed in sim velocity units
  },
  affordances: {
    catchWindowDeg: 15,      // wave magnetism angle threshold
    catchWindowVelPct: 0.2,  // 20% velocity match threshold
    lockStrength: 0.1,       // fraction of wave force applied as correction
    inputBufferBefore: 0.15, // seconds before wave arrival
    inputBufferAfter: 0.075, // seconds after wave crest
    thrustSmoothingMs: 50,   // facing lerp in ms
  },
  color: {
    voidColor: [0.0, 0.0, 0.13],       // #000033
    normalSpace: [0.0, 0.5, 0.5],       // teal
    nearWell: [0.9, 0.4, 0.1],          // amber
    hotWell: [0.9, 0.1, 0.05],          // red
  },
  debug: {
    showVelocityField: false,
    showWellRadii: false,
    showCatchWindows: false,
    showFPS: true,
  },
};
