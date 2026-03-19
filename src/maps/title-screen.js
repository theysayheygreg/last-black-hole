/**
 * title-screen.js — Dramatic static backdrop for title and map select.
 *
 * Single massive well at dead center. Camera locks to center so the
 * void sits directly behind the title text. The accretion disk spins
 * around it, planetoids orbit for visual interest. No movement, no
 * drift — monumental and still.
 */
export const MAP = {
  name: 'Title',
  worldScale: 3.0,
  wells: [
    // Central supermassive well — centered exactly at (1.5, 1.5)
    { x: 1.5, y: 1.5, mass: 3.5, orbitalDir: 1, killRadius: 0.12, spinRate: 0.25, points: 14 },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 0 },
  ],
};
