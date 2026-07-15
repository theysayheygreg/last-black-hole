// Signature content manifest. Single canonical data lives in
// signatures.data.json. This module re-exports it for the ESM (browser)
// side; scripts/content/signatures.cjs is the matching CJS wrapper for
// the Node sim. Both load the same JSON so signatures cannot drift.
import data from './signatures.data.json' with { type: 'json' };
import { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } from './map-scales.js';

export const SIGNATURE_DEFINITIONS = data.SIGNATURE_DEFINITIONS;
export const SIGNATURE_POOLS_BY_MAP_ID = data.SIGNATURE_POOLS_BY_MAP_ID;
export const SIGNATURE_POOLS_BY_MAP_SIZE = Object.freeze(Object.fromEntries(
  PLAYABLE_MAP_IDS.map((mapId) => [
    MAP_SCALE_REGISTRY[mapId].dimensions.width,
    SIGNATURE_POOLS_BY_MAP_ID[mapId],
  ]),
));
export const LAYOUT_MULTIPLIERS = data.LAYOUT_MULTIPLIERS;
export const SEEDED_SIGNATURES = data.SEEDED_SIGNATURES;
