/**
 * CONFIG — single source of truth for every tunable value.
 * Every system reads from CONFIG every frame (never cached at init).
 * Dev panel sliders will bind directly to this object.
 */
export const CONFIG = {
  ship: {
    thrustForce: 5.0,       // base force multiplier when clicking
    thrustScale: 500,        // converts thrustForce to pixels/sec² (thrustForce * thrustScale = max accel)
    fluidCoupling: 0.8,     // 0 = ignores fluid, 1 = pure fluid
    fluidBlendRate: 4.0,     // how fast ship velocity blends toward fluid velocity (higher = snappier coupling)
    fluidVelScale: 2.0,      // multiplier converting fluid sim velocity to pixel-space velocity
    turnRate: 180,           // degrees/sec base rotation toward cursor
    turnCurvePower: 2.0,     // ease-in exponent for turn speed
    turnDeadZone: 5,         // degrees — no rotation below this offset
    mass: 1.0,
    dragInCurrent: 0.02,     // low drag when riding flow
    dragAgainstCurrent: 0.06,// higher drag when fighting
    thrustSmoothing: 0.05,   // seconds — lerp on facing (50ms)
    thrustRampTime: 0.2,     // seconds to full thrust force
    size: 12,                // ship triangle radius in pixels
    gravityClampDist: 40,    // pixel-space minimum distance for gravity pull (prevents singularity)
    wakeForceMag: 0.0003,    // thrust wake force injected into fluid
    wakeRadius: 0.0003,      // thrust wake splat radius
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
    gravity: 0.001,          // G constant for fluid-space force (UV-space units) — dominant inward pull in sim
    falloff: 1.5,            // exponent: 1.5 = softer than inverse square
    waveAmplitude: 2.0,      // oscillation force amplitude multiplier (< gravity for net inward)
    waveFrequency: 0.6,      // Hz — slower for more visible propagation
    clampRadius: 15,         // minimum radius in sim cells to prevent singularity
    terminalInflowSpeed: 0.3,// cap infall speed in sim velocity units
    shipPullStrength: 300,   // direct gravitational pull on ship in pixels/sec² at 100px distance
    shipPullFalloff: 1.5,    // exponent for ship pull distance falloff
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
  ascii: {
    cellSize: 8,            // character cell width in pixels
    cellAspect: 1.5,        // cell height/width ratio (1.5 = 8x12 for readable monospace)
    contrast: 0.8,          // luminance-to-character curve power (<1 = more chars visible in dark areas)
    colorTemperature: 0.0,  // shift warm(+) / cold(-), applied to scene before ASCII pass
  },
  debug: {
    showVelocityField: false,
    showWellRadii: false,
    showCatchWindows: false,
    showFPS: true,
  },
};
