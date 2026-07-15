// CJS wrapper around the canonical JSON signature manifest. The matching
// ESM consumer is src/content/signatures.js. Both load the same JSON file
// so signatures cannot drift between client preview and authoritative sim.
const data = require("../../src/content/signatures.data.json");
const { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } = require("./map-scales.cjs");

const SIGNATURE_POOLS_BY_MAP_ID = data.SIGNATURE_POOLS_BY_MAP_ID;
const SIGNATURE_POOLS_BY_MAP_SIZE = Object.freeze(Object.fromEntries(
  PLAYABLE_MAP_IDS.map((mapId) => [
    MAP_SCALE_REGISTRY[mapId].dimensions.width,
    SIGNATURE_POOLS_BY_MAP_ID[mapId],
  ]),
));

module.exports = {
  SIGNATURE_DEFINITIONS: data.SIGNATURE_DEFINITIONS,
  SIGNATURE_POOLS_BY_MAP_ID,
  SIGNATURE_POOLS_BY_MAP_SIZE,
  LAYOUT_MULTIPLIERS: data.LAYOUT_MULTIPLIERS,
  SEEDED_SIGNATURES: data.SEEDED_SIGNATURES,
};
