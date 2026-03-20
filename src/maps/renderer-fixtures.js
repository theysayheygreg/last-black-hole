/**
 * renderer-fixtures.js — Deterministic visual fixtures for renderer work.
 *
 * These are not gameplay maps. They exist to give the renderer a stable
 * composition target that can be captured over time.
 */

export const FIXTURE_TITLE = {
  name: 'Renderer Title Fixture',
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

export const RENDERER_FIXTURES = {
  title: FIXTURE_TITLE,
  singleWell: FIXTURE_SINGLE_WELL,
  interference: FIXTURE_INTERFERENCE,
};
