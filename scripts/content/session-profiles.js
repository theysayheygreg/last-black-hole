// Session profile content manifest.
//
// Server authority clocks, relevance budgets, AI/hazard budgets, and the
// client perf contract live here so map/session scale truth has one data
// surface instead of being scattered through runtime code and tests.

const SESSION_PROFILE_FIELDS = [
  'profileId',
  'tickHz',
  'snapshotHz',
  'worldTickHz',
  'portalTickHz',
  'growthTickHz',
  'scavengerTickHz',
  'waveTickHz',
  'fieldTickHz',
  'useCoarseField',
  'flowFieldCellSize',
  'fieldFlowScale',
  'entityRelevanceRadius',
  'scavengerRelevanceRadius',
  'spawnScavengersBase',
  'spawnScavengersPerPlayer',
  'maxScavengers',
  'maxRelevantStarsPerPlayer',
  'maxRelevantPlanetoidsPerPlayer',
  'maxRelevantWrecksPerPlayer',
  'maxRelevantScavengersPerPlayer',
  'maxWellInfluencesPerPlayer',
  'maxWaveInfluencesPerPlayer',
  'maxPickupChecksPerPlayer',
  'maxPortalChecksPerPlayer',
  'clientPerfProfile',
];

const CLIENT_PERF_PROFILES = {
  fixedGrid: {
    id: 'fixedGrid',
    fluidResolution: 256,
    remotePresentationExtrapolateLimit: 0.75,
    perfSmoothing: 0.12,
  },
};

const SESSION_PROFILES = {
  small: {
    profileId: 'small',
    tickHz: 15,
    snapshotHz: 10,
    worldTickHz: 10,
    portalTickHz: 10,
    growthTickHz: 4,
    scavengerTickHz: 12,
    waveTickHz: 15,
    fieldTickHz: 10,
    useCoarseField: false,
    flowFieldCellSize: 0.25,
    fieldFlowScale: 0.18,
    entityRelevanceRadius: 1.4,
    scavengerRelevanceRadius: 1.8,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 5,
    maxRelevantStarsPerPlayer: 6,
    maxRelevantPlanetoidsPerPlayer: 4,
    maxRelevantWrecksPerPlayer: 5,
    maxRelevantScavengersPerPlayer: 4,
    maxWellInfluencesPerPlayer: 6,
    maxWaveInfluencesPerPlayer: 6,
    maxPickupChecksPerPlayer: 4,
    maxPortalChecksPerPlayer: 4,
    clientPerfProfile: 'fixedGrid',
  },
  medium: {
    profileId: 'medium',
    tickHz: 12,
    snapshotHz: 8,
    worldTickHz: 6,
    portalTickHz: 6,
    growthTickHz: 3,
    scavengerTickHz: 8,
    waveTickHz: 12,
    fieldTickHz: 6,
    useCoarseField: true,
    flowFieldCellSize: 0.32,
    fieldFlowScale: 0.22,
    entityRelevanceRadius: 1.2,
    scavengerRelevanceRadius: 1.6,
    spawnScavengersBase: 1,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 6,
    maxRelevantStarsPerPlayer: 5,
    maxRelevantPlanetoidsPerPlayer: 4,
    maxRelevantWrecksPerPlayer: 4,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 5,
    maxWaveInfluencesPerPlayer: 5,
    maxPickupChecksPerPlayer: 3,
    maxPortalChecksPerPlayer: 3,
    clientPerfProfile: 'fixedGrid',
  },
  large: {
    profileId: 'large',
    tickHz: 10,
    snapshotHz: 6,
    worldTickHz: 4,
    portalTickHz: 4,
    growthTickHz: 2,
    scavengerTickHz: 6,
    waveTickHz: 10,
    fieldTickHz: 4,
    useCoarseField: true,
    flowFieldCellSize: 0.45,
    fieldFlowScale: 0.28,
    entityRelevanceRadius: 1.0,
    scavengerRelevanceRadius: 1.4,
    spawnScavengersBase: 2,
    spawnScavengersPerPlayer: 0.5,
    maxScavengers: 7,
    maxRelevantStarsPerPlayer: 4,
    maxRelevantPlanetoidsPerPlayer: 3,
    maxRelevantWrecksPerPlayer: 4,
    maxRelevantScavengersPerPlayer: 3,
    maxWellInfluencesPerPlayer: 4,
    maxWaveInfluencesPerPlayer: 4,
    maxPickupChecksPerPlayer: 2,
    maxPortalChecksPerPlayer: 2,
    clientPerfProfile: 'fixedGrid',
  },
};

const MAP_SESSION_PROFILES = {
  shallows: 'small',
  expanse: 'medium',
  'deep-field': 'large',
};

function cloneSessionProfile(profile) {
  return {
    ...profile,
  };
}

function profileIdForMap(mapId, worldScale) {
  if (MAP_SESSION_PROFILES[mapId]) return MAP_SESSION_PROFILES[mapId];
  if (worldScale >= 10) return 'large';
  if (worldScale >= 5) return 'medium';
  return 'small';
}

function getSessionProfile(mapId, worldScale) {
  const profileId = profileIdForMap(mapId, worldScale);
  return cloneSessionProfile(SESSION_PROFILES[profileId] || SESSION_PROFILES.small);
}

module.exports = {
  SESSION_PROFILE_FIELDS,
  CLIENT_PERF_PROFILES,
  SESSION_PROFILES,
  MAP_SESSION_PROFILES,
  getSessionProfile,
};
