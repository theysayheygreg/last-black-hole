/**
 * title-screen.js — Dramatic backdrop for the title screen.
 *
 * One massive well at center with a large accretion disk, flanked by two
 * stars pushing outward. Creates a visually striking scene that shows off
 * the fluid sim without being a playable map. No wrecks, no loot — just
 * pure cosmic theater.
 */
export const MAP = {
  name: 'Title',
  worldScale: 3.0,
  wells: [
    // Central mega-well — big, slow spin, dramatic accretion disk
    { x: 1.5, y: 1.5, mass: 3.0, orbitalDir: 1, killRadius: 0.1, spinRate: 0.3, points: 12 },
    // Two smaller wells in orbit — creates interference patterns
    { x: 0.6, y: 0.8, mass: 0.6, orbitalDir: -1, killRadius: 0.03, spinRate: 1.5, points: 4 },
    { x: 2.4, y: 2.2, mass: 0.5, orbitalDir: 1, killRadius: 0.025, spinRate: 1.8, points: 3 },
  ],
  stars: [
    // Star pushing against the central well — creates a tension zone
    { x: 0.3, y: 2.5, mass: 1.2, orbitalDir: 1 },
  ],
  loot: [],
  wrecks: [],
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 0 },
    { type: 'figure8', wellA: 0, wellB: 1 },
  ],
};
