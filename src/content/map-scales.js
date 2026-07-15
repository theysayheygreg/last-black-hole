// Canonical active map scale registry. Server and browser wrappers consume the
// same JSON so dimensions, class, and session profile identity cannot drift.
import data from './map-scales.data.json' with { type: 'json' };

export const MAP_SCALE_REGISTRY = data.MAP_SCALE_REGISTRY;
export const AUTHORED_MAP_CONTRACT = data.AUTHORED_MAP_CONTRACT;
export const PLAYABLE_MAP_IDS = Object.freeze(Object.keys(MAP_SCALE_REGISTRY));

export function getMapScaleDefinition(mapId) {
  return MAP_SCALE_REGISTRY[String(mapId)] || null;
}

export function getMapScaleByWorldScale(worldScale) {
  const scale = Number(worldScale);
  return PLAYABLE_MAP_IDS
    .map((mapId) => MAP_SCALE_REGISTRY[mapId])
    .find((definition) => definition.dimensions.width === scale
      && definition.dimensions.height === scale) || null;
}

export function assertMapDefinitionParity(map) {
  const definition = getMapScaleDefinition(map?.id);
  if (!definition) throw new Error(`Unknown active map id: ${map?.id}`);
  const width = definition.dimensions.width;
  const height = definition.dimensions.height;
  if (map.worldScale !== width || map.mapClass !== definition.mapClass
    || map.dimensions?.width !== width || map.dimensions?.height !== height
    || map.profileId !== definition.profileId) {
    throw new Error(`Map ${definition.mapId} does not match canonical scale registry`);
  }
  return definition;
}
