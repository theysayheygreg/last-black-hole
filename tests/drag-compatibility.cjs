const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');
const { CONFIG } = require('../src/config.js');
const { Ship } = require('../src/ship.js');
const { PRESETS, deepMerge } = require('../src/presets.js');
const { ProfileManager } = require('../src/profile.js');
const { applySceneOverrides, revertSceneOverrides } = require('../src/scene-config.js');
const { createPlayerBrain } = require('../scripts/player-brain.cjs');

// Immutable parent 0eced674 fixtures. This oracle intentionally imports
// neither MOVEMENT nor any migrated tuning/conversion helper.
const LEGACY_BASE_DRAG = 0.015;
const LEGACY_PRESETS = Object.freeze({ Spacecraft: 0.05, Surfer: 0.02 });
const LEGACY_HULL_SCALES = Object.freeze({
  drifter: 0.85,
  breacher: 1,
  resonant: 0.95,
  shroud: 0.9,
  hauler: 1.1,
});
const LEGACY_ITEM_SCALES = Object.freeze({
  'drag-foil': 0.94,
  'drag-coefficient': 0.88,
  'dead-mans-thruster': 1.3,
  'event-horizon-keel': 1.12,
});
const DTS = [1 / 60, 1 / 30, 1 / 20, 1 / 12];
const EPSILON = 1e-11;
let compatibilityCases = 0;
let trajectoryRows = 0;
let wakeRows = 0;

function legacyProfileScale(rank) {
  return Math.max(0.1, 1 - rank * 0.12);
}

function legacyDragFactor(rawDrag, dragScale, dt) {
  const effectiveDrag = Math.max(0, Math.min(0.95, rawDrag * dragScale));
  return Math.pow(1 - effectiveDrag, dt * 60);
}

function legacyTerminalVelocity(thrustAccel, rawDrag, dragScale) {
  const effectiveDrag = Math.max(0, Math.min(0.95, rawDrag * dragScale));
  return thrustAccel / (effectiveDrag > 0 ? effectiveDrag : 0.03);
}

function assertClose(label, actual, expected) {
  assert(Math.abs(actual - expected) <= EPSILON, `${label}: ${actual} != ${expected}`);
}

function assertThrows(label, fn, pattern) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert(thrown && pattern.test(thrown.message), `${label}: expected visible ${pattern} failure`);
}

function runLocalCase({ name, rawDrag, halfLife, thrustAccel, hullScale = 1, profileRank = 0, itemScale = 1 }) {
  const originalHalfLife = CONFIG.ship.coastHalfLifeSeconds;
  const originalThrust = CONFIG.ship.thrustAccel;
  try {
    CONFIG.ship.coastHalfLifeSeconds = halfLife;
    CONFIG.ship.thrustAccel = thrustAccel;
    const ship = new Ship(1200, 800);
    ship.setHullStats({ dragScale: hullScale });
    ship.applyProfileDragUpgrade(profileRank);
    ship.applyMovementItemBonus({ dragScale: itemScale });

    const expectedScale = hullScale * legacyProfileScale(profileRank) * itemScale;
    assertClose(`${name} composed dragScale`, ship.dragScale, expectedScale);
    assertClose(
      `${name} wake terminal velocity`,
      ship.wakeTerminalVelocityWorld(),
      legacyTerminalVelocity(thrustAccel, rawDrag, expectedScale)
    );
    compatibilityCases += 1;
    wakeRows += 1;

    ship.wx = 1;
    ship.wy = 1;
    ship.vx = 0.75;
    ship.vy = -0.4;
    ship.setMoveIntent(0, 0);
    ship.setThrustIntensity(0);
    ship.setBrakeIntensity(0);
    let expectedVX = ship.vx;
    let expectedVY = ship.vy;
    let expectedX = ship.wx;
    let expectedY = ship.wy;
    for (const dt of DTS) {
      const factor = legacyDragFactor(rawDrag, expectedScale, dt);
      expectedVX *= factor;
      expectedVY *= factor;
      expectedX += expectedVX * dt;
      expectedY += expectedVY * dt;
      const sameVelocityFlow = { sample: () => ({ x: ship.vx, y: ship.vy }) };
      ship.update(dt, sameVelocityFlow, null, null);
      trajectoryRows += 1;
      assertClose(`${name} vx @ ${dt}`, ship.vx, expectedVX);
      assertClose(`${name} vy @ ${dt}`, ship.vy, expectedVY);
      assertClose(`${name} wx @ ${dt}`, ship.wx, expectedX);
      assertClose(`${name} wy @ ${dt}`, ship.wy, expectedY);
    }
  } finally {
    CONFIG.ship.coastHalfLifeSeconds = originalHalfLife;
    CONFIG.ship.thrustAccel = originalThrust;
  }
}

function catalogDragScales() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'items.data.json'), 'utf8'));
  const found = {};
  for (const items of Object.values(data.ITEM_CATALOG)) {
    for (const item of items) {
      if (item.coefficients?.dragScale !== undefined) found[item.id] = item.coefficients.dragScale;
    }
  }
  return found;
}

async function run() {
  const runner = new TestRunner('DragCompatibility');
  const defaultHalfLife = CONFIG.ship.coastHalfLifeSeconds;

  await runner.run('Spacecraft and Surfer preserve parent preset trajectories and wake terminals', async () => {
    for (const [name, rawDrag] of Object.entries(LEGACY_PRESETS)) {
      runLocalCase({
        name,
        rawDrag,
        halfLife: PRESETS[name].ship.coastHalfLifeSeconds,
        thrustAccel: PRESETS[name].ship.thrustAccel,
      });
    }
    console.log(`  preset fixtures: ${Object.keys(LEGACY_PRESETS).length}, trajectory rows: ${Object.keys(LEGACY_PRESETS).length * DTS.length}`);
  });

  await runner.run('every parent hull dragScale preserves local and server behavior', async () => {
    const hullData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'hulls.data.json'), 'utf8'));
    for (const [hullType, scale] of Object.entries(LEGACY_HULL_SCALES)) {
      assert(hullData.HULL_DEFINITIONS[hullType].dragScale === scale, `${hullType} dragScale drifted`);
      const server = createPlayerBrain({ hullType });
      assertClose(`${hullType} server scale`, server.dragScale, scale);
      runLocalCase({ name: `hull ${hullType}`, rawDrag: LEGACY_BASE_DRAG, halfLife: defaultHalfLife, thrustAccel: 2.5, hullScale: scale });
    }
    console.log(`  hull fixtures: ${Object.keys(LEGACY_HULL_SCALES).length}`);
  });

  await runner.run('all saved drag ranks preserve local and server compatibility', async () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
    assert(mainSource.includes('ship.applyProfileDragUpgrade(profileManager.active?.upgrades?.drag)'),
      'local fallback must apply the saved drag rank through Ship');
    const profiles = new ProfileManager();
    profiles.createProfile(0, 'Compatibility');
    const stored = profiles.replaceActiveProfile({
      ...profiles.active,
      upgrades: { ...profiles.active.upgrades, drag: '2' },
    });
    assert(stored.upgrades.drag === 2, 'stored upgrades.drag alias was not normalized visibly');
    for (const rank of [1, 2, 3]) {
      const expectedScale = legacyProfileScale(rank);
      const server = createPlayerBrain({ hullType: 'breacher', profileUpgrades: { drag: rank } });
      assertClose(`rank ${rank} server scale`, server.dragScale, expectedScale);
      runLocalCase({ name: `profile rank ${rank}`, rawDrag: LEGACY_BASE_DRAG, halfLife: defaultHalfLife, thrustAccel: 2.5, profileRank: rank });
    }
    console.log('  saved profile fixtures: 3');
  });

  await runner.run('every parent item dragScale preserves local and server behavior', async () => {
    const catalog = catalogDragScales();
    assert(JSON.stringify(catalog) === JSON.stringify(LEGACY_ITEM_SCALES), 'dragScale item catalog drifted from parent fixtures');
    for (const [id, scale] of Object.entries(LEGACY_ITEM_SCALES)) {
      const item = { id, coefficients: { dragScale: scale } };
      const server = createPlayerBrain({ hullType: 'breacher', equipped: [item] });
      assertClose(`${id} server scale`, server.dragScale, scale);
      runLocalCase({ name: `item ${id}`, rawDrag: LEGACY_BASE_DRAG, halfLife: defaultHalfLife, thrustAccel: 2.5, itemScale: scale });
    }
    console.log(`  item fixtures: ${Object.keys(LEGACY_ITEM_SCALES).length}`);
  });

  await runner.run('composed preset hull profile and item path remains equivalent', async () => {
    const expectedScale = 0.85 * legacyProfileScale(2) * 0.94;
    const item = { id: 'drag-foil', coefficients: { dragScale: 0.94 } };
    const server = createPlayerBrain({ hullType: 'drifter', profileUpgrades: { drag: 2 }, equipped: [item] });
    assertClose('composed server scale', server.dragScale, expectedScale);
    runLocalCase({
      name: 'Spacecraft + Drifter + rank 2 + Drag Foil',
      rawDrag: 0.05,
      halfLife: PRESETS.Spacecraft.ship.coastHalfLifeSeconds,
      thrustAccel: 4,
      hullScale: 0.85,
      profileRank: 2,
      itemScale: 0.94,
    });
  });

  await runner.run('legacy ship.drag aliases convert or fail visibly', async () => {
    const merged = { ship: { coastHalfLifeSeconds: defaultHalfLife } };
    deepMerge(merged, { ship: { drag: 0.05 } });
    assert(!Object.prototype.hasOwnProperty.call(merged.ship, 'drag'), 'legacy preset alias survived merge');
    assertClose('merged alias decay', Math.pow(0.5, (1 / 30) / merged.ship.coastHalfLifeSeconds), Math.pow(1 - 0.05, 2));

    const scene = { ship: { coastHalfLifeSeconds: defaultHalfLife } };
    applySceneOverrides(scene, { ship: { drag: 0.02 } });
    assertClose('scene alias decay', Math.pow(0.5, (1 / 30) / scene.ship.coastHalfLifeSeconds), Math.pow(1 - 0.02, 2));
    revertSceneOverrides();
    assert(scene.ship.coastHalfLifeSeconds === defaultHalfLife, 'scene alias did not revert');

    assertThrows('conflicting alias', () => deepMerge({}, { ship: { drag: 0.05, coastHalfLifeSeconds: 1 } }), /defines both legacy/);
    assertThrows('invalid alias', () => deepMerge({}, { ship: { drag: 0 } }), /invalid legacy/);
  });

  console.log(`  compatibility cases: ${compatibilityCases}, trajectory rows: ${trajectoryRows}, wake rows: ${wakeRows}`);

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
