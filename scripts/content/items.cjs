// CJS wrapper around the canonical JSON item catalog. The matching ESM
// consumer is src/content/items.js. Both load the same JSON file so the
// catalog cannot drift between client preview and authoritative sim.
const data = require("../../src/content/items.data.json");

module.exports = {
  ARTIFACT_SPECIAL_IDS: data.ARTIFACT_SPECIAL_IDS,
  CONSUMABLE_EFFECT_IDS: data.CONSUMABLE_EFFECT_IDS,
  ITEM_CATALOG: data.ITEM_CATALOG,
  CONSUMABLE_CATALOG: data.CONSUMABLE_CATALOG,
};
