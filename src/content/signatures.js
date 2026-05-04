// Signature content manifest.
//
// Client mirror of scripts/content/signatures.js. Keep the exported data in
// sync so seeded previews, server session identity, and local runtime
// signature application describe the same content.

export const SIGNATURE_DEFINITIONS = {
  slow_tide: {
    id: 'slow_tide',
    name: 'the slow tide',
    flavor: 'currents run long here. take your time — spacetime will not.',
    mechanical: 'low gravity / high drift / extended collapse',
    mapSizes: [3, 5],
    config: {
      fluid: { viscosity: 0.00008 },
      wells: { gravity: 0.0012 },
      universe: { runDuration: 540 },
      events: { growthInterval: 55 },
    },
    layout: {
      wellSpread: 'wide',
      wreckDensity: 'normal',
      portalCount: 'normal',
      scavengerCount: 'normal',
    },
  },
  shattered_merge: {
    id: 'shattered_merge',
    name: 'the shattered merge',
    flavor: 'the mergers have already begun. find your exit.',
    mechanical: 'fast well growth / frequent wave events / short collapse',
    mapSizes: [3, 5, 10],
    config: {
      events: { growthInterval: 25, growthAmount: 0.04 },
      universe: { runDuration: 360 },
    },
    layout: {
      wellSpread: 'tight',
      wreckDensity: 'normal',
      portalCount: 'normal',
      scavengerCount: 'high',
    },
  },
  thick_dark: {
    id: 'thick_dark',
    name: 'the thick dark',
    flavor: 'spacetime is already thickening. every move costs more than it should.',
    mechanical: 'high viscosity / heavy drift / extra exits',
    mapSizes: [3, 5],
    config: {
      fluid: { viscosity: 0.0003 },
      universe: { viscosityGrowth: 0.015 },
    },
    layout: {
      wellSpread: 'normal',
      wreckDensity: 'sparse',
      portalCount: 'high',
      scavengerCount: 'low',
    },
  },
  graveyard: {
    id: 'graveyard',
    name: 'the graveyard',
    flavor: 'civilizations fell like rain here. their wealth remains. their exits do not.',
    mechanical: 'many wrecks / few exits / slow collapse',
    mapSizes: [3, 5, 10],
    config: {
      universe: { runDuration: 480 },
      events: { growthInterval: 50 },
    },
    layout: {
      wellSpread: 'normal',
      wreckDensity: 'dense',
      portalCount: 'low',
      scavengerCount: 'low',
    },
  },
  rush: {
    id: 'rush',
    name: 'the rush',
    flavor: 'the exits are already closing. move.',
    mechanical: 'fast portal decay / many scavengers / short window',
    mapSizes: [3, 5],
    config: {
      universe: { runDuration: 300 },
      portals: { evaporationInterval: 45 },
    },
    layout: {
      wellSpread: 'normal',
      wreckDensity: 'normal',
      portalCount: 'normal',
      scavengerCount: 'high',
      wreckTierBoost: 1,
    },
  },
  deep: {
    id: 'deep',
    name: 'the deep',
    flavor: 'the distances here are immense. plan your route or drift forever.',
    mechanical: 'strong gravity / high inertia / long run',
    mapSizes: [5, 10],
    config: {
      wells: { gravity: 0.002 },
      universe: { runDuration: 600 },
    },
    layout: {
      wellSpread: 'extreme',
      wreckDensity: 'sparse',
      portalCount: 'low',
      scavengerCount: 'normal',
      wreckTierBoost: 1,
    },
  },
};

export const SIGNATURE_POOLS_BY_MAP_SIZE = {
  3: ['slow_tide', 'shattered_merge', 'thick_dark', 'graveyard', 'rush'],
  5: ['slow_tide', 'shattered_merge', 'thick_dark', 'graveyard', 'rush', 'deep'],
  10: ['shattered_merge', 'graveyard', 'deep'],
};

export const LAYOUT_MULTIPLIERS = {
  wreckDensity: { sparse: 0.6, normal: 1.0, dense: 1.6 },
  portalCount: { low: -1, normal: 0, high: 1 },
  scavengerCount: { low: -1, normal: 0, high: 2 },
};

export const SEEDED_SIGNATURES = [
  { id: 'heavy_current', name: 'heavy current', mods: { currentCouplingMult: 1.3 } },
  { id: 'dead_calm', name: 'dead calm', mods: { currentCouplingMult: 0.5, dragMult: 0.8 } },
  { id: 'signal_storm', name: 'signal storm', mods: { signalGenMult: 1.5, signalDecayMult: 0.7 } },
  { id: 'deep_gravity', name: 'deep gravity', mods: { wellGravityMult: 1.3, wellGrowthMult: 0.7 } },
  { id: 'thin_space', name: 'thin space', mods: { wellGravityMult: 0.7, portalLifespanMult: 0.6 } },
  { id: 'dark_run', name: 'dark run', mods: { sensorRangeMult: 0.6 } },
];
