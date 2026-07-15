// CJS wrapper around the canonical JSON session-profile manifest. The
// matching ESM consumer is src/content/session-profiles.js. Both load
// the same JSON file so map/session-scale truth cannot drift.
const data = require("../../src/content/session-profiles.data.json");
const { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } = require("./map-scales.cjs");

const {
  SESSION_PROFILE_FIELDS,
  CLIENT_PERF_PROFILES,
  SESSION_PROFILES,
} = data;

const MAP_SESSION_PROFILES = Object.freeze(Object.fromEntries(
  PLAYABLE_MAP_IDS.map((mapId) => [mapId, MAP_SCALE_REGISTRY[mapId].profileId]),
));

function cloneSessionProfile(profile) {
  return { ...profile };
}

function profileIdForMap(mapId, worldScale) {
  if (MAP_SESSION_PROFILES[mapId]) return MAP_SESSION_PROFILES[mapId];
  const scale = Number(worldScale);
  const fallback = PLAYABLE_MAP_IDS
    .map((id) => MAP_SCALE_REGISTRY[id])
    .sort((a, b) => a.dimensions.width - b.dimensions.width)
    .find((definition) => definition.dimensions.width >= scale);
  return fallback?.profileId || MAP_SCALE_REGISTRY[PLAYABLE_MAP_IDS.at(-1)].profileId;
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
