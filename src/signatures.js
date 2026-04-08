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

// ---- Signature definitions ----

const SIGNATURES = {
  'the slow tide': {
    name: 'the slow tide',
    flavor: 'currents run long here. take your time — spacetime will not.',
    mechanical: 'low gravity / high drift / extended collapse',
    mapSizes: [3, 5],
    config: {
      fluid: { viscosity: 0.00008 },
      wells: { gravity: 0.0012 },
      universe: { runDuration: 540 },
      events: { growthInterval: 55 },
    },
    layout: {
      wellSpread: 'wide',
      wreckDensity: 'normal',
      portalCount: 'normal',
      scavengerCount: 'normal',
    },
  },

  'the shattered merge': {
    name: 'the shattered merge',
    flavor: 'the mergers have already begun. find your exit.',
    mechanical: 'fast well growth / frequent wave events / short collapse',
    mapSizes: [3, 5, 10],
    config: {
      events: { growthInterval: 25, growthAmount: 0.04 },
      universe: { runDuration: 360 },
    },
    layout: {
      wellSpread: 'tight',
      wreckDensity: 'normal',
      portalCount: 'normal',
      scavengerCount: 'high',
    },
  },

  'the thick dark': {
    name: 'the thick dark',
    flavor: 'spacetime is already thickening. every move costs more than it should.',
    mechanical: 'high viscosity / heavy drift / extra exits',
    mapSizes: [3, 5],
    config: {
      fluid: { viscosity: 0.0003 },
      universe: { viscosityGrowth: 0.015 },
    },
    layout: {
      wellSpread: 'normal',
      wreckDensity: 'sparse',
      portalCount: 'high',
      scavengerCount: 'low',
    },
  },

  'the graveyard': {
    name: 'the graveyard',
    flavor: 'civilizations fell like rain here. their wealth remains. their exits do not.',
    mechanical: 'many wrecks / few exits / slow collapse',
    mapSizes: [3, 5, 10],
    config: {
      universe: { runDuration: 480 },
      events: { growthInterval: 50 },
    },
    layout: {
      wellSpread: 'normal',
      wreckDensity: 'dense',
      portalCount: 'low',
      scavengerCount: 'low',
    },
  },

  'the rush': {
    name: 'the rush',
    flavor: 'the exits are already closing. move.',
    mechanical: 'fast portal decay / many scavengers / short window',
    mapSizes: [3, 5],
    config: {
      universe: { runDuration: 300 },
      portals: { evaporationInterval: 45 },
    },
    layout: {
      wellSpread: 'normal',
      wreckDensity: 'normal',
      portalCount: 'normal',
      scavengerCount: 'high',
      wreckTierBoost: 1,
    },
  },

  'the deep': {
    name: 'the deep',
    flavor: 'the distances here are immense. plan your route or drift forever.',
    mechanical: 'strong gravity / high inertia / long run',
    mapSizes: [5, 10],
    config: {
      wells: { gravity: 0.002 },
      universe: { runDuration: 600 },
    },
    layout: {
      wellSpread: 'extreme',
      wreckDensity: 'sparse',
      portalCount: 'low',
      scavengerCount: 'normal',
      wreckTierBoost: 1,
    },
  },
};

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
  // Filter to signatures that support this map scale, excluding the last pick
  const pool = Object.values(SIGNATURES).filter(
    s => s.mapSizes.includes(mapScale) && s.name !== _lastSignature
  );

  if (pool.length === 0) {
    // Fallback: allow repeat if streak filter emptied the pool
    const fallback = Object.values(SIGNATURES).filter(s => s.mapSizes.includes(mapScale));
    const sig = fallback[Math.floor(rng() * fallback.length)];
    _lastSignature = sig.name;
    return sig;
  }

  const sig = pool[Math.floor(rng() * pool.length)];
  _lastSignature = sig.name;
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

// ---- Layout multipliers ----

/**
 * Lookup tables for converting qualitative layout hints to numeric values.
 * wreckDensity is multiplicative (applied to base wreck count).
 * portalCount / scavengerCount are additive offsets to base counts.
 */
export const LAYOUT_MULTIPLIERS = {
  wreckDensity:   { sparse: 0.6, normal: 1.0, dense: 1.6 },
  portalCount:    { low: -1, normal: 0, high: 1 },      // additive offset
  scavengerCount: { low: -1, normal: 0, high: 2 },      // additive offset
};

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
