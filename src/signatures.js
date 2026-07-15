/**
 * signatures.js — seeded run briefing and cosmic-signature helpers.
 *
 * buildRunBriefing() is the live preview contract. It consumes the same named
 * RNG streams as the authoritative sim, using the selected map's real entity
 * counts. The older template helpers remain available for design experiments,
 * but they do not describe a launched authoritative run.
 *
 * Selection: rollSignature(mapIdOrScale) picks a random signature from the
 * canonical map-id pool, with streak protection (never
 * the same signature twice in a row).
 *
 * Application: applySignatureConfig() deep-merges the signature's config
 * overrides into the global CONFIG object. Only specified keys change;
 * everything else stays at its default.
 *
 * Layout: signatures declare qualitative layout hints (wellSpread,
 * wreckDensity, portalCount, scavengerCount). Map generation converts
 * these to numeric multipliers via LAYOUT_MULTIPLIERS.
 */

import { CONFIG } from './config.js';
import { createRNGStreams } from './rng-stream.js';
import { generateWreckLoot, pickCosmicSignature, WELL_NAMES } from './seeded-generation.js';
import {
  SIGNATURE_DEFINITIONS,
  SIGNATURE_POOLS_BY_MAP_ID,
  SIGNATURE_POOLS_BY_MAP_SIZE,
  LAYOUT_MULTIPLIERS,
} from './content/signatures.js';
import { MAP_SCALE_REGISTRY } from './content/map-scales.js';

export { SIGNATURE_DEFINITIONS, SIGNATURE_POOLS_BY_MAP_ID, SIGNATURE_POOLS_BY_MAP_SIZE, LAYOUT_MULTIPLIERS };

function cloneRoute(route) {
  return route ? JSON.parse(JSON.stringify(route)) : null;
}

/**
 * Build the exact seeded facts shown before launch.
 *
 * Named RNG streams make unrelated generation order irrelevant. The explicit
 * burns below only mirror calls made on the same stream by applyRunSeed().
 */
export function buildRunBriefing(map, seed) {
  const runSeed = Number.isFinite(Number(seed)) ? Number(seed) : 1;
  const rng = createRNGStreams(runSeed);
  const wellCount = Array.isArray(map?.wells) ? map.wells.length : 0;
  const wreckCount = Array.isArray(map?.wrecks) ? map.wrecks.length : 0;
  const wellNames = [];

  for (let i = 0; i < wellCount; i++) {
    rng.range('wellMass', 0.85, 1.15);
    rng.range('wellGrowth', 0.80, 1.20);
    rng.float('wellDir');
    wellNames.push(rng.pick('wellNames', WELL_NAMES));
  }

  const lootQualityBias = rng.range('qualityBias', 0.8, 1.2);
  const signature = pickCosmicSignature(rng.rawStream('signature'));

  // Initial wrecks use their own stream and a neutral quality bias in the sim.
  // Keeping the full per-wreck list lets tests compare preview and snapshot.
  const initialLootStream = rng.rawStream('initialWreckLoot');
  const initialWrecks = [];
  for (let i = 0; i < wreckCount; i++) {
    const slots = 1 + Math.floor(initialLootStream() * 2);
    initialWrecks.push({
      index: i,
      loot: generateWreckLoot(initialLootStream, 0, slots, 1.0),
    });
  }

  const route = cloneRoute(map?.route);
  return {
    seed: runSeed,
    mapId: map?.id || null,
    mapName: map?.name || 'Unknown Route',
    worldScale: Number(map?.worldScale) || 1,
    wellCount,
    wreckCount,
    wellNames,
    signature: signature ? { ...signature } : null,
    lootQualityBias,
    initialWrecks,
    sampleLoot: initialWrecks.flatMap((wreck) => wreck.loot).slice(0, 4),
    route,
    objective: route?.objective || 'survey the fabric and find a viable exit.',
  };
}

// ---- Dormant template selection ----

let _lastSignature = null;

/**
 * Roll a cosmic signature appropriate for the given map scale.
 * Streak protection: never the same signature twice in a row.
 *
 * @param {number} mapScale — WORLD_SCALE of the map (3, 5, or 10)
 * @returns {{ name, flavor, mechanical, config, layout }}
 */
export function rollSignature(mapIdOrScale, rng = Math.random) {
  const mapId = typeof mapIdOrScale === 'string'
    ? mapIdOrScale
    : Object.entries(MAP_SCALE_REGISTRY).find(([, definition]) => (
      definition.dimensions.width === Number(mapIdOrScale)
    ))?.[0];
  const ids = SIGNATURE_POOLS_BY_MAP_ID[mapId] || [];
  const signatures = ids.map(id => SIGNATURE_DEFINITIONS[id]).filter(Boolean);
  const pool = signatures.filter(s => s.id !== _lastSignature);

  if (pool.length === 0) {
    // Fallback: allow repeat if streak filter emptied the pool
    const fallback = signatures;
    const sig = fallback[Math.floor(rng() * fallback.length)];
    _lastSignature = sig.id;
    return sig;
  }

  const sig = pool[Math.floor(rng() * pool.length)];
  _lastSignature = sig.id;
  return sig;
}

// ---- Config application ----

/**
 * Apply a signature's config overrides to the global CONFIG.
 * Deep-merges: only overrides specified keys, leaves others untouched.
 *
 * Call this at the start of each run, after rollSignature().
 */
export function applySignatureConfig(signature) {
  if (!signature || !signature.config) return;
  for (const [section, overrides] of Object.entries(signature.config)) {
    if (CONFIG[section]) {
      Object.assign(CONFIG[section], overrides);
    }
  }
}

/**
 * Get the numeric multiplier/offset for a layout key.
 * Returns 1 (neutral) if the key or value is unknown.
 *
 * @param {string} key   — 'wreckDensity' | 'portalCount' | 'scavengerCount'
 * @param {string} value — 'sparse' | 'normal' | 'dense' | 'low' | 'high'
 * @returns {number}
 */
export function getLayoutMultiplier(key, value) {
  const table = LAYOUT_MULTIPLIERS[key];
  return table ? (table[value] ?? 1) : 1;
}
