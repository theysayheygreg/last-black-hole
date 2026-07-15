import { MAP_SCALE_REGISTRY, PLAYABLE_MAP_IDS } from '../content/map-scales.js';
import { MAP as MAP_SHALLOWS } from './shallows-5x5.js';
import { MAP as MAP_EXPANSE } from './expanse-15x15.js';
import { MAP as MAP_DEEP_FIELD } from './deep-field-25x25.js';

export const MAP_MODULES = Object.freeze({
  [MAP_SHALLOWS.id]: MAP_SHALLOWS,
  [MAP_EXPANSE.id]: MAP_EXPANSE,
  [MAP_DEEP_FIELD.id]: MAP_DEEP_FIELD,
});

export function assertPlayableMapModulesParity() {
  const moduleIds = Object.keys(MAP_MODULES);
  if (moduleIds.length !== PLAYABLE_MAP_IDS.length) {
    throw new Error(`Browser map module count ${moduleIds.length} does not match registry count ${PLAYABLE_MAP_IDS.length}`);
  }
  for (const mapId of PLAYABLE_MAP_IDS) {
    const map = MAP_MODULES[mapId];
    const definition = MAP_SCALE_REGISTRY[mapId];
    if (!map || map.id !== definition.mapId || map.sourceFile !== definition.sourceFile) {
      throw new Error(`Browser map module ${mapId} does not match canonical source ${definition.sourceFile}`);
    }
  }
  return true;
}

assertPlayableMapModulesParity();

export const PLAYABLE_MAPS = Object.freeze(PLAYABLE_MAP_IDS.map((id) => ({
  id,
  map: MAP_MODULES[id],
  ...MAP_SCALE_REGISTRY[id],
})));
export const MAP_LIST = Object.freeze(PLAYABLE_MAPS.map((entry) => entry.map));
export const DEFAULT_PLAYABLE_MAP = MAP_LIST[0];
