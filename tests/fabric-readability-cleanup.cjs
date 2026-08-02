const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

async function run() {
  const runner = new TestRunner('FabricReadabilityCleanup');
  const anomalies = require('../src/content/anomalies.data.json');
  const catalog = require('../scripts/anomaly-catalog.cjs');
  const coarse = read('scripts/coarse-flow-field.cjs');
  const flowSample = read('scripts/flow-sample.cjs');
  const localFlowSample = read('src/sim/flow-sample.js');
  const physics = read('src/physics.js');
  const shader = read('src/render/shaders/fluid.glsl.js');
  const presentation = read('src/presentation/presentation-frame.js');
  const materialRegistry = read('src/render-three/material-registry.js');
  const renderHints = read('src/render-three/renderable-hints.js');
  const renderPlan = read('src/render-three/render-plan.js');

  await runner.run('active fabric surface keeps only canonical controls and channels', () => {
    assert(catalog.assertValidAnomalyCatalog(), 'anomaly catalog must remain valid after knob cleanup');
    assert(!('liveWavePushMultiplier' in anomalies.tunableContract.fabricSignatureParameters));
    assert(!('liveWavePushMultiplier' in anomalies.collapseEpochContract.parameterVectors));
    for (const entry of Object.values(anomalies.catalog)) {
      assert(!('liveWavePushMultiplier' in (entry.fabricSignature?.parameters || {})),
        `${entry.id} retained the retired live-wave multiplier`);
    }
    for (const source of [coarse, flowSample, localFlowSample]) {
      for (const retired of ['waveX', 'waveY', 'signalShadow', 'sourceRingId']) {
        assert(!source.includes(retired), `flow source retained retired ${retired} vocabulary`);
      }
    }
    assert(!physics.includes('waveBandForce'), 'physics retained the retired per-tick wave force helper');
  });

  await runner.run('presentation names the live wave material without retired field cues', () => {
    for (const source of [shader, presentation, materialRegistry, renderHints, renderPlan]) {
      for (const retired of ['gravityContour', 'haloMask', 'surfBand', 'surfHint']) {
        assert(!source.includes(retired), `renderer source retained retired ${retired} vocabulary`);
      }
    }
    assert(!shader.includes('fabric noise'), 'display shader retained the retired noise-layer comment');
    assert(!shader.includes('wavePush'), 'display shader retained gameplay-force naming for material deformation');
    assert(shader.includes('waveDeformation') && shader.includes('u_waveTelegraph'),
      'source-bound wave material seam must remain present');
    assert(presentation.includes('noiseEmitters'), 'current Noise presentation seam must remain present');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error('FabricReadabilityCleanup fatal error:', error.stack || error.message);
  process.exit(1);
});
