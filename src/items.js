/**
 * items.js — local item catalog facade and loot generation.
 *
 * The authoritative T1-T4 catalog lives in seeded-generation.js so browser
 * preview and server-seeded runs share item truth. This module wraps that
 * catalog in the local inventory shape: category, subcategory, instance id,
 * source, tier gates, wreck-type slot counts, and wreck-age value scaling.
 */

import {
  ITEM_CATALOG,
  CONSUMABLE_CATALOG,
  LOOT_TIER_GATES,
  LOOT_TIER_WEIGHTS,
  availableTiers as catalogAvailableTiers,
} from './seeded-generation.js';
import { BALANCE, wreckAgeValueMultiplier as balanceWreckAgeValueMultiplier } from './content/balance.js';

// ---- Unique ID generator ----

let _itemIdCounter = 0;
function nextItemId(prefix = 'item') {
  return `${prefix}_${++_itemIdCounter}_${Date.now().toString(36)}`;
}

// ---- Catalog constants ----

const WRECK_AGE_VALUE_CAP = BALANCE.loot.wreckAgeValueCap;
const WRECK_AGE_CAP_SECONDS = BALANCE.loot.wreckAgeCapSeconds;
const LEGACY_WRECK_TIER_SESSION_TIME = {
  1: LOOT_TIER_GATES[1],
  2: LOOT_TIER_GATES[2],
  3: LOOT_TIER_GATES[3],
  4: LOOT_TIER_GATES[4],
};

// Keep consumables to effects currently handled by local/remote runtime code.
// Signal coefficient artifacts stay enabled because PlayerBrain resolves them,
// but signal consumables remain out until their effects do real work.
const IMPLEMENTED_CONSUMABLE_EFFECTS = new Set([
  'shieldBurst',
  'timeSlowLocal',
  'breachFlare',
  'fuelRefill',
]);

const WRECK_SLOT_COUNTS = {
  derelict: [1, 3],
  debris: [1, 2],
  vault: [3, 5],
};

const WRECK_TIER_BONUS = {
  derelict: 0,
  debris: 0,
  vault: 1,
};

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function valueInRange(range) {
  return Math.round(range[0] + Math.random() * (range[1] - range[0]));
}

function coefficientSummary(coefficients = {}) {
  const entries = Object.entries(coefficients);
  if (entries.length === 0) return '';
  return entries
    .map(([key, value]) => {
      if (key === 'cargoSlots') return `${key} +${value}`;
      return `${key} x${Number(value).toFixed(2)}`;
    })
    .join(', ');
}

function normalizeTier(tier) {
  const n = Number(tier);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(4, Math.floor(n)));
}

function sessionTimeForLegacyWreckTier(wreckTier) {
  const tier = normalizeTier(wreckTier);
  return LEGACY_WRECK_TIER_SESSION_TIME[tier] ?? 0;
}

function normalizeGenerationOptions(wreckTier, sourceName, count, options) {
  if (sourceName && typeof sourceName === 'object') {
    return { ...sourceName };
  }
  const opts = options && typeof options === 'object' ? { ...options } : {};
  if (sourceName !== undefined) opts.sourceName = sourceName;
  if (count !== undefined) opts.count = count;
  if (opts.sessionTime === undefined) {
    opts.sessionTime = sessionTimeForLegacyWreckTier(wreckTier);
  }
  return opts;
}

export function availableLootTiers(sessionTime = 0) {
  return catalogAvailableTiers(Math.max(0, Number(sessionTime) || 0));
}

export function wreckAgeValueMultiplier(spawnTime = 0, currentTime = spawnTime) {
  return balanceWreckAgeValueMultiplier(spawnTime, currentTime);
}

export function applyWreckAgeValue(item, multiplier = 1.0) {
  if (!item || !Number.isFinite(multiplier) || multiplier <= 1.0) return item;
  const baseValue = Number.isFinite(item.baseValue) ? item.baseValue : (Number(item.value) || 0);
  item.baseValue = baseValue;
  item.value = Math.round(baseValue * Math.min(WRECK_AGE_VALUE_CAP, multiplier));
  item.valueMultiplier = Math.min(WRECK_AGE_VALUE_CAP, multiplier);
  return item;
}

export function rollLootTier(sessionTime = 0, wreckTier = 1) {
  const tiers = availableLootTiers(sessionTime);
  const maxTier = Math.min(4, Math.max(...tiers) + (WRECK_TIER_BONUS.derelict || 0));
  const eligible = tiers.filter(t => t <= maxTier);
  const coreBias = Math.max(0, normalizeTier(wreckTier) - 1);

  let total = 0;
  for (const tier of eligible) {
    const highTierBias = tier >= 3 ? 1 + coreBias * 0.25 : 1;
    total += (LOOT_TIER_WEIGHTS[tier] || 0) * highTierBias;
  }

  let roll = Math.random() * total;
  for (const tier of eligible) {
    const highTierBias = tier >= 3 ? 1 + coreBias * 0.25 : 1;
    roll -= (LOOT_TIER_WEIGHTS[tier] || 0) * highTierBias;
    if (roll <= 0) return tier;
  }
  return eligible[0] || 1;
}

function instantiateArtifact(entry, sourceName) {
  const value = valueInRange(entry.value);
  return {
    ...entry,
    id: nextItemId('item'),
    catalogId: entry.id,
    category: 'artifact',
    subcategory: 'equippable',
    value,
    baseValue: value,
    source: sourceName || null,
    effectDesc: coefficientSummary(entry.coefficients) || entry.special || '',
  };
}

function instantiateConsumable(entry, sourceName) {
  const value = valueInRange(entry.value);
  return {
    ...entry,
    id: nextItemId('cons'),
    catalogId: entry.id,
    category: 'artifact',
    subcategory: 'consumable',
    value,
    baseValue: value,
    source: sourceName || null,
    useEffect: entry.effect,
    useDesc: entry.effect,
    charges: 1,
  };
}

function rollArtifact(sessionTime, wreckTier, sourceName) {
  const tier = rollLootTier(sessionTime, wreckTier);
  const pool = ITEM_CATALOG[tier] || ITEM_CATALOG[1];
  return instantiateArtifact(pick(pool), sourceName);
}

function rollConsumable(sessionTime, sourceName) {
  const maxTier = Math.max(...availableLootTiers(sessionTime));
  const pool = CONSUMABLE_CATALOG
    .filter(item => item.tier <= maxTier && IMPLEMENTED_CONSUMABLE_EFFECTS.has(item.effect));
  if (pool.length === 0) return null;
  return instantiateConsumable(pick(pool), sourceName);
}

// ---- Public API ----

/**
 * Generate loot items for a wreck.
 *
 * Compatibility is preserved for generateLoot(wreckType, wreckTier), plus the
 * previous sourceName/count parameters. New callers can pass an options object:
 * generateLoot(type, tier, { sessionTime, sourceName, count, consumableChance }).
 */
export function generateLoot(wreckType = 'derelict', wreckTier = 1, sourceName, count, options) {
  const opts = normalizeGenerationOptions(wreckTier, sourceName, count, options);
  const type = WRECK_SLOT_COUNTS[wreckType] ? wreckType : 'derelict';
  const slotRange = WRECK_SLOT_COUNTS[type];
  const itemCount = Number.isFinite(opts.count) ? Math.max(0, Math.floor(opts.count)) : randomInt(slotRange[0], slotRange[1]);
  const sessionTime = Math.max(0, Number(opts.sessionTime) || 0);
  const effectiveWreckTier = Math.min(4, normalizeTier(wreckTier) + (WRECK_TIER_BONUS[type] || 0));
  const consumableChance = Number.isFinite(opts.consumableChance) ? opts.consumableChance : 0.4;
  const items = [];

  for (let i = 0; i < itemCount; i++) {
    items.push(rollArtifact(sessionTime, effectiveWreckTier, opts.sourceName));
  }

  if (Math.random() < consumableChance) {
    const consumable = rollConsumable(sessionTime, opts.sourceName);
    if (consumable) items.push(consumable);
  }

  return items;
}

/**
 * Generate a single item of a specific local category for tests/rewards.
 */
export function generateItem(category = 'artifact', wreckTier = 1, sourceName, options) {
  const opts = normalizeGenerationOptions(wreckTier, sourceName, 1, options);
  if (category === 'consumable') return rollConsumable(opts.sessionTime, opts.sourceName);
  return rollArtifact(opts.sessionTime, wreckTier, opts.sourceName);
}

export const ITEM_CATALOG_BY_TIER = ITEM_CATALOG;
export const LOOT_ECONOMY = {
  tierGates: LOOT_TIER_GATES,
  tierWeights: LOOT_TIER_WEIGHTS,
  wreckAgeCapSeconds: WRECK_AGE_CAP_SECONDS,
  wreckAgeValueCap: WRECK_AGE_VALUE_CAP,
};

// ---- Category display info ----

export const CATEGORY_COLORS = {
  salvage:   'rgba(180, 180, 190, 0.9)',
  component: 'rgba(100, 200, 255, 0.9)',
  dataCore:  'rgba(200, 160, 255, 0.9)',
  artifact:  'rgba(255, 200, 60, 0.9)',
};

export const TIER_COLORS = {
  1: 'rgba(180, 180, 190, 0.8)',
  2: 'rgba(100, 255, 150, 0.9)',
  3: 'rgba(100, 180, 255, 0.9)',
  4: 'rgba(255, 215, 0, 0.95)',
  common:   'rgba(180, 180, 190, 0.8)',
  uncommon: 'rgba(100, 255, 150, 0.9)',
  rare:     'rgba(100, 180, 255, 0.9)',
  unique:   'rgba(255, 215, 0, 0.95)',
};

export const CATEGORY_LABELS = {
  salvage:   'salvage',
  component: 'component',
  dataCore:  'data core',
  artifact:  'artifact',
};
