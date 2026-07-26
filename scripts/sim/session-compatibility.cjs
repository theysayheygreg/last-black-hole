const { MOVEMENT } = require("../content/movement.cjs");

const LEGACY_RATE_KEYS = Object.freeze([
  "worldTickHz",
  "portalTickHz",
  "growthTickHz",
  "scavengerTickHz",
  "waveTickHz",
  "fieldTickHz",
]);

const LEGACY_DIAGNOSTIC_KEYS = Object.freeze([
  "entityRelevanceRadius",
  "scavengerRelevanceRadius",
  "maxRelevantStarsPerPlayer",
  "maxRelevantPlanetoidsPerPlayer",
  "maxRelevantWrecksPerPlayer",
  "maxRelevantScavengersPerPlayer",
  "maxWellInfluencesPerPlayer",
  "maxWaveInfluencesPerPlayer",
  "maxPickupChecksPerPlayer",
  "maxPortalChecksPerPlayer",
]);

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function itemCount(container, key) {
  return Array.isArray(container?.[key]) ? container[key].length : 0;
}

function baseKey(key) {
  return `base${key[0].toUpperCase()}${key.slice(1)}`;
}

/**
 * Projects retired session fields for old readers. These are outbound
 * diagnostics, never inputs to authority selection or scheduling: their
 * values describe the whole current world that authority processes at 15 Hz.
 */
function getLegacySessionCompatibility({ worldScale, mapState, waveRings, includeBaseKeys = false } = {}) {
  const fullWorldRadius = finiteNonNegative(worldScale);
  const compatibility = {
    worldTickHz: MOVEMENT.authority.integrationHz,
    portalTickHz: MOVEMENT.authority.integrationHz,
    growthTickHz: MOVEMENT.authority.integrationHz,
    scavengerTickHz: MOVEMENT.authority.integrationHz,
    waveTickHz: MOVEMENT.authority.integrationHz,
    fieldTickHz: MOVEMENT.authority.integrationHz,
    entityRelevanceRadius: fullWorldRadius,
    scavengerRelevanceRadius: fullWorldRadius,
    maxRelevantStarsPerPlayer: itemCount(mapState, "stars"),
    maxRelevantPlanetoidsPerPlayer: itemCount(mapState, "planetoids"),
    maxRelevantWrecksPerPlayer: itemCount(mapState, "wrecks"),
    maxRelevantScavengersPerPlayer: itemCount(mapState, "scavengers"),
    maxWellInfluencesPerPlayer: itemCount(mapState, "wells"),
    maxWaveInfluencesPerPlayer: Array.isArray(waveRings)
      ? waveRings.length
      : itemCount(mapState, "waveRings"),
    maxPickupChecksPerPlayer: itemCount(mapState, "wrecks"),
    maxPortalChecksPerPlayer: itemCount(mapState, "portals"),
  };

  if (includeBaseKeys) {
    for (const key of [...LEGACY_RATE_KEYS, ...LEGACY_DIAGNOSTIC_KEYS]) {
      compatibility[baseKey(key)] = compatibility[key];
    }
  }
  return compatibility;
}

module.exports = {
  LEGACY_RATE_KEYS,
  LEGACY_DIAGNOSTIC_KEYS,
  getLegacySessionCompatibility,
};
