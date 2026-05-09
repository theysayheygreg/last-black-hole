// Session profile content manifest. Single canonical data lives in
// session-profiles.data.json. This module re-exports it for the ESM
// (browser) side; scripts/content/session-profiles.cjs is the matching
// CJS wrapper. Both load the same JSON so map/session-scale truth
// cannot drift between client and server.
import data from './session-profiles.data.json' with { type: 'json' };

export const SESSION_PROFILE_FIELDS = data.SESSION_PROFILE_FIELDS;
export const CLIENT_PERF_PROFILES = data.CLIENT_PERF_PROFILES;
export const SESSION_PROFILES = data.SESSION_PROFILES;
export const MAP_SESSION_PROFILES = data.MAP_SESSION_PROFILES;
