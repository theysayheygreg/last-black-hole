const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');
const FABRIC = require('../src/content/fabric.data.json');
const ANOMALIES = require('../src/content/anomalies.data.json');

const ROOT = path.resolve(__dirname, '..');
const shader = fs.readFileSync(path.join(ROOT, 'src/render/shaders/fluid.glsl.js'), 'utf8');
const wellsSource = fs.readFileSync(path.join(ROOT, 'src/wells.js'), 'utf8');

async function run() {
  const { WellSystem } = await import('../src/wells.js');
  const runner = new TestRunner('FabricWellPresentation');

  await runner.run('presentation receives canonical radii and per-well signature reach', async () => {
    const system = new WellSystem();
    system.addWell(0.5, 0.5, { catalogId: 'micro-black-hole' });
    const [profile] = system.getRenderProfiles();
    const signature = ANOMALIES.catalog['micro-black-hole'].fabricSignature.parameters;
    assert(Math.abs(profile[0] - FABRIC.wellGravity.falloffEndRadius
      * FABRIC.wellCurrent.currentReachMultiplier * signature.currentReachMultiplier) < 1e-9);
    assert(Math.abs(profile[1] - FABRIC.wellGravity.falloffEndRadius
      * signature.gravityReachMultiplier) < 1e-9);
    assert(Math.abs(profile[2] - FABRIC.wellGravity.fullGravityRadius
      * signature.gravityReachMultiplier) < 1e-9);
    assert(Math.abs(profile[3] - FABRIC.wellGravity.featherRadius
      * signature.gravityReachMultiplier) < 1e-9);
  });

  await runner.run('lane deformation is profile-driven and retired surf/halo cues are absent', async () => {
    assert(wellsSource.includes('getRenderProfiles'));
    assert(wellsSource.includes('FABRIC.wellGravity.falloffEndRadius'));
    assert(shader.includes('u_wellProfile[256]'));
    assert(shader.includes('nearestProfile.x'));
    assert(shader.includes('nearestProfile.y'));
    assert(shader.includes('nearestProfile.z'));
    assert(shader.includes('nearestProfile.w'));
    assert(shader.includes('splitWeight'));
    assert(!shader.includes('surfBand'), 'generic cool surf band must be retired');
    assert(!shader.includes('surfHint'), 'generic surf hint must be retired');
    assert(!shader.includes('haloMask'), 'broad well halo must be retired');
    assert(!shader.includes('gravityContour'), 'gravity contour vocabulary must be retired');
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error('FabricWellPresentation fatal error:', error.stack || error.message);
  process.exit(1);
});
