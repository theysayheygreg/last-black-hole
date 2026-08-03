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
    assert(shader.includes('const float laneSpacing = 0.46;'), 'Expected broad separation between fabric lanes');
    assert(shader.includes('mix(0.017, 0.021, laneStrength)'), 'Lane strength must not substantially increase coverage');
    assert(shader.includes('mix(0.17, 0.62, laneStrength)'), 'Stronger current must lengthen downstream marks');
    assert(shader.includes('mix(0.08, 0.68, laneStrength)'), 'Stronger current must advance marks faster');
    assert(shader.includes('vec3(0.08, 0.34, 0.60)') && shader.includes('vec3(0.18, 0.52, 0.78)'),
      'Lane palette must use restrained cyan/blue-white values');
    assert(shader.includes('float baseMix = 0.018 + sceneExcitation * 0.10;'),
      'Base field must preserve large dark regions outside the lanes');
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

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error('Fabric display contract test fatal error:', error);
  process.exit(1);
});
