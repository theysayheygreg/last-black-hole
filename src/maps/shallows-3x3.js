/**
 * shallows-3x3.js — The original 3×3 layout, extracted verbatim from main.js init().
 */
export const MAP = {
  name: 'The Shallows',
  worldScale: 3.0,
  wells: [
    { x: 1.0, y: 1.2, mass: 1.5, orbitalDir: 1, killRadius: 0.06, spinRate: 0.6, points: 8 },
    { x: 2.1, y: 0.9, mass: 0.8, orbitalDir: -1, killRadius: 0.035, spinRate: 1.4, points: 4 },
    { x: 1.95, y: 2.16, mass: 1.2, orbitalDir: 1, killRadius: 0.05, spinRate: 0.9, points: 6 },
    { x: 0.6, y: 2.25, mass: 0.5, orbitalDir: -1, killRadius: 0.03, spinRate: 1.8, points: 3 },
  ],
  stars: [
    { x: 1.5, y: 1.65, mass: 0.8, orbitalDir: 1 },
    { x: 0.45, y: 0.75, mass: 0.5, orbitalDir: -1 },
  ],
  loot: [
    { x: 1.5, y: 1.05 },
    { x: 1.35, y: 2.1 },
    { x: 2.4, y: 1.65 },
  ],
  wrecks: [
    { x: 1.5, y: 0.5, type: 'derelict', tier: 1, size: 'medium' },
    { x: 0.4, y: 1.4, type: 'derelict', tier: 1, size: 'small' },
    { x: 2.5, y: 1.3, type: 'debris', tier: 1, size: 'medium' },
    { x: 1.8, y: 1.5, type: 'derelict', tier: 2, size: 'medium' },
    { x: 1.2, y: 2.5, type: 'derelict', tier: 2, size: 'large' },
    { x: 0.9, y: 0.9, type: 'vault', tier: 3, size: 'small' },
  ],
  // portals spawn via wave system, not map data
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 2 },
    { type: 'figure8', wellA: 0, wellB: 1 },
  ],
};
