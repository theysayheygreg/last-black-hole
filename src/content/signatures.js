// Signature content manifest. Single canonical data lives in
// signatures.data.json. This module re-exports it for the ESM (browser)
// side; scripts/content/signatures.cjs is the matching CJS wrapper for
// the Node sim. Both load the same JSON so signatures cannot drift.
import data from './signatures.data.json' with { type: 'json' };

export const SIGNATURE_DEFINITIONS = data.SIGNATURE_DEFINITIONS;
export const SIGNATURE_POOLS_BY_MAP_SIZE = data.SIGNATURE_POOLS_BY_MAP_SIZE;
export const LAYOUT_MULTIPLIERS = data.LAYOUT_MULTIPLIERS;
export const SEEDED_SIGNATURES = data.SEEDED_SIGNATURES;
