/**
 * renderer-fixtures.js — Deterministic visual fixtures for renderer work.
 *
 * These are not gameplay maps. They exist to give the renderer a stable
 * composition target that can be captured over time.
 */

import { MAP as TITLE_SCREEN_MAP } from './title-screen.js';

export const FIXTURE_TITLE = {
  ...TITLE_SCREEN_MAP,
  name: 'Renderer Title Fixture',
};

export const FIXTURE_TITLE_VFX = {
  ...TITLE_SCREEN_MAP,
  name: 'Renderer Title VFX Fixture',
  fixtureVfx: {
    layout: 'opposite-left',
    titleGlyphFault: { heavy: false },
  },
};

export const FIXTURE_TITLE_VFX_HEAVY = {
  ...TITLE_SCREEN_MAP,
  name: 'Renderer Title VFX Heavy Fixture',
  fixtureVfx: {
    layout: 'opposite-left',
    titleGlyphFault: { heavy: true },
  },
};

export const FIXTURE_SINGLE_WELL = {
  name: 'Renderer Single Well Fixture',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    {
      x: 1.5, y: 1.5,
      mass: 1.2,
      orbitalDir: 1,
      killRadius: 0.05,
      spinRate: 0.8,
      points: 8,
      accretionRadius: 0.03,
    },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [],
};

export const FIXTURE_INTERFERENCE = {
  name: 'Renderer Interference Fixture',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    { x: 1.18, y: 1.34, mass: 1.1, orbitalDir: 1, killRadius: 0.05, spinRate: 0.7, points: 8, accretionRadius: 0.03 },
    { x: 1.82, y: 1.68, mass: 0.9, orbitalDir: -1, killRadius: 0.045, spinRate: 0.9, points: 8, accretionRadius: 0.028 },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [],
};

export const FIXTURE_SINGLE_WELL_5X5 = {
  name: 'Renderer 5x5 Single Well Fixture',
  worldScale: 5.0,
  camera: 'locked',
  wells: [
    {
      x: 2.5, y: 2.5,
      mass: 1.35,
      orbitalDir: 1,
      killRadius: 0.055,
      spinRate: 0.75,
      points: 8,
      accretionRadius: 0.03,
    },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [],
};

export const FIXTURE_INTERFERENCE_10X10 = {
  name: 'Renderer 10x10 Interference Fixture',
  worldScale: 10.0,
  fluidResolution: 512,
  camera: 'locked',
  wells: [
    { x: 4.7, y: 5.0, mass: 1.3, orbitalDir: 1, killRadius: 0.055, spinRate: 0.7, points: 8, accretionRadius: 0.03 },
    { x: 5.3, y: 5.0, mass: 1.05, orbitalDir: -1, killRadius: 0.048, spinRate: 0.9, points: 8, accretionRadius: 0.028 },
  ],
  stars: [],
  loot: [],
  wrecks: [],
  planetoids: [],
};

export const FIXTURE_ENTITY_SHOWCASE = {
  name: 'Renderer Entity Showcase Fixture',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    { x: 1.5, y: 1.18, mass: 1.05, orbitalDir: 1, killRadius: 0.05, spinRate: 0.72, points: 8, accretionRadius: 0.03 },
  ],
  stars: [
    { x: 0.72, y: 0.72, mass: 1.2, type: 'yellowDwarf' },
    { x: 2.35, y: 0.92, mass: 0.9, type: 'whiteDwarf' },
  ],
  loot: [],
  wrecks: [
    { x: 0.78, y: 1.75, type: 'derelict', tier: 1, size: 'medium' },
    { x: 1.08, y: 1.98, type: 'vault', tier: 3, size: 'large' },
    { x: 1.95, y: 1.92, type: 'debris', tier: 1, size: 'small' },
  ],
  planetoids: [
    { type: 'orbit', wellIndex: 0, x: 2.10, y: 1.42, vx: 0.09, vy: -0.05 },
  ],
  fixturePortals: [
    { x: 2.25, y: 2.15, type: 'standard', lifespan: 120 },
    { x: 2.55, y: 1.55, type: 'rift', lifespan: 120 },
  ],
  fixtureScavengers: [
    { x: 1.94, y: 0.92, archetype: 'vulture', facing: Math.PI * 0.15 },
    { x: 0.95, y: 2.28, archetype: 'drifter', facing: Math.PI * 1.5 },
  ],
  fixtureRemotePlayers: [
    { clientId: 'fixture-remote', wx: 1.72, wy: 2.23, vx: 0.25, vy: -0.1, status: 'alive', hullType: 'resonant' },
  ],
  fixtureFauna: [
    { id: 'fixture-jelly', wx: 2.20, wy: 0.60, size: 3, kind: 'jelly' },
  ],
  fixtureSentries: [
    { id: 'fixture-sentry', wx: 0.56, wy: 1.15, state: 'patrol' },
  ],
  configOverrides: {
    ascii: {
      shimmer: 4.5,
    },
    fluid: {
      ambientTurbulence: 0.00035,
      ambientDensity: 0.00022,
    },
  },
};

// Dev-only visual board: useful for comparing object families side by side,
// but deliberately not a representative match or promo scene.
export const FIXTURE_VISUAL_REFERENCE = {
  name: 'Renderer Visual Reference Fixture',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    { x: 1.5, y: 1.55, mass: 0.95, orbitalDir: 1, killRadius: 0.045, spinRate: 0.6, points: 8, accretionRadius: 0.025 },
  ],
  stars: [
    { x: 0.55, y: 0.55, mass: 1.0, type: 'yellowDwarf' },
    { x: 1.05, y: 0.55, mass: 1.2, type: 'redGiant' },
    { x: 1.55, y: 0.55, mass: 0.8, type: 'whiteDwarf' },
    { x: 2.05, y: 0.55, mass: 0.7, type: 'neutronStar' },
  ],
  loot: [],
  wrecks: [
    { x: 0.55, y: 1.15, type: 'derelict', tier: 1, size: 'medium' },
    { x: 0.95, y: 1.15, type: 'debris', tier: 1, size: 'small' },
    { x: 1.35, y: 1.15, type: 'vault', tier: 3, size: 'large' },
  ],
  planetoids: [
    { id: 'reference-orbiting-comet', type: 'orbit', wellIndex: 0, x: 2.34, y: 1.55, vx: 0.10, vy: -0.04 },
    { id: 'reference-transit-comet', type: 'transit', x: 2.58, y: 1.55, vx: -0.18, vy: 0.02 },
  ],
  fixturePortals: [
    { x: 1.95, y: 1.15, type: 'standard', lifespan: 120 },
    { x: 2.35, y: 1.15, type: 'rift', lifespan: 120 },
  ],
  fixtureScavengers: [
    { x: 0.65, y: 2.05, archetype: 'drifter', facing: Math.PI * 0.05 },
    { x: 1.05, y: 2.05, archetype: 'breacher', facing: Math.PI * 0.05 },
    { x: 1.45, y: 2.05, archetype: 'vulture', facing: Math.PI * 0.05 },
  ],
  fixtureRemotePlayers: [
    { clientId: 'reference-remote-drifter', wx: 1.85, wy: 2.05, vx: 0.20, vy: -0.02, status: 'alive', hullType: 'drifter' },
    { clientId: 'reference-remote-resonant', wx: 2.20, wy: 2.05, vx: -0.10, vy: 0.08, status: 'alive', hullType: 'resonant' },
  ],
  fixtureFauna: [
    { id: 'reference-jelly', wx: 0.70, wy: 2.50, size: 3, kind: 'jelly' },
    { id: 'reference-bloom', wx: 1.08, wy: 2.50, size: 4, kind: 'bloom' },
  ],
  fixtureSentries: [
    { id: 'reference-sentry-patrol', wx: 1.52, wy: 2.50, state: 'patrol' },
    { id: 'reference-sentry-alert', wx: 1.90, wy: 2.50, state: 'alert' },
  ],
  configOverrides: {
    ascii: {
      shimmer: 4.0,
    },
    fluid: {
      ambientTurbulence: 0.00028,
      ambientDensity: 0.00018,
    },
  },
};

// Dev-only side-by-side target for choosing the player hull asset path.
// Gameplay maps should not spawn these render candidates.
export const FIXTURE_SHIP_BAKEOFF = {
  name: 'Renderer Player Ship Bakeoff Fixture',
  worldScale: 3.0,
  camera: 'locked',
  wells: [
    { x: 1.5, y: 1.42, mass: 0.92, orbitalDir: 1, killRadius: 0.046, spinRate: 0.72, points: 8, accretionRadius: 0.026 },
  ],
  stars: [
    { x: 0.68, y: 0.70, mass: 0.9, type: 'yellowDwarf' },
    { x: 2.32, y: 0.70, mass: 0.9, type: 'whiteDwarf' },
  ],
  loot: [],
  wrecks: [
    { x: 0.76, y: 1.78, type: 'derelict', tier: 1, size: 'medium' },
    { x: 2.22, y: 1.78, type: 'vault', tier: 3, size: 'large' },
  ],
  planetoids: [],
  fixturePortals: [
    { x: 1.50, y: 2.28, type: 'rift', lifespan: 120 },
  ],
  fixtureShipCandidates: [
    { id: 'sprite-card-candidate', wx: 1.08, wy: 1.52, vx: 0.30, vy: -0.02, facing: 0.05, variant: 'sprite-card', radius: 0.044 },
    { id: 'pixel-mesh-candidate', wx: 1.92, wy: 1.52, vx: 0.30, vy: -0.02, facing: 0.05, variant: 'pixel-mesh', radius: 0.044 },
  ],
  configOverrides: {
    ascii: {
      shimmer: 4.2,
    },
    fluid: {
      ambientTurbulence: 0.00032,
      ambientDensity: 0.00020,
    },
  },
};

/**
 * Promo fixture: the title composition, staged for capture. The central
 * well winks (see src/render/promo-wink.js) — deliberate non-game-reality
 * theater for promotional stills and clips. Never reachable from play.
 */
export const FIXTURE_PROMO_VOID_STARES = {
  ...TITLE_SCREEN_MAP,
  name: 'Promo — Void Stares Back',
  promoWink: {
    periodSeconds: 6,
    closeSeconds: 0.22,
    holdSeconds: 0.18,
    reopenSeconds: 0.28,
    glintSeconds: 0.6,
    tagline: 'the void stares back',
    // Outer accretion ring of the title well, in world units — the
    // wink overlay sizes the eye from this.
    eyeRadiusWorld: 0.64,
  },
};

export const RENDERER_FIXTURES = {
  title: FIXTURE_TITLE,
  promoVoidStares: FIXTURE_PROMO_VOID_STARES,
  titleVfx: FIXTURE_TITLE_VFX,
  titleVfxHeavy: FIXTURE_TITLE_VFX_HEAVY,
  singleWell: FIXTURE_SINGLE_WELL,
  interference: FIXTURE_INTERFERENCE,
  singleWell5x5: FIXTURE_SINGLE_WELL_5X5,
  interference10x10: FIXTURE_INTERFERENCE_10X10,
  entityShowcase: FIXTURE_ENTITY_SHOWCASE,
  visualReference: FIXTURE_VISUAL_REFERENCE,
  shipBakeoff: FIXTURE_SHIP_BAKEOFF,
};
