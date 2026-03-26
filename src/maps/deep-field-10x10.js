/**
 * deep-field-10x10.js — Large map. 20 wells, 6 stars, 12 loot, 5 portals.
 * World scale 10.0, fluid resolution 512 for equivalent texel density.
 * Force culling is critical — 20 wells = 20 GPU passes without it.
 */
export const MAP = {
  name: 'Deep Field',
  worldScale: 10.0,
  fluidResolution: 512,
  wells: [
    // Central mega-well
    { x: 5.0, y: 5.0, mass: 2.5, orbitalDir: 1, killRadius: 0.08, spinRate: 0.4, points: 12 },
    // Inner ring (~2-3 units from center)
    { x: 3.0, y: 3.0, mass: 1.5, orbitalDir: -1, killRadius: 0.06, spinRate: 0.6, points: 8 },
    { x: 7.0, y: 3.0, mass: 1.3, orbitalDir: 1, killRadius: 0.05, spinRate: 0.7, points: 7 },
    { x: 7.0, y: 7.0, mass: 1.4, orbitalDir: -1, killRadius: 0.055, spinRate: 0.65, points: 7 },
    { x: 3.0, y: 7.0, mass: 1.2, orbitalDir: 1, killRadius: 0.05, spinRate: 0.8, points: 6 },
    // Mid ring (~4-5 units from center)
    { x: 1.5, y: 1.5, mass: 0.9, orbitalDir: 1, killRadius: 0.04, spinRate: 1.0, points: 5 },
    { x: 5.0, y: 1.0, mass: 0.7, orbitalDir: -1, killRadius: 0.035, spinRate: 1.3, points: 4 },
    { x: 8.5, y: 1.5, mass: 0.8, orbitalDir: 1, killRadius: 0.04, spinRate: 1.1, points: 5 },
    { x: 9.0, y: 5.0, mass: 1.0, orbitalDir: -1, killRadius: 0.045, spinRate: 0.9, points: 5 },
    { x: 8.5, y: 8.5, mass: 0.9, orbitalDir: 1, killRadius: 0.04, spinRate: 1.0, points: 5 },
    { x: 5.0, y: 9.0, mass: 0.7, orbitalDir: -1, killRadius: 0.035, spinRate: 1.3, points: 4 },
    { x: 1.5, y: 8.5, mass: 0.8, orbitalDir: 1, killRadius: 0.04, spinRate: 1.1, points: 5 },
    { x: 1.0, y: 5.0, mass: 1.0, orbitalDir: -1, killRadius: 0.045, spinRate: 0.9, points: 5 },
    // Outer fringe — tiny wells at edges
    { x: 0.5, y: 0.5, mass: 0.4, orbitalDir: 1, killRadius: 0.025, spinRate: 2.0, points: 3 },
    { x: 9.5, y: 0.5, mass: 0.5, orbitalDir: -1, killRadius: 0.03, spinRate: 1.8, points: 3 },
    { x: 9.5, y: 9.5, mass: 0.4, orbitalDir: 1, killRadius: 0.025, spinRate: 2.0, points: 3 },
    { x: 0.5, y: 9.5, mass: 0.5, orbitalDir: -1, killRadius: 0.03, spinRate: 1.8, points: 3 },
    { x: 3.5, y: 5.0, mass: 0.6, orbitalDir: 1, killRadius: 0.03, spinRate: 1.5, points: 4 },
    { x: 6.5, y: 5.0, mass: 0.6, orbitalDir: -1, killRadius: 0.03, spinRate: 1.5, points: 4 },
    { x: 5.0, y: 3.5, mass: 0.5, orbitalDir: 1, killRadius: 0.03, spinRate: 1.6, points: 3 },
  ],
  stars: [
    // Core region — diverse types
    { x: 2.0, y: 5.0, mass: 0.8, orbitalDir: 1, type: 'redGiant' },
    { x: 5.0, y: 2.0, mass: 0.7, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 8.0, y: 5.0, mass: 0.9, orbitalDir: 1, type: 'redGiant' },
    { x: 5.0, y: 8.0, mass: 0.6, orbitalDir: -1, type: 'whiteDwarf' },
    { x: 2.5, y: 8.0, mass: 0.5, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 7.5, y: 2.0, mass: 0.7, orbitalDir: -1, type: 'whiteDwarf' },
    // Inner ring
    { x: 4.0, y: 4.0, mass: 0.5, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 6.0, y: 4.0, mass: 0.4, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 6.0, y: 6.0, mass: 0.6, orbitalDir: 1, type: 'neutronStar' },
    { x: 4.0, y: 6.0, mass: 0.3, orbitalDir: -1, type: 'yellowDwarf' },
    // Mid ring
    { x: 2.0, y: 2.0, mass: 0.4, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 8.0, y: 2.0, mass: 0.5, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 8.0, y: 8.0, mass: 0.4, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 2.0, y: 8.0, mass: 0.3, orbitalDir: -1, type: 'yellowDwarf' },
    // Edges
    { x: 5.0, y: 0.5, mass: 0.3, orbitalDir: 1, type: 'whiteDwarf' },
    { x: 0.5, y: 5.0, mass: 0.4, orbitalDir: -1, type: 'yellowDwarf' },
    { x: 9.5, y: 5.0, mass: 0.3, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 5.0, y: 9.5, mass: 0.4, orbitalDir: -1, type: 'redGiant' },
    // Corners
    { x: 1.0, y: 1.0, mass: 0.3, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 9.0, y: 9.0, mass: 0.3, orbitalDir: -1, type: 'neutronStar' },
    { x: 3.5, y: 1.5, mass: 0.5, orbitalDir: 1, type: 'yellowDwarf' },
    { x: 6.5, y: 8.5, mass: 0.4, orbitalDir: -1, type: 'yellowDwarf' },
  ],
  wrecks: [
    // Surface tier — safe zones
    { x: 1.0, y: 2.0, type: 'derelict', tier: 1, size: 'medium' },
    { x: 2.5, y: 0.5, type: 'derelict', tier: 1, size: 'large' },
    { x: 7.5, y: 0.5, type: 'debris', tier: 1, size: 'medium' },
    { x: 0.5, y: 7.0, type: 'derelict', tier: 1, size: 'medium' },
    { x: 9.0, y: 2.5, type: 'derelict', tier: 1, size: 'small' },
    { x: 2.0, y: 9.0, type: 'debris', tier: 1, size: 'medium' },
    { x: 8.0, y: 9.0, type: 'derelict', tier: 1, size: 'large' },
    { x: 4.0, y: 0.5, type: 'derelict', tier: 1, size: 'small' },
    { x: 6.0, y: 9.5, type: 'derelict', tier: 1, size: 'medium' },
    { x: 0.5, y: 4.0, type: 'debris', tier: 1, size: 'medium' },
    // Deep tier — orbital paths
    { x: 4.0, y: 3.0, type: 'derelict', tier: 2, size: 'medium' },
    { x: 6.0, y: 3.0, type: 'derelict', tier: 2, size: 'large' },
    { x: 6.0, y: 7.0, type: 'derelict', tier: 2, size: 'medium' },
    { x: 4.0, y: 7.0, type: 'debris', tier: 2, size: 'medium' },
    { x: 2.0, y: 4.0, type: 'derelict', tier: 2, size: 'medium' },
    { x: 8.0, y: 6.0, type: 'derelict', tier: 2, size: 'small' },
    { x: 3.5, y: 6.0, type: 'derelict', tier: 2, size: 'medium' },
    { x: 6.5, y: 4.0, type: 'derelict', tier: 2, size: 'large' },
    // Core tier — near wells, high risk
    { x: 5.3, y: 5.3, type: 'vault', tier: 3, size: 'small' },
    { x: 3.3, y: 3.3, type: 'vault', tier: 3, size: 'small' },
    { x: 6.8, y: 7.2, type: 'derelict', tier: 3, size: 'medium' },
    { x: 3.2, y: 7.2, type: 'vault', tier: 3, size: 'small' },
    { x: 7.2, y: 3.2, type: 'derelict', tier: 3, size: 'medium' },
    { x: 5.0, y: 3.2, type: 'derelict', tier: 3, size: 'small' },
  ],
  // portals spawn via wave system, not map data
  planetoids: [
    { type: 'orbit', wellIndex: 0 },
    { type: 'orbit', wellIndex: 1 },
    { type: 'orbit', wellIndex: 2 },
    { type: 'orbit', wellIndex: 3 },
    { type: 'orbit', wellIndex: 4 },
    { type: 'figure8', wellA: 0, wellB: 1 },
    { type: 'figure8', wellA: 0, wellB: 2 },
    { type: 'figure8', wellA: 1, wellB: 4 },
  ],
};
