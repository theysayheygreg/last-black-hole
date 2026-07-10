const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function makeResources() {
  return {
    group: { name: 'test-group' },
    geometries: {
      triangle: { id: 'triangle' },
      square: { id: 'square' },
      ring: { id: 'ring' },
    },
    materials: {
      ship: { id: 'ship' },
      shipHalo: { id: 'ship-halo' },
      shipRim: { id: 'ship-rim' },
      remoteShip: { id: 'remote' },
      remoteShipHalo: { id: 'remote-halo' },
      surfRing: { id: 'surf-ring' },
      tether: { id: 'tether' },
      wreck: { id: 'wreck' },
      wreckHalo: { id: 'wreck-halo' },
      wreckRim: { id: 'wreck-rim' },
      lootedWreck: { id: 'looted-wreck' },
      lootedWreckHalo: { id: 'looted-wreck-halo' },
      portal: { id: 'route-cyan-portal' },
      portalHalo: { id: 'route-cyan-halo' },
      riftPortal: { id: 'rift-white' },
      riftPortalHalo: { id: 'rift-cyan' },
    },
  };
}

function makeDrawLog() {
  const calls = [];
  return {
    calls,
    draw: {
      readable(...args) { calls.push({ type: 'readable', args }); return { visible: true }; },
      semantic(...args) { calls.push({ type: 'semantic', args }); return { visible: true }; },
      line(...args) { calls.push({ type: 'line', args }); return { visible: true }; },
      shipCandidate(candidate) { calls.push({ type: 'candidate', candidate }); return { visible: true }; },
      sprite(...args) { calls.push({ type: 'sprite', args }); return { visible: true }; },
    },
  };
}

function worldEntity(id, index = 0, extra = {}) {
  return { id, world: { x: index / 100, y: index / 100 }, ...extra };
}

async function run() {
  const runner = new TestRunner('ThreeEntityLifecycle');
  const { PlayerVisualFamily } = await importModule('src/render-three/entities/player-visual-family.js');
  const { WreckVisualFamily } = await importModule('src/render-three/entities/wreck-visual-family.js');
  const { PortalVisualFamily } = await importModule('src/render-three/entities/portal-visual-family.js');
  const { WorldSpriteVisualFamily } = await importModule('src/render-three/entities/world-sprite-visual-family.js');
  const assets = await importModule('src/render-three/entity-assets.js');
  const { createWorldProjection } = await importModule('src/render-three/world-projection.js');

  await runner.run('Player family prioritizes local ship and stays inside its object budget', async () => {
    const resources = makeResources();
    const family = new PlayerVisualFamily(resources).create();
    const log = makeDrawLog();
    const frame = {
      localPlayer: {
        id: 'local', world: { x: 0, y: 0 }, status: 'alive',
        movement: { facing: 0, velocity: { x: 1, y: 0 } },
        slingshot: { engaged: true, anchor: { world: { x: 0.1, y: 0 }, range: 0.2 } },
      },
      world: {
        remotePlayers: Array.from({ length: 8 }, (_, index) => worldEntity(`remote-${index}`, index, {
          status: 'alive', movement: { facing: 0, velocity: { x: 0, y: 0 } },
        })),
        shipCandidates: [],
      },
      style: { entityBudgets: { players: 3 } },
    };
    const stats = family.update(frame, log.draw);
    const firstSprite = log.calls.find((call) => call.type === 'sprite');
    assert(firstSprite.args[1] === 'shipDrifter', 'Local Drifter sprite must render before remote density');
    assert(stats.activeObjects === 3, `Expected 3 player objects, got ${stats.activeObjects}`);
    assert(stats.droppedObjects === 6, `Expected 6 dropped remotes, got ${stats.droppedObjects}`);
    assert(log.calls.some((call) => call.type === 'line'), 'Engaged slingshot should submit a tether');

    family.update({ ...frame, localPlayer: null, world: { remotePlayers: [], shipCandidates: [] } }, log.draw);
    assert(family.getStats().activeObjects === 0, 'Empty update must return family to idle');
    family.dispose();
    assert(family.getStats().disposed === true, 'Dispose should close the family');
    let rejected = false;
    try { family.update(frame, log.draw); } catch { rejected = true; }
    assert(rejected, 'Disposed family must reject future updates');
  });

  await runner.run('Wreck and portal families bound dense object lists and clear counts on reset', async () => {
    const resources = makeResources();
    const wrecks = new WreckVisualFamily(resources).create();
    const portals = new PortalVisualFamily(resources).create();
    const log = makeDrawLog();
    const frame = {
      localPlayer: null,
      world: {
        wrecks: Array.from({ length: 25 }, (_, index) => worldEntity(`wreck-${index}`, index, {
          size: index % 2 ? 'small' : 'large', looted: index % 3 === 0,
        })),
        portals: Array.from({ length: 9 }, (_, index) => worldEntity(`portal-${index}`, index, {
          variant: index === 0 ? 'rift' : 'standard', radius: 0.08,
        })),
      },
      style: { entityBudgets: { wrecks: 7, portals: 3 } },
    };
    const wreckStats = wrecks.update(frame, log.draw);
    const portalStats = portals.update(frame, log.draw);
    assert(wreckStats.activeObjects === 7 && wreckStats.droppedObjects === 18,
      `Unexpected wreck budget result ${JSON.stringify(wreckStats)}`);
    assert(portalStats.activeObjects === 3 && portalStats.droppedObjects === 6,
      `Unexpected portal budget result ${JSON.stringify(portalStats)}`);
    const portalAssets = log.calls
      .filter((call) => call.type === 'sprite' && call.args[6] === 'portals')
      .map((call) => call.args[1]);
    assert(portalAssets.includes('portalExtraction'), 'Standard route portal should use extraction art');
    assert(portalAssets.includes('portalRift'), 'Rift portal should use rift art');
    wrecks.reset();
    portals.reset();
    assert(wrecks.getStats().activeObjects === 0 && portals.getStats().activeObjects === 0,
      'Reset must clear active family counts');
  });

  await runner.run('Invisible submissions do not consume budgets and explicit zero disables families', async () => {
    const resources = makeResources();
    const players = new PlayerVisualFamily(resources).create();
    const wrecks = new WreckVisualFamily(resources).create();
    const portals = new PortalVisualFamily(resources).create();
    const worldSprites = new WorldSpriteVisualFamily({ landmarkGroup: {}, activeGroup: {} }).create();
    const calls = [];
    const draw = {
      sprite(...args) {
        calls.push(args);
        return args[2] >= 0.5 ? { visible: true } : null;
      },
    };
    const entities = [worldEntity('culled', 0), worldEntity('visible-a', 50), worldEntity('visible-b', 60)];
    const wreckStats = wrecks.update({ world: { wrecks: entities }, style: { entityBudgets: { wrecks: 1 } } }, draw);
    const portalStats = portals.update({ world: { portals: entities }, style: { entityBudgets: { portals: 1 } } }, draw);
    assert(wreckStats.activeObjects === 1 && portalStats.activeObjects === 1,
      'A culled leading entity must not starve a later visible entity');
    assert(calls.some((args) => args[2] === 0.5), 'Families must scan through culled entities');
    const playerStats = players.update({
      localPlayer: null,
      world: { shipCandidates: entities, remotePlayers: [] },
      style: { entityBudgets: { players: 1 } },
    }, {
      shipCandidate: (entity) => entity.world.x >= 0.5 ? {} : null,
    });
    const worldStats = worldSprites.update({
      world: { stars: entities },
      style: { entityBudgets: { stars: 1, planetoids: 0, scavengers: 0, ecology: 0 } },
    }, draw);
    assert(playerStats.activeObjects === 1, 'Culled candidates must not consume the player budget');
    assert(worldStats.activeObjects === 1, 'Culled ambient sprites must not consume their family budget');
    const zeroWrecks = wrecks.update({ world: { wrecks: entities }, style: { entityBudgets: { wrecks: 0 } } }, draw);
    const zeroPortals = portals.update({ world: { portals: entities }, style: { entityBudgets: { portals: 0 } } }, draw);
    const zeroPlayers = players.update({
      localPlayer: worldEntity('local'), world: { shipCandidates: [], remotePlayers: [] },
      style: { entityBudgets: { players: 0 } },
    }, { sprite: () => ({}) });
    assert(zeroWrecks.activeObjects === 0 && zeroWrecks.objectBudget === 0, 'Zero wreck budget must be honored');
    assert(zeroPortals.activeObjects === 0 && zeroPortals.objectBudget === 0, 'Zero portal budget must be honored');
    assert(zeroPlayers.activeObjects === 0 && zeroPlayers.objectBudget === 0, 'Zero player budget must be honored');
  });

  await runner.run('Generated asset selection is state aware and every catalog path exists', async () => {
    assert(assets.selectPlayerAsset({ hull: { type: 'breacher' } }) === 'shipBreacher', 'Breacher hull selection failed');
    assert(assets.selectPlayerAsset({ hull: { type: 'drifter' } }) === 'shipDrifter', 'Drifter hull selection failed');
    assert(assets.selectPlayerAsset({}, { remote: true }) === 'shipRemote', 'Remote hull selection failed');
    assert(assets.selectWreckAsset({ visualState: 'looted' }) === 'wreckLooted', 'Looted wreck selection failed');
    assert(assets.selectWreckAsset({ visualState: 'cluster' }) === 'wreckCluster', 'Cluster wreck selection failed');
    assert(assets.selectPortalAsset({ visualState: 'rift' }) === 'portalRift', 'Rift portal selection failed');
    for (const relativePath of Object.values(assets.ENTITY_ASSET_PATHS)) {
      assert(require('fs').existsSync(path.join(ROOT, relativePath)), `Missing generated entity asset ${relativePath}`);
    }
  });

  await runner.run('Entity asset manifest and runtime usage agree in both directions', async () => {
    const assetDir = path.join(ROOT, 'assets/visual/entities');
    const diskPaths = fs.readdirSync(assetDir).filter((name) => name.endsWith('.png'))
      .map((name) => `assets/visual/entities/${name}`).sort();
    const manifestPaths = Object.values(assets.ENTITY_ASSET_MANIFEST).map((asset) => asset.path).sort();
    assert(JSON.stringify(diskPaths) === JSON.stringify(manifestPaths),
      `Entity files and classified manifest drifted: disk=${diskPaths} manifest=${manifestPaths}`);
    const runtimeEntries = Object.entries(assets.ENTITY_ASSET_MANIFEST)
      .filter(([, asset]) => asset.classification === 'runtime');
    assert(runtimeEntries.every(([id, asset]) => assets.ENTITY_ASSET_PATHS[id] === asset.path),
      'Every runtime-classified asset must enter the runtime store');
    assert(Object.keys(assets.ENTITY_ASSET_PATHS).every((id) => assets.ENTITY_ASSET_MANIFEST[id]?.classification === 'runtime'),
      'Every runtime store asset must be explicitly runtime-classified');
    const familySource = fs.readdirSync(path.join(ROOT, 'src/render-three/entities'))
      .filter((name) => name.endsWith('-visual-family.js'))
      .map((name) => fs.readFileSync(path.join(ROOT, 'src/render-three/entities', name), 'utf8'))
      .join('\n');
    const assetSource = fs.readFileSync(path.join(ROOT, 'src/render-three/entity-assets.js'), 'utf8');
    const selectorSource = assetSource.slice(assetSource.indexOf('export function selectPlayerAsset'), assetSource.indexOf('function configureTexture'));
    const usedRuntimeIds = runtimeEntries.map(([id]) => id).filter((id) => (familySource + selectorSource).includes(`'${id}'`));
    assert(usedRuntimeIds.length === runtimeEntries.length,
      `Runtime-classified assets without visual-family usage: ${runtimeEntries.map(([id]) => id).filter((id) => !usedRuntimeIds.includes(id))}`);
    assert(assets.ENTITY_ASSET_MANIFEST.wellInstrument.classification === 'reference'
      && assets.ENTITY_ASSET_MANIFEST.inhibitorShard.classification === 'reference',
    'Procedural wells and Inhibitors must remain reference-only assets');
  });

  await runner.run('Canvas context handlers have symmetric install and dispose ownership', async () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/render-three/three-renderer.js'), 'utf8');
    for (const [eventName, handlerName] of [
      ['webglcontextlost', 'onContextLost'],
      ['webglcontextrestored', 'onContextRestored'],
    ]) {
      assert(source.includes(`addEventListener('${eventName}', this.${handlerName})`), `Missing ${eventName} install`);
      assert(source.includes(`removeEventListener('${eventName}', this.${handlerName})`), `Missing ${eventName} teardown`);
    }
  });

  await runner.run('Entity texture and material ownership plateaus and disposes once', async () => {
    const madeTextures = [];
    const loader = {
      load(assetPath) {
        const texture = { assetPath, disposeCount: 0, dispose() { this.disposeCount += 1; } };
        madeTextures.push(texture);
        return texture;
      },
    };
    const store = new assets.EntityAssetStore({ loader });
    for (let frame = 0; frame < 100; frame++) {
      store.getMaterial('shipDrifter');
      store.getMaterial('wreckIntact');
      store.getMaterial('portalExtraction');
    }
    const plateau = store.getStats();
    assert(plateau.textureCount === 3 && plateau.materialCount === 3 && plateau.loadCount === 3,
      `Asset ownership did not plateau: ${JSON.stringify(plateau)}`);
    assert(plateau.peakTextureCount === 3 && plateau.peakMaterialCount === 3,
      `Asset high-water marks should plateau at three: ${JSON.stringify(plateau)}`);
    assert(madeTextures.every((texture) => texture.magFilter != null && texture.generateMipmaps === false),
      'Entity textures must use nearest filtering without mipmaps');
    store.dispose();
    store.dispose();
    assert(madeTextures.every((texture) => texture.disposeCount === 1), 'Textures must be disposed exactly once');
    assert(store.getStats().textureCount === 0 && store.getStats().disposed === true && store.getStats().disposeCount === 1,
      'Disposed store must release texture references');
  });

  await runner.run('Ambient sprite families share bounded lifecycle ownership', async () => {
    const family = new WorldSpriteVisualFamily({ landmarkGroup: {}, activeGroup: {} }).create();
    const log = makeDrawLog();
    const frame = {
      world: {
        stars: Array.from({ length: 5 }, (_, index) => worldEntity(`star-${index}`, index)),
        planetoids: Array.from({ length: 5 }, (_, index) => worldEntity(`planetoid-${index}`, index, { variant: 'transit', movement: { x: 1, y: 0 } })),
        scavengers: Array.from({ length: 5 }, (_, index) => worldEntity(`scav-${index}`, index, { variant: 'breacher', movement: { facing: 0 } })),
        fauna: Array.from({ length: 4 }, (_, index) => worldEntity(`fauna-${index}`, index, { size: 2 })),
        sentries: Array.from({ length: 4 }, (_, index) => worldEntity(`sentry-${index}`, index)),
      },
      style: { entityBudgets: { stars: 2, planetoids: 2, scavengers: 2, ecology: 2 } },
    };
    const stats = family.update(frame, log.draw);
    assert(stats.activeObjects === 8 && stats.droppedObjects === 15,
      `Ambient family exceeded its budgets: ${JSON.stringify(stats)}`);
    assert(log.calls.some((call) => call.type === 'sprite' && call.args[1] === 'comet'), 'Transit body should use comet art');
    assert(log.calls.some((call) => call.type === 'sprite' && call.args[1] === 'scavengerBreacher'), 'Breacher scavenger art missing');
  });

  await runner.run('World projection keeps toroidal seams and square fluid alignment centralized', async () => {
    const projection = createWorldProjection({ x: 0.05, y: 2.95, worldScale: 3, view: 3 }, 1.6);
    const point = projection.project(2.95, 0.05);
    assert(Math.abs(point.x - (-0.1 / 3) * 2 * 1.6) < 1e-9, `Unexpected wrapped X ${point.x}`);
    assert(Math.abs(point.y - (0.1 / 3) * -2) < 1e-9, `Unexpected wrapped Y ${point.y}`);
    const worldRadius = projection.radius(0.1, 'world');
    const screenRadius = projection.radius(0.1, 'screen');
    assert(worldRadius.x > screenRadius.x && worldRadius.y === screenRadius.y,
      'World and screen radius modes should preserve documented aspect behavior');
    assert(projection.isVisible({ x: 0, y: 0 }, 0.1), 'Camera center should be visible');
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error('Three entity lifecycle test fatal error:', error);
  process.exit(1);
});
