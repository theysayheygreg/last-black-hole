const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const MAP_DIR = path.join(ROOT, "src", "maps");

const PLAYABLE_MAP_FILES = [
  { id: "shallows", file: "shallows-3x3.js" },
  { id: "expanse", file: "expanse-5x5.js" },
  { id: "deep-field", file: "deep-field-10x10.js" },
];

function readMapObjectLiteral(filepath) {
  const source = fs.readFileSync(filepath, "utf8");
  const match = source.match(/export const MAP =\s*({[\s\S]*?});\s*$/);
  if (!match) {
    throw new Error(`Could not parse MAP export from ${filepath}`);
  }
  return match[1];
}

function loadMapDefinition(filepath) {
  const literal = readMapObjectLiteral(filepath);
  return vm.runInNewContext(`(${literal})`, {}, { filename: filepath });
}

function makeEntityId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function cloneEntityArray(list = [], prefix, mapper) {
  return list.map((item, index) => mapper(item, index, makeEntityId(prefix, index)));
}

function normalizeMap(mapId, map) {
  return {
    id: mapId,
    name: map.name,
    worldScale: map.worldScale,
    fluidResolution: map.fluidResolution || 256,
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

function loadPlayableMaps() {
  const maps = {};
  for (const entry of PLAYABLE_MAP_FILES) {
    const filepath = path.join(MAP_DIR, entry.file);
    const map = loadMapDefinition(filepath);
    maps[entry.id] = normalizeMap(entry.id, map);
  }
  return maps;
}

module.exports = {
  loadPlayableMaps,
};
