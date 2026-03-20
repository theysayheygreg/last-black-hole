/**
 * title-screen.js — Dramatic static backdrop for title and map select.
 *
 * Single massive well at dead center. Camera locks to center so the
 * void sits directly behind the title text. The accretion disk orbits
 * outside the text area. Planetoids add ambient life.
 *
 * Uses configOverrides to push the title toward composition rather than gameplay truth.
 * These revert automatically when a gameplay scene loads.
 */
export const MAP = {
  name: 'Title',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    {
      x: 1.5, y: 1.5,
      mass: 4.0,
      orbitalDir: 1,
      killRadius: 0.12,
      spinRate: 0.12,
      points: 16,
      accretionRadius: 0.06,
    },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 0 },
  ],

  configOverrides: {
    ascii: {
      shimmer: 5.0,
    },
    wells: {
      accretionRate: 0.03,
    },
    fluid: {
      ambientTurbulence: 0.0002,
      ambientDensity: 0.0001,
    },
  },
};
