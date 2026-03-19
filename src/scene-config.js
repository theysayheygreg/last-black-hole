/**
 * scene-config.js — Per-scene CONFIG overrides.
 *
 * Each map/scene can define a `configOverrides` object that gets
 * deep-merged onto CONFIG when the scene loads, and reverted when
 * the scene unloads. This lets the title screen have different
 * shimmer, accretion, camera behavior etc. without polluting
 * the base config for gameplay.
 *
 * Usage:
 *   applySceneOverrides(CONFIG, map.configOverrides);
 *   // ... scene runs ...
 *   revertSceneOverrides(CONFIG);
 */

let _savedValues = [];  // stack of { path, originalValue } for reverting

/**
 * Deep-merge overrides onto CONFIG. Saves original values for revert.
 */
export function applySceneOverrides(config, overrides) {
  if (!overrides) return;
  _savedValues = [];
  _applyRecursive(config, overrides, '');
}

function _applyRecursive(target, source, path) {
  for (const key of Object.keys(source)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])
        && typeof target[key] === 'object' && target[key] !== null) {
      // Recurse into nested objects
      _applyRecursive(target[key], source[key], fullPath);
    } else {
      // Save original value, apply override
      _savedValues.push({ target, key, originalValue: target[key] });
      target[key] = source[key];
    }
  }
}

/**
 * Revert all overrides applied by the last applySceneOverrides call.
 */
export function revertSceneOverrides() {
  // Revert in reverse order to handle any nested dependencies
  for (let i = _savedValues.length - 1; i >= 0; i--) {
    const { target, key, originalValue } = _savedValues[i];
    target[key] = originalValue;
  }
  _savedValues = [];
}
