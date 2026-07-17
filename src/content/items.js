// Single canonical item catalog data lives in items.data.json. This module
// re-exports it for the ESM (browser) side; scripts/content/items.cjs is
// the matching CJS wrapper for the Node sim. Both files load the same JSON
// so the catalog cannot drift between client and server.
import data from './items.data.json' with { type: 'json' };

export const ARTIFACT_SPECIAL_IDS = data.ARTIFACT_SPECIAL_IDS;
export const CONSUMABLE_EFFECT_IDS = data.CONSUMABLE_EFFECT_IDS;
export const RETIRED_CONSUMABLE_IDS = data.RETIRED_CONSUMABLE_IDS;
export const RETIRED_CONSUMABLE_EFFECT_IDS = data.RETIRED_CONSUMABLE_EFFECT_IDS;
export const ITEM_CATALOG = data.ITEM_CATALOG;
export const CONSUMABLE_CATALOG = data.CONSUMABLE_CATALOG;

const RETIRED_ITEM_IDS = new Set([...RETIRED_CONSUMABLE_IDS, ...RETIRED_CONSUMABLE_EFFECT_IDS]);

export function isRetiredItem(item) {
  if (!item) return false;
  return RETIRED_ITEM_IDS.has(item.catalogId) || RETIRED_ITEM_IDS.has(item.id)
    || RETIRED_ITEM_IDS.has(item.useEffect) || RETIRED_ITEM_IDS.has(item.effect);
}

export function sanitizeRetiredItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => (item && !isRetiredItem(item) ? { ...item } : null));
}
