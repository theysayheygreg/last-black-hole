import { createRNGStreams } from './rng-stream.js';
import { generateWreckLoot, pickCosmicSignature, WELL_NAMES } from './seeded-generation.js';

function cloneRoute(route) {
  return route ? JSON.parse(JSON.stringify(route)) : null;
}

// Preview uses the same named streams and draw order as applyRunSeed() so a
// briefing is an authority prediction, not a separate signature system.
export function buildRunBriefing(map, seed) {
  const runSeed = Number.isFinite(Number(seed)) ? Number(seed) : 1;
  const rng = createRNGStreams(runSeed);
  const wellCount = Array.isArray(map?.wells) ? map.wells.length : 0;
  const wreckCount = Array.isArray(map?.wrecks) ? map.wrecks.length : 0;
  const wellNames = [];

  for (let index = 0; index < wellCount; index += 1) {
    rng.range('wellMass', 0.85, 1.15);
    rng.range('wellGrowth', 0.80, 1.20);
    rng.float('wellDir');
    wellNames.push(rng.pick('wellNames', WELL_NAMES));
  }

  const lootQualityBias = rng.range('qualityBias', 0.8, 1.2);
  const signature = pickCosmicSignature(rng.rawStream('signature'));
  const initialLootStream = rng.rawStream('initialWreckLoot');
  const initialWrecks = [];
  for (let index = 0; index < wreckCount; index += 1) {
    const slots = 1 + Math.floor(initialLootStream() * 2);
    initialWrecks.push({
      index,
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
