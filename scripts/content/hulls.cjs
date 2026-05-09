// CJS wrapper around the canonical JSON hull manifest. The data lives in
// src/content/hulls.data.json so future client mirroring and validation
// stay in lockstep with the server. No client ESM consumer yet, but the
// JSON is in src/content/ so it's accessible if/when one shows up.
const data = require("../../src/content/hulls.data.json");

module.exports = {
  RIG_TRACKS: data.RIG_TRACKS,
  PROFILE_SHIP_TO_HULL: data.PROFILE_SHIP_TO_HULL,
  HULL_DEFINITIONS: data.HULL_DEFINITIONS,
  PERSONALITY_HULL_MAP: data.PERSONALITY_HULL_MAP,
};
