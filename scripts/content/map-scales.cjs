// CJS wrapper around the canonical map-scale registry used by the server.
const data = require('../../src/content/map-scales.data.json');

const MAP_SCALE_REGISTRY = data.MAP_SCALE_REGISTRY;
const AUTHORED_MAP_CONTRACT = data.AUTHORED_MAP_CONTRACT;
const PLAYABLE_MAP_IDS = Object.freeze(Object.keys(MAP_SCALE_REGISTRY));

function getMapScaleDefinition(mapId) {
  return MAP_SCALE_REGISTRY[String(mapId)] || null;
}

function getMapDurationSeconds(mapId) {
  const definition = getMapScaleDefinition(mapId);
  return definition ? definition.runDurationSeconds : null;
}

function getMapScaleByWorldScale(worldScale) {
  const scale = Number(worldScale);
  return PLAYABLE_MAP_IDS
    .map((mapId) => MAP_SCALE_REGISTRY[mapId])
    .find((definition) => definition.dimensions.width === scale
      && definition.dimensions.height === scale) || null;
}

function getPortalPlacementPolicy(mapId) {
  const definition = getMapScaleDefinition(mapId);
  const source = AUTHORED_MAP_CONTRACT.portalPlacement;
  if (!definition || !source) throw new RangeError(`Unknown portal placement map: ${mapId}`);
  const worldScale = definition.dimensions.width;
  const scaleFraction = (fraction) => Math.round(fraction * worldScale * 1e12) / 1e12;
  const resolveBand = (band) => {
    const resolved = {
      anchor: source.anchor,
      minRadius: scaleFraction(band.minRadiusFraction),
      maxRadius: scaleFraction(band.maxRadiusFraction),
    };
    if (band.minWellDistanceFraction !== undefined) {
      resolved.minWellDistance = scaleFraction(band.minWellDistanceFraction);
    }
    if (band.maxWellDistanceFraction !== undefined) {
      resolved.maxWellDistance = scaleFraction(band.maxWellDistanceFraction);
    }
    if (band.minWellClearanceFraction !== undefined) {
      resolved.minWellClearance = scaleFraction(band.minWellClearanceFraction);
    }
    return resolved;
  };
  return {
    policyId: source.policyId,
    mapId: definition.mapId,
    worldScale,
    anchor: source.anchor,
    minPortalSpacing: scaleFraction(source.minPortalSpacingFraction),
    spawnRadiusBands: Object.fromEntries(
      Object.entries(source.bands).map(([kind, band]) => [kind, resolveBand(band)]),
    ),
  };
}

function assertMapDefinitionParity(map) {
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

module.exports = {
  MAP_SCALE_REGISTRY,
  AUTHORED_MAP_CONTRACT,
  PLAYABLE_MAP_IDS,
  getMapScaleDefinition,
  getMapDurationSeconds,
  getMapScaleByWorldScale,
  getPortalPlacementPolicy,
  assertMapDefinitionParity,
};
