const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const runner = new TestRunner('FabricDisplayContract');
  const budget = await import(path.join(ROOT, 'src/render/fabric-well-budget.js'));
  const shaders = await import(path.join(ROOT, 'src/render/shaders/fluid.glsl.js'));

  await runner.run('display well uniforms fit the WebGL2 minimum fragment budget', async () => {
    assert(budget.FABRIC_WELL_UNIFORM_BUDGET === 64, 'Expected one 64-well product budget');
    assert(budget.estimatedFabricDisplayUniformVectors() === 381,
      `Expected conservative 381-vector accounting, got ${budget.estimatedFabricDisplayUniformVectors()}`);
    assert(budget.estimatedFabricDisplayUniformVectors() < 1024,
      'Display uniforms must fit MAX_FRAGMENT_UNIFORM_VECTORS=1024');
    assert(budget.estimatedFabricDisplayUniformVectors(256) === 1149,
      'The retired 256-well declaration must remain proven over budget');
    for (const declaration of ['u_wellPositions[64]', 'u_wellMasses[64]', 'u_wellShape[64]', 'u_wellProfile[64]']) {
      assert(shaders.FRAG_DISPLAY.includes(declaration), `Missing bounded display declaration ${declaration}`);
    }
    assert(!shaders.FRAG_DISPLAY.includes('u_wellPositions[256]'), 'Display shader must not revive the overflowing array');
  });

  await runner.run('overflow selection retains nearest wells deterministically', async () => {
    const candidates = Array.from({ length: 80 }, (_, index) => ({
      index,
      distanceSq: Math.abs(index - 39.5),
    }));
    const expectedNearest = [...candidates]
      .sort((a, b) => a.distanceSq - b.distanceSq || a.index - b.index)
      .slice(0, budget.FABRIC_WELL_UNIFORM_BUDGET)
      .map(({ index }) => index)
      .sort((a, b) => a - b);
    const forward = budget.selectFabricWellIndices(candidates);
    const reverse = budget.selectFabricWellIndices([...candidates].reverse());
    assert(forward.length === 64, `Expected 64 selected wells, got ${forward.length}`);
    assert(JSON.stringify(forward) === JSON.stringify(expectedNearest), 'Expected nearest set restored to source index order');
    assert(JSON.stringify(reverse) === JSON.stringify(expectedNearest), 'Selection must not depend on candidate traversal order');

    const underBudget = budget.selectFabricWellIndices([
      { index: 7, distanceSq: 5 },
      { index: 2, distanceSq: 1 },
    ]);
    assert(JSON.stringify(underBudget) === JSON.stringify([7, 2]), 'Under-budget maps must preserve authored order exactly');
  });

  await runner.run('lane shader keeps sparse rest and strength-through-motion art', async () => {
    const shader = shaders.FRAG_DISPLAY;
    assert(shader.includes('const float laneSpacing = 0.92;'), 'Expected at least half the former lane occupancy');
    assert(shader.includes('const float channelHalfViewport = 0.055;')
      && shader.includes('float channelHalfWidth = u_cameraView * channelHalfViewport;')
      && shader.includes('channelHalfWidth * 0.72'),
    'Each sparse lane needs a screen-stable navigable channel envelope, not only a pencil mark');
    const channelPixelsAt1280 = 1280 * 0.055 * 2;
    const shipVisibleDiameter = 12 * 2.5;
    const channelToShipRatio = channelPixelsAt1280 / shipVisibleDiameter;
    assert(channelToShipRatio >= 4 && channelToShipRatio <= 5,
      `Expected a 4-5x ship channel at 1280px, got ${channelToShipRatio.toFixed(2)}x`);
    assert(shader.includes('mix(0.012, 0.016, laneStrength)'), 'Lane strength must not substantially increase coverage');
    assert(shader.includes('mix(0.45, 1.25, laneStrength)'), 'Stronger current must create long coherent downstream marks');
    assert(shader.includes('mix(0.12, 0.90, laneStrength)'), 'Stronger current must advance marks faster');
    assert(shader.includes('vec3(0.08, 0.34, 0.60)') && shader.includes('vec3(0.18, 0.52, 0.78)'),
      'Lane palette must use restrained cyan/blue-white values');
    assert(shader.includes('float baseMix = 0.004 + sceneExcitation * 0.03;'),
      'Base field must preserve large dark regions outside the lanes');
    assert(shader.includes('channelEnvelope * channelPresence * 0.10'),
      'The channel envelope must remain restrained beneath brighter directional marks');
    assert(shader.includes('(0.72 + gravityWeight * 0.48)')
      && shader.includes('gravityWeight * 0.28 - fullGravityWeight * 0.38')
      && shader.includes('nearestProfile.z * 1.35'),
    'Authored current/gravity/full-gravity reaches must produce broad bend, compression, and split');
    assert(shader.includes('float visualCoreRadius = max(coreRadius, u_cameraView * 0.014);'),
      'Lethal bodies need a bounded presentation-only minimum at Deck resolution');
    assert(shader.includes('col *= mix(1.0, 0.16, coreQuiet);')
      && shader.includes('mix(1.0, 1.38, gravityWeight * (1.0 - coreQuiet))'),
    'Near-core fabric must quiet while authored gravity selectively reinforces curved lanes');
    assert(shader.includes('min(ringInner, visualCoreRadius * 1.38)')
      && shader.includes('min(ringOuter, visualCoreRadius * 1.78)'),
    'Analytic accretion must remain a compact body-relative rim, not a broad halo');
  });

  await runner.run('upload path shares the same fixed budget owner', async () => {
    const fluid = fs.readFileSync(path.join(ROOT, 'src/fluid.js'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    assert(fluid.includes("import { FABRIC_WELL_UNIFORM_BUDGET } from './render/fabric-well-budget.js';")
      && fluid.includes('Math.min(FABRIC_WELL_UNIFORM_BUDGET, wellPositionsUV.length)'),
    'Fluid upload must cap against the shader budget');
    assert(main.includes("import { selectFabricWellIndices } from './render/fabric-well-budget.js';")
      && main.includes('const visibleIndices = selectFabricWellIndices(candidates);'),
    'Main presentation must select bounded visible wells through the shared owner');
  });

  await runner.run('legacy well density patches stay retired', async () => {
    const wells = fs.readFileSync(path.join(ROOT, 'src/wells.js'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const seedStart = main.indexOf('function seedInitialFluid()');
    const seedEnd = main.indexOf('\nfunction spawnClearance', seedStart);
    assert(!wells.includes('REMOTE_ANCHOR_POINTS') && !wells.includes('REMOTE_ANCHOR_REPLENISHMENT'),
      'Remote wells must not rebuild density-anchor patches');
    assert(!main.slice(seedStart, seedEnd).includes('wellSystem.wells'),
      'Initial fluid seed must not paint a broad per-well density patch');
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error('Fabric display contract test fatal error:', error);
  process.exit(1);
});
