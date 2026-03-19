/**
 * title-screen.js — Dramatic static backdrop for title and map select.
 *
 * Single massive well at dead center. Camera locks to center so the
 * void sits directly behind the title text. The accretion disk orbits
 * OUTSIDE the text area. Planetoids add ambient life.
 *
 * Uses configOverrides to boost visual effects beyond gameplay norms.
 * These revert automatically when a gameplay scene loads.
 */
export const MAP = {
  name: 'Title',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    {
      x: 1.5, y: 1.5,
      mass: 25.0,
      orbitalDir: 1,
      killRadius: 0.5,
      spinRate: 0.1,
      points: 28,
      // Massive void — dark center covers all title text (~50% of screen)
      // The splat formula exp(-d²/r) means r=0.08 gives a black circle ~0.28 UV radius
      // At WORLD_SCALE=3, that's ~0.84 world-units diameter = ~84% of the 1-unit camera view
      voidRadius: 0.08,
      // Push accretion disk out well beyond the text area
      accretionRadius: 0.08,
    },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 0 },
  ],

  // Scene-specific CONFIG overrides — reverted when leaving this scene
  configOverrides: {
    ascii: {
      shimmer: 5.0,         // more dramatic shimmer on title
    },
    wells: {
      accretionRate: 0.03,  // brighter disk
    },
    fluid: {
      ambientTurbulence: 0.0002,  // reduce ambient noise so the void stays dark
      ambientDensity: 0.0001,     // less random density fighting the void
    },
  },
};
