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
      ring: { id: 'ring' },
    },
    materials: {
      ship: { id: 'ship' },
      remoteShip: { id: 'remote' },
      surfRing: { id: 'surf-ring' },
      tether: { id: 'tether' },
      thrusterWake: { id: 'thruster-wake' },
      wreck: { id: 'wreck' },
      lootedWreck: { id: 'looted-wreck' },
      portal: { id: 'route-cyan-portal' },
      riftPortal: { id: 'rift-white' },
      portalBlockedState: { id: 'portal-blocked-state' },
      portalFinalState: { id: 'portal-final-state' },
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
  const visualStyle = await importModule('src/render-three/visual-style.js');
  const { createWorldProjection } = await importModule('src/render-three/world-projection.js');
  const { ThreeRendererBackend } = await importModule('src/render-three/three-renderer.js');
  const { WorldScenePresentation } = await importModule('src/render-three/world-scene-presentation.js');
  const { TemporalVisibilityContract } = await importModule('src/render-three/entities/temporal-visibility.js');
  const THREE = await importModule('node_modules/three/build/three.module.js');

  await runner.run('Pooled renderer reuses meshes while isolating opacity and disposing sprite materials', async () => {
    const sharedMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 });
    sharedMaterial.name = 'entity-sprite-material:shipDrifter';
    sharedMaterial.userData = { baseOpacity: 1 };
    const presentation = Object.create(WorldScenePresentation.prototype);
    const activeGroup = new THREE.Group();
    activeGroup.name = 'active-entity-layer';
    presentation.entityGroup = new THREE.Group();
    presentation.semanticGroup = new THREE.Group();
    presentation.entityGeometries = { spriteCard: new THREE.PlaneGeometry(1, 1) };
    presentation.entityMeshPool = [];
    presentation.semanticMeshPool = [];
    presentation.linePool = [];
    presentation.entityMeshCursor = 0;
    presentation.semanticMeshCursor = 0;
    presentation.lineCursor = 0;
    presentation.entityBackingGroup = new THREE.Group();
    presentation.entitySpriteMaterials = new Set();
    presentation.temporalVisibility = new TemporalVisibilityContract();
    presentation.entityAssets = {
      getMaterial() { return sharedMaterial; },
      dispose() {
        this.disposed = true;
        sharedMaterial.dispose();
      },
    };
    presentation.entityMaterials = {};
    presentation.vfxManager = { geometries: {}, dispose() {} };
    presentation.currentProjection = createWorldProjection({ x: 0, y: 0, worldScale: 3, view: 3 }, 1);
    presentation.lastSceneState = { cameraX: 0, cameraY: 0, worldScale: 3, cameraView: 3 };
    presentation._addContrastBacking = () => {};

    presentation._beginDynamicScene();
    const first = presentation._addSpriteEntity(activeGroup, 'shipDrifter', 0, 0, 0.04, 0, 0.13,
      presentation.lastSceneState, 'player', { id: 'ship-a', opacity: 0.25 }, 'player');
    const second = presentation._addSpriteEntity(activeGroup, 'shipDrifter', 0.1, 0, 0.04, 0, 0.13,
      presentation.lastSceneState, 'player', { id: 'ship-b', opacity: 0.85 }, 'player');
    assert(first && second && first !== second, 'Expected two pooled meshes for two live sprite identities');
    assert(first.material !== second.material, 'Each pooled mesh must own an opacity material clone');
    first.material.opacity = 0.1;
    assert(second.material.opacity === 0.85, 'Changing one sprite opacity must not change its pooled neighbor');
    assert(sharedMaterial.opacity === 1, 'Shared asset material must remain at its base opacity');

    presentation._beginDynamicScene();
    const reused = presentation._addSpriteEntity(activeGroup, 'shipDrifter', 0, 0, 0.04, 0, 0.13,
      presentation.lastSceneState, 'player', { id: 'ship-c', opacity: 0.6 }, 'player');
    assert(reused === first && reused.material === first.material,
      'The next frame must reuse the pooled mesh and its per-mesh material clone');
    assert(reused.material.opacity === 0.6 && second.material.opacity === 0.85,
      'Reuse must update only the reused mesh opacity');

    const cloneDisposeCounts = new Map(Array.from(
      presentation.entitySpriteMaterials,
      (material) => [material, 0],
    ));
    for (const material of presentation.entitySpriteMaterials) {
      material.addEventListener('dispose', () => {
        cloneDisposeCounts.set(material, cloneDisposeCounts.get(material) + 1);
      });
    }
    let assetMaterialDisposals = 0;
    sharedMaterial.addEventListener('dispose', () => { assetMaterialDisposals += 1; });
    presentation.visualFamilies = {};
    presentation.worldScene = new THREE.Scene();
    presentation.worldScene.add(activeGroup);
    activeGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sharedMaterial));
    presentation.dispose();
    assert(cloneDisposeCounts.size === 2
      && Array.from(cloneDisposeCounts.values()).every((count) => count === 1)
      && presentation.entitySpriteMaterials.size === 0,
      'World-scene disposal must release every pooled sprite material clone');
    assert(presentation.entityAssets.disposed && assetMaterialDisposals === 1,
      'Asset-store materials must remain excluded from traversal disposal');

    const order = [];
    let copyMaterialDisposals = 0;
    const backend = Object.create(ThreeRendererBackend.prototype);
    backend.sourceCanvas = {
      removeEventListener(type) { order.push(`remove:${type}`); },
    };
    backend.worldPresentation = { dispose() { order.push('world'); } };
    backend.sceneTarget = { dispose() { order.push('target'); } };
    backend.copyMaterial = new THREE.MeshBasicMaterial();
    backend.copyMaterial.addEventListener('dispose', () => {
      copyMaterialDisposals += 1;
      order.push('copy-material');
    });
    backend.postScene = new THREE.Scene();
    const postGeometry = new THREE.PlaneGeometry(2, 2);
    postGeometry.addEventListener('dispose', () => order.push('post-geometry'));
    backend.postScene.add(new THREE.Mesh(postGeometry, backend.copyMaterial));
    backend.renderer = { dispose() { order.push('renderer'); } };
    backend.dispose();
    assert(copyMaterialDisposals === 1,
      'Backend traversal must dispose its copy material exactly once');
    assert(JSON.stringify(order) === JSON.stringify([
      'remove:webglcontextlost', 'remove:webglcontextrestored',
      'world', 'target', 'post-geometry', 'copy-material', 'renderer',
    ]), `Unexpected backend disposal order: ${JSON.stringify(order)}`);
  });

  await runner.run('Empty world disposal releases attached and never-attached resources exactly once', async () => {
    const presentation = new WorldScenePresentation();
    presentation.entityGroup.add(new THREE.Mesh(
      presentation.entityGeometries.disc,
      presentation.entityMaterials.ship,
    ));
    presentation.screenVfxGroup.add(new THREE.Mesh(
      presentation.vfxManager.geometries.ember,
      new THREE.MeshBasicMaterial(),
    ));
    const resources = new Set([
      ...Object.values(presentation.entityGeometries),
      ...Object.values(presentation.entityMaterials),
      ...Object.values(presentation.vfxManager.geometries),
    ]);
    presentation.scene.traverse((child) => {
      if (child.geometry) resources.add(child.geometry);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (material) resources.add(material);
    });
    const disposeCounts = new Map(Array.from(resources, (resource) => [resource, 0]));
    for (const resource of resources) {
      resource.addEventListener('dispose', () => disposeCounts.set(resource, disposeCounts.get(resource) + 1));
    }
    presentation.dispose();
    assert(Array.from(disposeCounts.values()).every((count) => count === 1),
      `Constructor-owned resources must dispose exactly once: ${JSON.stringify(Array.from(disposeCounts.values()))}`);
  });

  await runner.run('Product sprite seam has one alpha core and no universal vector parts', async () => {
    const rendererSource = fs.readFileSync(path.join(ROOT, 'src/render-three/world-scene-presentation.js'), 'utf8');
    const styleSource = fs.readFileSync(path.join(ROOT, 'src/render-three/visual-style.js'), 'utf8');
    const seam = rendererSource.slice(rendererSource.indexOf('  _addSpriteEntity'), rendererSource.indexOf('  _addLine'));
    assert(!rendererSource.includes('ENTITY_SPRITE_TREATMENTS'), 'Legacy universal sprite treatment table must be removed');
    assert(!seam.includes('entityGeometries.disc') && !seam.includes('entityGeometries.ring'),
      'Sprite seam must not submit generic disc or ring parts');
    assert(seam.includes('entityGeometries.spriteCard') && seam.includes('entityOpacity'),
      'Sprite seam must submit a sprite card and carry presentation opacity');
    assert(rendererSource.includes('mesh.onBeforeRender = NOOP_ON_BEFORE_RENDER')
      && rendererSource.includes('baseOpacity'),
    'Pooled role changes must clear sprite opacity hooks and restore material opacity');
    assert(styleSource.includes('matteContact') && !styleSource.includes('matteHeavy'),
      'Sprite separation must use one low-alpha contact matte');
    for (const [family, treatment] of Object.entries(visualStyle.ENTITY_CONTACT_MATTE_TREATMENTS)) {
      assert(!('halo' in treatment) && !('rim' in treatment), `${family} retained a legacy halo/rim treatment`);
    }
  });

  await runner.run('Well primitives are diagnostic-only and state rings stay family-owned', async () => {
    const backendSource = fs.readFileSync(path.join(ROOT, 'src/render-three/three-renderer.js'), 'utf8');
    const rendererSource = fs.readFileSync(path.join(ROOT, 'src/render-three/world-scene-presentation.js'), 'utf8');
    const portalSource = fs.readFileSync(path.join(ROOT, 'src/render-three/entities/portal-visual-family.js'), 'utf8');
    assert(backendSource.includes("const diagnosticView = this.getViewMode() === 'scene';")
      && rendererSource.includes('if (diagnosticView)'),
      'Well diagnostics must have an explicit raw-scene gate');
    const annotationSource = fs.readFileSync(path.join(ROOT, 'src/render-three/annotations/annotation-presentation.js'), 'utf8');
    assert(!portalSource.includes("portal.visualState === 'blocked'")
      && !portalSource.includes("portal.visualState === 'final'")
      && annotationSource.includes("portal.final ? 'exfil' : 'portal'"),
    'Portal state geometry must live only in the shared annotation owner');
    assert(rendererSource.includes('wellDebugPrimitiveCount'),
      'Renderer stats must expose well diagnostic primitive counts');
  });

  await runner.run('Authoritative waves stay in the fluid material layer', async () => {
    const rendererSource = fs.readFileSync(path.join(ROOT, 'src/render-three/world-scene-presentation.js'), 'utf8');
    const waveSource = fs.readFileSync(path.join(ROOT, 'src/wave-rings.js'), 'utf8');
    assert(!rendererSource.includes('_addSourceBoundWellWavefront')
      && !rendererSource.includes('well-growth-wavefront:'),
    'Product mode must not submit a detached Three wave ring');
    assert(waveSource.includes('injectIntoFluid()')
      && !waveSource.includes('SPLATS_PER_RING'),
    'The legacy local circumference splat path must stay retired');
  });

  await runner.run('World scene has one direct lifecycle owner and preserves reset and family order', async () => {
    const backendSource = fs.readFileSync(path.join(ROOT, 'src/render-three/three-renderer.js'), 'utf8');
    const sceneSource = fs.readFileSync(path.join(ROOT, 'src/render-three/world-scene-presentation.js'), 'utf8');
    for (const method of ['resize', 'update', 'reset', 'getStats', 'dispose']) {
      assert(typeof WorldScenePresentation.prototype[method] === 'function',
        `World scene owner is missing ${method}`);
    }
    assert(!backendSource.includes('this.worldScene') && !backendSource.includes('this.worldCamera')
      && backendSource.includes('this.worldPresentation.scene')
      && backendSource.includes('this.worldPresentation.camera'),
    'Backend must orchestrate the direct world owner without private scene proxies');

    const reset = sceneSource.slice(sceneSource.indexOf('  reset({ phase, runId }'), sceneSource.indexOf('  _buildForegroundLayers'));
    assert(reset.includes('family.reset()') && reset.includes('temporalVisibility.reset')
      && reset.includes('this.vfxManager.reset()')
      && !reset.includes('prevCamera') && !reset.includes('motion.set')
      && !reset.includes('Pool.length'),
    'Phase/run reset must clear owned visual families and VFX without rebuilding pools');
    const resetOrder = ['family.reset()', 'this.vfxManager.reset()', 'this.temporalVisibility.reset'];
    assert(resetOrder.every((call, index) => reset.indexOf(call) >= 0
      && (index === 0 || reset.indexOf(call) > reset.indexOf(resetOrder[index - 1]))),
    'A phase/run reset must clear visual families before VFX and temporal visibility inspect the next frame');

    const sync = sceneSource.slice(sceneSource.indexOf('  _syncWorldScene'), sceneSource.indexOf('  _describeWorldLayers'));
    const familyOrder = ['visualFamilies.portal.update', 'visualFamilies.wreck.update',
      'visualFamilies.worldSprites.update', 'visualFamilies.player.update'];
    assert(familyOrder.every((call, index) => sync.indexOf(call) >= 0
      && (index === 0 || sync.indexOf(call) > sync.indexOf(familyOrder[index - 1]))),
    'Dynamic families must keep portal → wreck → world sprites → player order');

    const render = backendSource.slice(backendSource.indexOf('  render(frameContext)'), backendSource.indexOf('  setViewMode(mode)'));
    const frameOrder = ['this.composer.render', 'resolvePresentationFrame', 'this._applyPresentationStyle',
      'this.worldPresentation.update', 'this.renderer.info.reset', 'this.renderer.render(this.worldPresentation.scene',
      'this.renderer.render(this.postScene', 'this.worldPresentation.getStats'];
    assert(frameOrder.every((call, index) => render.indexOf(call) >= 0
      && (index === 0 || render.indexOf(call) > render.indexOf(frameOrder[index - 1]))),
    'Backend frame orchestration order must remain composer → presentation → world → post → stats');

  });

  await runner.run('Player family prioritizes local ship while annotation grammar owns grapple geometry', async () => {
    const resources = makeResources();
    const family = new PlayerVisualFamily(resources).create();
    const log = makeDrawLog();
    const frame = {
      localPlayer: {
        id: 'local', world: { x: 0, y: 0 }, status: 'alive',
        movement: { facing: 0, velocity: { x: 1, y: 0 }, thrusting: true },
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
    assert(log.calls.filter((call) => call.type === 'line').length === 2,
      'Player family must submit only propulsion state lines; grapple geometry belongs to annotations');
    const annotationSource = fs.readFileSync(path.join(ROOT, 'src/render-three/annotations/annotation-presentation.js'), 'utf8');
    assert(annotationSource.includes("this._plan('grapple'") && annotationSource.includes('if (sling.engaged)'),
      'Shared annotation owner must contain reachable and attached grapple presentation');

    const propulsionLines = (movement) => {
      const stateLog = makeDrawLog();
      family.update({
        ...frame,
        localPlayer: { ...frame.localPlayer, movement, slingshot: {} },
        world: { remotePlayers: [], shipCandidates: [] },
      }, stateLog.draw);
      return stateLog.calls.filter((call) => call.type === 'line').map((call) => call.args);
    };
    const coast = propulsionLines({ facing: 0, velocity: { x: 1, y: 0 } });
    const parkedThrust = propulsionLines({ facing: 0, velocity: { x: 0, y: 0 }, thrusting: true });
    const thrust = propulsionLines({ facing: 0, velocity: { x: 1, y: 0 }, thrusting: true });
    const brake = propulsionLines({ facing: 0, velocity: { x: 1, y: 0 }, braking: true });
    assert(coast.length === 0 && parkedThrust.length === 0,
      'Coasting and near-stationary ships must not retain arbitrary thrust-port marks');
    assert(thrust.length === 2 && brake.length === 2,
      'Moving thrust and braking must each submit their two state-specific ports');
    assert(thrust[0][0] < brake[0][0] && thrust[0][2] < brake[0][2],
      'Brake ports must move to the forward side instead of reading as thrust');
    assert(Math.abs(thrust[0][2] - thrust[0][0]) > Math.abs(brake[0][2] - brake[0][0]),
      'Brake ports must remain visibly shorter than thrust ports');

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
    assert(assets.selectWreckAsset({ variant: 'vault' }) === 'wreckValuable', 'Vault wreck value selection failed');
    assert(assets.selectPortalAsset({ visualState: 'rift' }) === 'portalRift', 'Rift portal selection failed');
    assert(assets.selectScavengerAsset({ variant: 'drifter' }) === 'scavengerDrifter', 'Drifter scavenger selection failed');
    assert(assets.selectInhibitorAsset({ kind: 'glitch' }) === 'inhibitorGlitch', 'Glitch inhibitor selection failed');
    assert(assets.selectInhibitorAsset({ kind: 'swarm' }) === 'inhibitorSwarm', 'Swarm inhibitor selection failed');
    assert(assets.selectInhibitorAsset({ kind: 'vessel' }) === 'inhibitorVessel', 'Vessel inhibitor selection failed');
    assert(assets.selectFaunaAsset({ variant: 'jelly' }) === 'faunaOrganic', 'Fauna must retain the organic sprite');
    assert(assets.selectSentryAsset({ status: 'alert' }) === 'sentryThreat', 'Sentries must use the threat sprite');
    for (const relativePath of Object.values(assets.ENTITY_ASSET_PATHS)) {
      assert(require('fs').existsSync(path.join(ROOT, relativePath)), `Missing generated entity asset ${relativePath}`);
    }
  });

  await runner.run('Entity asset manifest and runtime usage agree in both directions', async () => {
    const assetDir = path.join(ROOT, 'assets/visual/entities');
    const diskPaths = fs.readdirSync(assetDir).filter((name) => name.endsWith('.png') || name.endsWith('.svg'))
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
      style: { entityBudgets: { stars: 2, planetoids: 2, scavengers: 2, ecology: 8 } },
    };
    const stats = family.update(frame, log.draw);
    assert(stats.activeObjects === 14 && stats.droppedObjects === 9,
      `Ambient family exceeded its budgets: ${JSON.stringify(stats)}`);
    assert(log.calls.some((call) => call.type === 'sprite' && call.args[1] === 'comet'), 'Transit body should use comet art');
    assert(log.calls.some((call) => call.type === 'sprite' && call.args[1] === 'scavengerBreacher'), 'Breacher scavenger art missing');
    assert(log.calls.some((call) => call.type === 'sprite' && call.args[6] === 'fauna' && call.args[1] === 'faunaOrganic'),
      'Fauna should use its organic sprite family');
    assert(log.calls.some((call) => call.type === 'sprite' && call.args[6] === 'sentries' && call.args[1] === 'sentryThreat'),
      'Sentries should use the threat sprite family');
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
