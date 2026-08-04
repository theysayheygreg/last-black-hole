// CJS wrapper around the canonical JSON item catalog. The matching ESM
// consumer is src/content/items.js. Both load the same JSON file so the
// catalog cannot drift between client preview and authoritative sim.
const data = require("../../src/content/items.data.json");
const RETIRED_ITEM_IDS = new Set([
  ...data.RETIRED_ARTIFACT_IDS,
  ...data.RETIRED_CONSUMABLE_IDS,
  ...data.RETIRED_CONSUMABLE_EFFECT_IDS,
]);

module.exports = {
  ARTIFACT_SPECIAL_IDS: data.ARTIFACT_SPECIAL_IDS,
  CONSUMABLE_EFFECT_IDS: data.CONSUMABLE_EFFECT_IDS,
  RETIRED_CONSUMABLE_IDS: data.RETIRED_CONSUMABLE_IDS,
  RETIRED_CONSUMABLE_EFFECT_IDS: data.RETIRED_CONSUMABLE_EFFECT_IDS,
  RETIRED_ARTIFACT_IDS: data.RETIRED_ARTIFACT_IDS,
  ITEM_CATALOG: data.ITEM_CATALOG,
  CONSUMABLE_CATALOG: data.CONSUMABLE_CATALOG,
  isRetiredItem(item) {
    if (!item) return false;
    return RETIRED_ITEM_IDS.has(item.catalogId) || RETIRED_ITEM_IDS.has(item.id)
      || RETIRED_ITEM_IDS.has(item.useEffect) || RETIRED_ITEM_IDS.has(item.effect);
  },
  sanitizeRetiredItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => (item && !module.exports.isRetiredItem(item) ? { ...item } : null));
  },
};
