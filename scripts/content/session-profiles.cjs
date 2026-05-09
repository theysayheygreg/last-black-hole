// CJS wrapper around the canonical JSON session-profile manifest. The
// matching ESM consumer is src/content/session-profiles.js. Both load
// the same JSON file so map/session-scale truth cannot drift.
const data = require("../../src/content/session-profiles.data.json");

const {
  SESSION_PROFILE_FIELDS,
  CLIENT_PERF_PROFILES,
  SESSION_PROFILES,
  MAP_SESSION_PROFILES,
} = data;

function cloneSessionProfile(profile) {
  return { ...profile };
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
