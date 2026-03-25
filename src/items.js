/**
 * items.js — Item catalog, categories, and generation.
 *
 * Four categories: salvage, component, dataCore, artifact.
 * Artifacts split into equippable (passive ship effects) and consumable (one-use hotbar).
 * Components are specific — each maps to a single upgrade tier.
 *
 * Generation: generateLoot(wreckType, wreckTier) returns an array of items
 * using the 80/20 primary/secondary loot table mapping.
 */

// ---- Unique ID generator ----

let _itemIdCounter = 0;
function nextItemId() {
  return `item_${++_itemIdCounter}_${Date.now().toString(36)}`;
}

// ---- Helpers ----

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

// ---- Category: Salvage ----
// Sell for exotic matter. Name + tier + value. No special properties.

const SALVAGE_CATALOG = [
  { name: 'Exotic Fragment',   tiers: ['common', 'uncommon'] },
  { name: 'Void Residue',      tiers: ['common'] },
  { name: 'Stellar Alloy',     tiers: ['uncommon', 'rare'] },
  { name: 'Phase Crystal',     tiers: ['uncommon', 'rare'] },
  { name: 'Entropic Dust',     tiers: ['common'] },
  { name: 'Dark Matter Trace', tiers: ['rare'] },
  { name: 'Temporal Slag',     tiers: ['common', 'uncommon'] },
  { name: 'Prismatic Ore',     tiers: ['rare', 'unique'] },
];

// ---- Category: Components ----
// Each maps to a specific upgrade. upgradeTarget format: 'system.tier'

const COMPONENT_CATALOG = [
  { name: 'Quantum Coil',       upgradeTarget: 'thrust.2',   tier: 'uncommon' },
  { name: 'Fusion Core',        upgradeTarget: 'thrust.3',   tier: 'rare' },
  { name: 'Reactive Plating',   upgradeTarget: 'hull.2',     tier: 'uncommon' },
  { name: 'Neutronium Shell',   upgradeTarget: 'hull.3',     tier: 'rare' },
  { name: 'Flow Capacitor',     upgradeTarget: 'coupling.2', tier: 'uncommon' },
  { name: 'Current Amplifier',  upgradeTarget: 'coupling.3', tier: 'rare' },
  { name: 'Friction Nullifier', upgradeTarget: 'drag.2',     tier: 'uncommon' },
  { name: 'Inertia Dampener',   upgradeTarget: 'drag.3',     tier: 'rare' },
  { name: 'Resonance Array',    upgradeTarget: 'sensor.2',   tier: 'uncommon' },
  { name: 'Deep Field Lens',    upgradeTarget: 'sensor.3',   tier: 'rare' },
];

// ---- Category: Data Cores ----
// Faction currency + map intel.

const DATA_CORE_CATALOG = [
  { name: 'Navigation Archive', tier: 'uncommon', use: 'mapIntel',       desc: 'reveals wreck positions next run' },
  { name: 'Civilization Record', tier: 'common',  use: 'factionRep',     faction: 'collectors', desc: 'valued by the Collectors' },
  { name: 'Tactical Scan',      tier: 'uncommon', use: 'factionRep',     faction: 'reapers',    desc: 'valued by the Reapers' },
  { name: 'Breach Frequency',   tier: 'rare',     use: 'factionRep',     faction: 'wardens',    desc: 'valued by the Wardens' },
];

// ---- Category: Artifacts (Equippable) ----
// Passive effects. Equip in ship slots before a run.

const EQUIPPABLE_CATALOG = [
  { name: 'Entropic Lens',   effect: 'showKillRadii',  effectDesc: 'reveals well kill zones',              tier: 'rare' },
  { name: 'Current Whisper',  effect: 'showFlowArrows', effectDesc: 'shows flow direction near ship',       tier: 'rare' },
  { name: 'Signal Shroud',    effect: 'signalDampen',   effectDesc: '-15% signal from all sources',         tier: 'unique' },
  { name: 'Gravity Anchor',   effect: 'reduceWellPull', effectDesc: '-20% well pull (wider slingshot margin)', tier: 'unique' },
];

// ---- Category: Artifacts (Consumable) ----
// One-use during a run. D-pad to activate.

const CONSUMABLE_CATALOG = [
  { name: 'Temporal Seed',  useEffect: 'timeSlowLocal',  useDesc: 'slows local spacetime for 3s',           tier: 'rare' },
  { name: 'Signal Purge',   useEffect: 'signalPurge',    useDesc: 'instantly drops signal to 0%',            tier: 'rare' },
  { name: 'Shield Burst',   useEffect: 'shieldBurst',    useDesc: 'survive one well or fauna contact',       tier: 'unique' },
  { name: 'Breach Flare',   useEffect: 'breachFlare',    useDesc: 'forces a temporary portal for 15s',       tier: 'unique' },
];

// ---- Tier → value ranges ----

const TIER_VALUES = {
  common:   { min: 15,  max: 40 },
  uncommon: { min: 60,  max: 120 },
  rare:     { min: 180, max: 300 },
  unique:   { min: 400, max: 650 },
};

function rollValue(tier) {
  const range = TIER_VALUES[tier] || TIER_VALUES.common;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

// ---- Tier rolling by wreck tier ----
// Wreck tier 1 (surface/safe) → mostly common
// Wreck tier 2 (deep/mid) → uncommon+
// Wreck tier 3 (core/near wells) → rare+

function rollTier(wreckTier) {
  const roll = Math.random();
  if (wreckTier >= 3) {
    if (roll < 0.15) return 'unique';
    if (roll < 0.55) return 'rare';
    return 'uncommon';
  }
  if (wreckTier >= 2) {
    if (roll < 0.05) return 'rare';
    if (roll < 0.40) return 'uncommon';
    return 'common';
  }
  // Tier 1
  if (roll < 0.02) return 'rare';
  if (roll < 0.20) return 'uncommon';
  return 'common';
}

// ---- Item generators per category ----

function generateSalvage(wreckTier, sourceName) {
  const tier = rollTier(wreckTier);
  // Pick from catalog entries that include this tier
  const candidates = SALVAGE_CATALOG.filter(s => s.tiers.includes(tier));
  // Fallback: pick any and use the rolled tier anyway
  const entry = candidates.length > 0 ? pick(candidates) : pick(SALVAGE_CATALOG);
  return {
    id: nextItemId(),
    category: 'salvage',
    subcategory: null,
    name: entry.name,
    tier,
    value: rollValue(tier),
    source: sourceName,
  };
}

function generateComponent(wreckTier, sourceName) {
  const tier = rollTier(wreckTier);
  // Filter to components at or below the rolled tier
  const tierOrder = ['common', 'uncommon', 'rare', 'unique'];
  const maxIdx = tierOrder.indexOf(tier);
  const candidates = COMPONENT_CATALOG.filter(c => tierOrder.indexOf(c.tier) <= maxIdx);
  if (candidates.length === 0) return generateSalvage(wreckTier, sourceName); // fallback
  const entry = pick(candidates);
  return {
    id: nextItemId(),
    category: 'component',
    subcategory: null,
    name: entry.name,
    tier: entry.tier,
    value: rollValue(entry.tier),
    source: sourceName,
    upgradeTarget: entry.upgradeTarget,
  };
}

function generateDataCore(wreckTier, sourceName) {
  const tier = rollTier(wreckTier);
  const tierOrder = ['common', 'uncommon', 'rare', 'unique'];
  const maxIdx = tierOrder.indexOf(tier);
  const candidates = DATA_CORE_CATALOG.filter(c => tierOrder.indexOf(c.tier) <= maxIdx);
  if (candidates.length === 0) return generateSalvage(wreckTier, sourceName);
  const entry = pick(candidates);
  return {
    id: nextItemId(),
    category: 'dataCore',
    subcategory: null,
    name: entry.name,
    tier: entry.tier,
    value: rollValue(entry.tier),
    source: sourceName,
    use: entry.use,
    faction: entry.faction || null,
    desc: entry.desc,
  };
}

function generateArtifact(wreckTier, sourceName) {
  // 50/50 equippable vs consumable
  if (Math.random() < 0.5) {
    return generateEquippable(wreckTier, sourceName);
  }
  return generateConsumable(wreckTier, sourceName);
}

function generateEquippable(wreckTier, sourceName) {
  const entry = pick(EQUIPPABLE_CATALOG);
  return {
    id: nextItemId(),
    category: 'artifact',
    subcategory: 'equippable',
    name: entry.name,
    tier: entry.tier,
    value: rollValue(entry.tier),
    source: sourceName,
    effect: entry.effect,
    effectDesc: entry.effectDesc,
  };
}

function generateConsumable(wreckTier, sourceName) {
  const entry = pick(CONSUMABLE_CATALOG);
  return {
    id: nextItemId(),
    category: 'artifact',
    subcategory: 'consumable',
    name: entry.name,
    tier: entry.tier,
    value: rollValue(entry.tier),
    source: sourceName,
    useEffect: entry.useEffect,
    useDesc: entry.useDesc,
    charges: 1,
  };
}

// ---- Category generators map ----

const CATEGORY_GENERATORS = {
  salvage: generateSalvage,
  component: generateComponent,
  dataCore: generateDataCore,
  artifact: generateArtifact,
};

// ---- Loot table: wreck type → category weights ----
// Primary (80%) and secondary (20%)

const LOOT_TABLES = {
  derelict: {
    primary:   [{ cat: 'salvage', weight: 6 }, { cat: 'component', weight: 2 }],
    secondary: [{ cat: 'component', weight: 3 }, { cat: 'dataCore', weight: 1 }],
  },
  debris: {
    primary:   [{ cat: 'salvage', weight: 8 }],
    secondary: [{ cat: 'salvage', weight: 8 }],  // debris is mostly junk
  },
  vault: {
    primary:   [{ cat: 'component', weight: 4 }, { cat: 'dataCore', weight: 3 }],
    secondary: [{ cat: 'artifact', weight: 5 }, { cat: 'component', weight: 2 }],
  },
};

function pickCategory(table) {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry.cat;
  }
  return table[table.length - 1].cat;
}

// ---- Public API ----

/**
 * Generate loot items for a wreck.
 * @param {string} wreckType — 'derelict' | 'debris' | 'vault'
 * @param {number} wreckTier — 1 (surface), 2 (deep), 3 (core)
 * @param {string} sourceName — wreck name for provenance tracking
 * @param {number} [count] — override item count (otherwise rolled from type)
 * @returns {Array} array of item objects
 */
export function generateLoot(wreckType, wreckTier, sourceName, count) {
  const table = LOOT_TABLES[wreckType] || LOOT_TABLES.derelict;

  // Roll item count if not specified
  if (count === undefined) {
    if (wreckType === 'vault') count = 3 + Math.floor(Math.random() * 3);
    else if (wreckType === 'debris') count = 1 + Math.floor(Math.random() * 2);
    else count = 1 + Math.floor(Math.random() * 3);
  }

  const items = [];
  for (let i = 0; i < count; i++) {
    // 80% primary, 20% secondary
    const isPrimary = Math.random() < 0.8;
    const category = pickCategory(isPrimary ? table.primary : table.secondary);
    const generator = CATEGORY_GENERATORS[category] || generateSalvage;
    items.push(generator(wreckTier, sourceName));
  }
  return items;
}

/**
 * Generate a single item of a specific category (for testing/rewards).
 */
export function generateItem(category, wreckTier, sourceName) {
  const generator = CATEGORY_GENERATORS[category] || generateSalvage;
  return generator(wreckTier, sourceName);
}

// ---- Category display info ----

export const CATEGORY_COLORS = {
  salvage:   'rgba(180, 180, 190, 0.9)',   // grey-white
  component: 'rgba(100, 200, 255, 0.9)',   // cyan
  dataCore:  'rgba(200, 160, 255, 0.9)',   // purple
  artifact:  'rgba(255, 200, 60, 0.9)',    // gold
};

export const TIER_COLORS = {
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
