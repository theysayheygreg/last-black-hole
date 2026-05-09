// CJS wrapper around the canonical JSON signature manifest. The matching
// ESM consumer is src/content/signatures.js. Both load the same JSON file
// so signatures cannot drift between client preview and authoritative sim.
const data = require("../../src/content/signatures.data.json");

module.exports = {
  SIGNATURE_DEFINITIONS: data.SIGNATURE_DEFINITIONS,
  SIGNATURE_POOLS_BY_MAP_SIZE: data.SIGNATURE_POOLS_BY_MAP_SIZE,
  LAYOUT_MULTIPLIERS: data.LAYOUT_MULTIPLIERS,
  SEEDED_SIGNATURES: data.SEEDED_SIGNATURES,
};
