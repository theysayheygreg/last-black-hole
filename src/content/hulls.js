// Hull content manifest — ESM client wrapper around the canonical JSON.
// Server-side consumer is scripts/content/hulls.cjs. Both load the same
// JSON so hull definitions cannot drift between client and server.
import data from './hulls.data.json' with { type: 'json' };

export const RIG_TRACKS = data.RIG_TRACKS;
export const PROFILE_SHIP_TO_HULL = data.PROFILE_SHIP_TO_HULL;
export const HULL_DEFINITIONS = data.HULL_DEFINITIONS;
export const PERSONALITY_HULL_MAP = data.PERSONALITY_HULL_MAP;
