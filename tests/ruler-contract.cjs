const assert = require('assert');

let passed = 0;

async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  PASS ${name}`);
}

(async () => {
  const units = await import('../src/units.js');
  const contentUnits = await import('../src/content/units.js');
  const ruler = await import('../src/ruler-contract.js');
  const devPanel = await import('../src/dev-panel.js');

  const serverUnits = require('../scripts/content/units.cjs');

  await test('locked unit inputs stay byte-equivalent across wrappers', () => {
    assert.strictEqual(JSON.stringify(contentUnits.UNITS_DATA), JSON.stringify(serverUnits.UNITS_DATA));
    assert.strictEqual(contentUnits.UNITS_DATA.ratification.status, 'locked');
    assert.strictEqual(contentUnits.UNITS_DATA.ratification.owner, 'Greg');
    assert.strictEqual(contentUnits.UNITS_DATA.ratification.date, '2026-07-17');
  });

  await test('locked sim-unit conversion derives the ruler scale', () => {
    assert.strictEqual(units.METERS_PER_SIM_UNIT, 1000);
    assert.strictEqual(units.DRIFTER_HULL_LENGTH_METERS, 12);
    assert.strictEqual(units.DRIFTER_HULL_LENGTH_SIM_UNITS, 0.012);
    assert.strictEqual(units.simUnitsToMeters(0.45), 450);
    assert.strictEqual(units.metersToSimUnits(units.RULER_SCALE_BAR_METERS), 0.1);
    const radius = units.metersToScreenRadius(100, 1200, 900);
    assert.strictEqual(radius.rx, 40);
    assert.strictEqual(radius.ry, 30);
  });

  await test('all four Grapple Arc rows and six S5 force classes require handlers', () => {
    assert.deepStrictEqual(ruler.S4_RULER_CONTRACTS.map((contract) => contract.id), [
      'slingshot.radii',
      'slingshot.reel',
      'slingshot.flatBoost',
      'slingshot.releaseAssist',
    ]);
    assert.strictEqual(ruler.S5_RULER_CONTRACTS.length, 6);
    const handlers = Object.fromEntries(ruler.REQUIRED_RULER_HANDLER_IDS.map((id) => [id, () => true]));
    const registry = ruler.createRulerRegistry(handlers);
    assert.deepStrictEqual(registry.ids(), ruler.REQUIRED_RULER_HANDLER_IDS);
    assert.throws(() => ruler.createRulerRegistry({}), /Missing ruler draw handler/);
  });

  await test('whole-step snapping uses the declared range origin', () => {
    assert.strictEqual(units.snapToDeclaredStep(463, { min: 0, max: units.METERS_PER_SIM_UNIT, step: 25 }), 475);
    assert.strictEqual(units.snapToDeclaredStep(0.126, { min: 0.1, max: 0.3, step: 0.01 }), 0.13);
    assert.strictEqual(units.snapToDeclaredStep(4.9, { min: 0, max: 4, step: 0.5 }), 4);
  });

  await test('dev controls expose units, ranges, steps, and start bias where resolved', () => {
    const thrust = devPanel.controlMetadata('ship.thrustAccel', 2.5);
    assert.deepStrictEqual(
      { unit: thrust.unit, min: thrust.min, max: thrust.max, step: thrust.step, startBias: thrust.startBias },
      { unit: 'sim units/s²', min: 0.5, max: 5, step: 0.1, startBias: 'authority baseline' },
    );
    assert.strictEqual(devPanel.snapControlValue('ship.thrustAccel', 2.56), 2.6);
  });

  console.log(`RulerContract: ${passed}/5 passed`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
