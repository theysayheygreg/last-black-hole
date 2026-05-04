/**
 * signatures.js — cosmic signatures. Per-run universe personality.
 *
 * Each signature defines flavor text, config overrides, and layout hints
 * that shape a run's feel. Pure data + selection logic — no audio or
 * visual dependencies.
 *
 * Selection: rollSignature(mapScale) picks a random signature whose
 * mapSizes includes the current scale, with streak protection (never
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
import {
  SIGNATURE_DEFINITIONS,
  SIGNATURE_POOLS_BY_MAP_SIZE,
  LAYOUT_MULTIPLIERS,
} from './content/signatures.js';

export { SIGNATURE_DEFINITIONS, SIGNATURE_POOLS_BY_MAP_SIZE, LAYOUT_MULTIPLIERS };

// ---- Selection ----

let _lastSignature = null;

/**
 * Roll a cosmic signature appropriate for the given map scale.
 * Streak protection: never the same signature twice in a row.
 *
 * @param {number} mapScale — WORLD_SCALE of the map (3, 5, or 10)
 * @returns {{ name, flavor, mechanical, config, layout }}
 */
export function rollSignature(mapScale, rng = Math.random) {
  const ids = SIGNATURE_POOLS_BY_MAP_SIZE[mapScale] || [];
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
