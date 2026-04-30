/**
 * expanse-5x5.js — Medium map. 8 wells, 3 stars, 6 loot, 3 portals.
 * World scale 5.0 — camera still shows 1 unit, so ~25× more area than visible at once.
 */
export const MAP = {
  name: 'The Expanse',
  worldScale: 5.0,
  wells: [
    // Central cluster — the main arena
    { x: 2.5, y: 2.5, mass: 2.0, orbitalDir: 1, killRadius: 0.07, spinRate: 0.5, points: 10 },
    { x: 1.5, y: 1.5, mass: 1.0, orbitalDir: -1, killRadius: 0.04, spinRate: 1.2, points: 5 },
    { x: 3.5, y: 1.5, mass: 1.2, orbitalDir: 1, killRadius: 0.05, spinRate: 0.8, points: 6 },
    { x: 3.5, y: 3.5, mass: 0.9, orbitalDir: -1, killRadius: 0.04, spinRate: 1.0, points: 5 },
    // Outliers — lonely wells in the void, reward exploration
    { x: 0.6, y: 0.6, mass: 0.6, orbitalDir: 1, killRadius: 0.03, spinRate: 1.6, points: 3 },
    { x: 4.4, y: 0.8, mass: 0.7, orbitalDir: -1, killRadius: 0.035, spinRate: 1.4, points: 4 },
    { x: 0.8, y: 4.0, mass: 0.8, orbitalDir: 1, killRadius: 0.04, spinRate: 1.1, points: 4 },
    { x: 4.2, y: 4.2, mass: 1.5, orbitalDir: -1, killRadius: 0.06, spinRate: 0.7, points: 7 },
  ],
  stars: [
    { x: 2.0, y: 1.0, mass: 0.9, orbitalDir: 1, type: 'redGiant' },
    { x: 1.0, y: 3.0, mass: 0.6, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 4.0, y: 2.5, mass: 0.7, orbitalDir: 1, type: 'whiteDwarf' },
    { x: 2.5, y: 1.8, mass: 0.4, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 1.8, y: 3.2, mass: 0.5, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 3.8, y: 2.0, mass: 0.3, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 0.8, y: 2.5, mass: 0.4, orbitalDir: 1, type: 'whiteDwarf' },
    { x: 3.0, y: 4.0, mass: 0.6, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 4.5, y: 1.5, mass: 0.3, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 1.5, y: 4.5, mass: 0.5, orbitalDir: 1, type: 'redGiant' },
    { x: 4.0, y: 4.5, mass: 0.4, orbitalDir: -1, type: 'neutronStar' },
  ],
  wrecks: [
    // Surface tier — safe zones
    { x: 2.0, y: 0.5, type: 'derelict', tier: 1, size: 'medium' },
    { x: 4.0, y: 1.0, type: 'derelict', tier: 1, size: 'large' },
    { x: 0.5, y: 2.0, type: 'debris', tier: 1, size: 'medium' },
    { x: 0.3, y: 0.3, type: 'derelict', tier: 1, size: 'small' },
    { x: 4.7, y: 0.3, type: 'derelict', tier: 1, size: 'medium' },
    { x: 0.4, y: 4.6, type: 'debris', tier: 1, size: 'medium' },
    // Deep tier — orbital paths
    { x: 3.0, y: 2.0, type: 'derelict', tier: 2, size: 'medium' },
    { x: 1.5, y: 2.5, type: 'derelict', tier: 2, size: 'small' },
    { x: 4.0, y: 3.0, type: 'derelict', tier: 2, size: 'large' },
    { x: 2.0, y: 4.0, type: 'debris', tier: 2, size: 'medium' },
    { x: 3.5, y: 4.5, type: 'derelict', tier: 2, size: 'medium' },
    { x: 1.0, y: 4.5, type: 'derelict', tier: 1, size: 'small' },
    { x: 1.2, y: 1.2, type: 'derelict', tier: 2, size: 'medium' },
    { x: 3.8, y: 3.8, type: 'derelict', tier: 2, size: 'large' },
    { x: 4.5, y: 2.0, type: 'debris', tier: 2, size: 'medium' },
    // Core tier — near wells, high risk
    { x: 2.5, y: 2.8, type: 'vault', tier: 3, size: 'small' },
    { x: 3.8, y: 1.8, type: 'vault', tier: 3, size: 'small' },
    { x: 4.5, y: 4.0, type: 'derelict', tier: 3, size: 'medium' },
    { x: 1.5, y: 1.3, type: 'vault', tier: 3, size: 'small' },
    { x: 3.2, y: 3.2, type: 'derelict', tier: 3, size: 'medium' },
  ],
  // portals spawn via wave system, not map data
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 3 },
    { type: 'orbit', wellIndex: 7 },
    { type: 'orbit', wellIndex: 5 },
    { type: 'figure8', wellA: 0, wellB: 2 },
    { type: 'figure8', wellA: 1, wellB: 3 },
    { type: 'figure8', wellA: 4, wellB: 6 },
  ],
};
