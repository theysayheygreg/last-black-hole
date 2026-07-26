// Session profile content manifest. Single canonical data lives in
// session-profiles.data.json. This module re-exports it for the ESM
// (browser) side; scripts/content/session-profiles.cjs is the matching
// CJS wrapper. Both load the same JSON so map/session-scale truth
// cannot drift between client and server.
import data from './session-profiles.data.json' with { type: 'json' };
import { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } from './map-scales.js';
import { MOVEMENT } from './movement.js';

export const SESSION_PROFILE_FIELDS = data.SESSION_PROFILE_FIELDS;
export const CLIENT_PERF_PROFILES = data.CLIENT_PERF_PROFILES;
// Profiles own transport/presentation budgets. The authority clock is injected
// from the movement manifest so no map profile can author gameplay fidelity.
export const SESSION_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(data.SESSION_PROFILES).map(([id, profile]) => [id, Object.freeze({
    ...profile,
    tickHz: MOVEMENT.authority.integrationHz,
  })]),
));
export const MAP_SESSION_PROFILES = Object.freeze(Object.fromEntries(
  PLAYABLE_MAP_IDS.map((mapId) => [mapId, MAP_SCALE_REGISTRY[mapId].profileId]),
));
