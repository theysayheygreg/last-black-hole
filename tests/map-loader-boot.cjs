/** Boot/map fixture: presentation maps must not break the canonical map seam. */

const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const [{ loadMap }, { MAP: titleMap }, scales] = await Promise.all([
    import(pathToFileURL(path.join(ROOT, 'src/map-loader.js')).href),
    import(pathToFileURL(path.join(ROOT, 'src/maps/title-screen.js')).href),
    import(pathToFileURL(path.join(ROOT, 'src/content/map-scales.js')).href),
  ]);

  const systems = {
    wellSystem: {
      wells: [],
      addWell(x, y, options) { this.wells.push({ wx: x, wy: y, ...options }); },
    },
    starSystem: {
      stars: [],
      addStar(x, y, options) { this.stars.push({ wx: x, wy: y, ...options }); },
    },
    wreckSystem: {
      wrecks: [],
      addWreck(x, y, options) { this.wrecks.push({ wx: x, wy: y, ...options }); },
    },
    portalSystem: { portals: [] },
    planetoidSystem: {
      planetoids: [],
      spawnTimer: 0,
      spawnOrbit() { return {}; },
      spawnFigure8() { return {}; },
      spawnTransit() { return {}; },
    },
    fluid: { res: 256 },
  };

  const result = loadMap(titleMap, systems, { seed: 7 });
  assert.deepStrictEqual(result.startingMasses, [4.9]);
  assert.strictEqual(result.anomalyCatalog.mapId, 'shallows');
  assert.strictEqual(systems.wellSystem.wells.length, 1);
  assert.strictEqual(systems.starSystem.stars.length, 3);
  assert.strictEqual(systems.wreckSystem.wrecks.length, 3);
  assert.strictEqual(scales.PLAYABLE_MAP_IDS[0], 'shallows');
  assert.throws(() => loadMap(undefined, systems), /Unknown active map id: undefined/);

  console.log('MapLoaderBoot: title fixture loads with canonical anomaly id and preserves authored scale.');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
