const { getMapScaleDefinition } = require('./content/map-scales.cjs');

const POSITION_FAMILIES = Object.freeze(['wells', 'stars', 'wrecks', 'planetoids', 'portals']);

function migratePosition(point, xScale, yScale) {
  if (!point || typeof point !== 'object') return point;
  const migrated = { ...point };
  if (Number.isFinite(point.x)) migrated.x = point.x * xScale;
  if (Number.isFinite(point.y)) migrated.y = point.y * yScale;
  return migrated;
}

function migrateAuthoredMap(authoredMap, mapId) {
  const definition = getMapScaleDefinition(mapId);
  if (!definition) throw new Error(`Cannot migrate unknown active map: ${mapId}`);
  const source = definition.legacyDimensions;
  const target = definition.dimensions;
  const xScale = target.width / source.width;
  const yScale = target.height / source.height;
  const migrated = {
    ...authoredMap,
    id: definition.mapId,
    mapClass: definition.mapClass,
    profileId: definition.profileId,
    dimensions: { ...target },
    worldScale: target.width,
    migration: {
      method: 'normalized-authored-position-v1',
      sourceDimensions: { ...source },
    },
  };
  for (const family of POSITION_FAMILIES) {
    if (Array.isArray(authoredMap?.[family])) {
      migrated[family] = authoredMap[family].map((point) => migratePosition(point, xScale, yScale));
    }
  }
  return migrated;
}

module.exports = { migrateAuthoredMap };
