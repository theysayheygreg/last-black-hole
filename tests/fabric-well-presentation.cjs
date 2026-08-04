const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');
const FABRIC = require('../src/content/fabric.data.json');
const ANOMALIES = require('../src/content/anomalies.data.json');

const ROOT = path.resolve(__dirname, '..');
const wellsSource = fs.readFileSync(path.join(ROOT, 'src/wells.js'), 'utf8');

async function run() {
  const { WellSystem } = await import('../src/wells.js');
  const { FRAG_DISPLAY: shader } = await import('../src/render/shaders/fluid.glsl.js');
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
    assert(shader.includes('u_wellProfile[64]'));
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

  await runner.run('well body and wider corona have separate presentation roles', async () => {
    const { wellCoronaRadii } = await import('../src/wells.js');
    const compactBody = [0.075, 0.09, 0.133, 1];
    const [core, peak, outer] = wellCoronaRadii(compactBody, 3);
    assert(core >= compactBody[0], 'corona must preserve the compact void body');
    assert(peak > core && outer > peak, 'corona must expand outward in ordered bands');
    assert(outer >= compactBody[2] * 2.65, 'landmark corona must exceed the compact analytic rim');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const accretion = fs.readFileSync(path.join(ROOT, 'src/render/passes/accretion-pass.js'), 'utf8');
    assert(main.includes('accretionStrength: 0.40'), 'gameplay must render a restrained well corona');
    assert(main.includes('wellSystem.getCoronaRadii(CAMERA_VIEW)'), 'gameplay corona must derive from well presentation shapes');
    assert(main.includes('accretionPass.gameplayPalette = !isTitle && !rendererFixtureActive'),
      'title must preserve its authored blackbody spectrum while gameplay uses its danger palette');
    assert(accretion.includes('vec3 gameplayTempRamp(float t)')
      && accretion.includes('u_gameplayPalette == 1 ? gameplayTempRamp(t) : tempRamp(t)'),
      'gameplay corona must stay red/orange and avoid title-white energy');
    assert(main.includes('Neither changes hit,') && main.includes('gravity, current, or authority radii'),
      'well corona must remain explicitly presentation-only');
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error('FabricWellPresentation fatal error:', error.stack || error.message);
  process.exit(1);
});
