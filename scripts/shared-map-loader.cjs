const fs = require("fs");
const path = require("path");
const vm = require("vm");

const {
  PLAYABLE_MAP_IDS,
  getMapScaleDefinition,
  assertMapDefinitionParity,
} = require("./content/map-scales.cjs");
const { migrateAuthoredMap } = require("./map-migration.cjs");
const { CLIENT_PERF_PROFILES } = require("./content/session-profiles.cjs");

const ROOT = path.resolve(__dirname, "..");
const MAP_DIR = path.join(ROOT, "src", "maps");

function readAuthoredMapObjectLiteral(filepath) {
  const source = fs.readFileSync(filepath, "utf8");
  const match = source.match(/export const AUTHORED_MAP =\s*({[\s\S]*?});\s*export const MAP =/);
  if (!match) {
    throw new Error(`Could not parse AUTHORED_MAP export from ${filepath}`);
  }
  return match[1];
}

function loadAuthoredMap(mapId) {
  const definition = getMapScaleDefinition(mapId);
  if (!definition) throw new Error(`Unknown active map id: ${mapId}`);
  const filepath = path.join(MAP_DIR, definition.sourceFile);
  const literal = readAuthoredMapObjectLiteral(filepath);
  return vm.runInNewContext(`(${literal})`, {}, { filename: filepath });
}

function makeEntityId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function cloneEntityArray(list = [], prefix, mapper) {
  return list.map((item, index) => mapper(item, index, makeEntityId(prefix, index)));
}

function assertPositionBounds(map, definition) {
  const { width, height } = definition.dimensions;
  for (const family of ["wells", "stars", "wrecks"]) {
    for (const point of map[family] || []) {
      if (!(point.x >= 0 && point.x < width && point.y >= 0 && point.y < height)) {
        throw new Error(`${map.id} ${family} position is outside ${width}x${height}`);
      }
    }
  }
}

function normalizeMap(mapId, authoredMap) {
  const map = migrateAuthoredMap(authoredMap, mapId);
  const definition = assertMapDefinitionParity(map);
  assertPositionBounds(map, definition);
  return {
    id: definition.mapId,
    mapClass: definition.mapClass,
    profileId: definition.profileId,
    dimensions: { ...definition.dimensions },
    name: map.name,
    worldScale: map.worldScale,
    fluidResolution: map.fluidResolution || CLIENT_PERF_PROFILES.fixedGrid.fluidResolution,
    // Route metadata is static map truth. Runtime entities still own every
    // gameplay consequence; the route only names their intended sequence.
    route: map.route ? JSON.parse(JSON.stringify(map.route)) : null,
    wells: cloneEntityArray(map.wells, "well", (w, _index, id) => ({
      id,
      wx: w.x,
      wy: w.y,
      mass: w.mass,
      orbitalDir: w.orbitalDir ?? 1,
      killRadius: w.killRadius,
      spinRate: w.spinRate,
      points: w.points,
      growthRate: w.growthRate ?? null,
    })),
    stars: cloneEntityArray(map.stars, "star", (s, _index, id) => ({
      id,
      wx: s.x,
      wy: s.y,
      mass: s.mass ?? 1,
      orbitalDir: s.orbitalDir ?? 1,
      type: s.type || "yellowDwarf",
    })),
    wrecks: cloneEntityArray(map.wrecks || [], "wreck", (w, _index, id) => ({
      id,
      wx: w.x,
      wy: w.y,
      type: w.type,
      tier: w.tier ?? 1,
      size: w.size ?? "medium",
    })),
    planetoids: cloneEntityArray(map.planetoids || [], "planetoid", (p, _index, id) => ({
      id,
      ...p,
    })),
  };
}

function loadAuthoredMaps() {
  const maps = {};
  for (const mapId of PLAYABLE_MAP_IDS) maps[mapId] = loadAuthoredMap(mapId);
  return maps;
}

function loadPlayableMaps() {
  const maps = {};
  for (const mapId of PLAYABLE_MAP_IDS) maps[mapId] = normalizeMap(mapId, loadAuthoredMap(mapId));
  return maps;
}

module.exports = {
  loadAuthoredMap,
  loadAuthoredMaps,
  loadPlayableMaps,
};
