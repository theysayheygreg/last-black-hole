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
      // Large void so negative space covers all title text
      voidRadius: 0.012,
      // Push accretion disk out beyond the text area
      accretionRadius: 0.04,
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
      shimmer: 5.0,       // more dramatic shimmer on title
    },
    wells: {
      accretionRate: 0.03, // brighter disk
    },
  },
};
