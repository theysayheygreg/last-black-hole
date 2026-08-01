/**
 * title-screen.js — Dramatic static backdrop for title and map select.
 *
 * Single massive well at dead center. Camera locks to center so the
 * void sits directly behind the title text. The accretion disk orbits
 * outside the text area. Peripheral objects make the title read like a
 * live attract-mode scene instead of a blank logo card.
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
      mass: 4.9,
      orbitalDir: 1,
      killRadius: 0.15,
      spinRate: 0.12,
      points: 16,
      accretionRadius: 0.075,
    },
  ],
  titleAccretionRadii: [
    [0.085, 0.37, 0.64],
  ],
  stars: [
    { x: 0.58, y: 0.68, mass: 0.75, type: 'whiteDwarf' },
    { x: 2.44, y: 0.74, mass: 1.05, type: 'yellowDwarf' },
    { x: 2.30, y: 2.42, mass: 0.68, type: 'neutronStar' },
  ],
  loot: [],
  wrecks: [
    { x: 0.74, y: 2.18, type: 'debris', tier: 1, size: 'medium' },
    { x: 2.12, y: 1.92, type: 'derelict', tier: 2, size: 'large' },
    { x: 0.94, y: 1.08, type: 'vault', tier: 3, size: 'small' },
  ],
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 0 },
  ],
  fixturePortals: [
    { id: 'title-rift-aperture', x: 2.36, y: 2.02, type: 'rift', lifespan: 120 },
  ],

  configOverrides: {
    ascii: {
      shimmer: 5.0,
    },
    wells: {
      accretionRate: 0.03,
    },
  },
};
