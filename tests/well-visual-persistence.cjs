const { TestRunner, assert } = require('./helpers.cjs');
const { WellSystem, effectiveWellVisualMass } = require('../src/wells.js');
const { setFluidCamera, setWorldScale } = require('../src/coords.js');

async function run() {
  const runner = new TestRunner('WellVisualPersistence');

  await runner.run('remote wells replenish presentation without applying local force', async () => {
    setWorldScale(5);
    setFluidCamera(2.5, 2.5);

    const wells = new WellSystem();
    wells.addWell(2.8, 2.2, {
      id: 'deck-visible-well',
      mass: 1.2,
      orbitalDir: -1,
      accretionSpinRate: 0.8,
    });
    wells.wells[0].overdriveMultiplier = 1.5;

    let forceCalls = 0;
    let visualCalls = 0;
    const fluid = {
      applyWellForce() { forceCalls += 1; },
      visualSplat() { visualCalls += 1; },
    };

    for (let tick = 0; tick < 75; tick += 1) {
      wells.update(fluid, 1 / 15, tick / 15, { authorityDriven: true });
    }

    assert(forceCalls === 0, `remote presentation applied ${forceCalls} local well forces`);
    assert(visualCalls === 75 * 4,
      `expected four bounded presentation anchors per fixed step, got ${visualCalls}`);
    assert(Math.abs(effectiveWellVisualMass(wells.wells[0]) - 1.8) < 1e-12
      && Math.abs(wells.getUVMasses()[0] - 1.8) < 1e-12,
      'well shader intensity must use the same base-mass times overdrive-multiplier truth as authority');
    assert(wells.getRenderShapes()[0][3] === -1,
      'well render shape must retain the authoritative current direction');
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
