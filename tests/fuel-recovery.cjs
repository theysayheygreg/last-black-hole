const { TestRunner, assert } = require('./helpers.cjs');
const { Ship } = require('../src/ship.js');
const { BRAIN_DEFAULTS } = require('../scripts/player-brain.cjs');
const { stepPlayerMovementCore } = require('../scripts/sim/player-movement-step.cjs');

const DT = 1 / 15;
const FLOW = { current: { x: 0, y: 0 } };
const INPUT = { moveX: 1, moveY: 0, thrust: 1, brake: 0 };
// Independent expected-state oracle. These are the canonical pre-fix fuel
// inputs; this oracle intentionally imports no movement manifest or step helper.
const EXPECTED_FUEL = Object.freeze({
  initial: 1,
  max: 100,
  burnRate: 12,
  burnEff: 1,
  regen: 1.5,
  regenBoost: 6,
  regenDelay: 0.5,
});

function stepExpectedFuel(state) {
  const burnCost = EXPECTED_FUEL.burnRate * EXPECTED_FUEL.burnEff * INPUT.thrust * DT;
  let deliveredThrust = 0;
  let deltaVRecovering = state.deltaVRecovering;
  let deltaV = state.deltaV;

  if (deltaV >= burnCost) {
    deltaV -= burnCost;
    deltaVRecovering = deltaV <= 0;
    deliveredThrust = INPUT.thrust;
  } else {
    deltaVRecovering = true;
  }

  let timeSinceThrust = state.timeSinceThrust;
  if (deliveredThrust > 0.01) {
    timeSinceThrust = 0;
  } else {
    timeSinceThrust += DT;
    const boost = timeSinceThrust >= EXPECTED_FUEL.regenDelay ? EXPECTED_FUEL.regenBoost : 0;
    deltaV = Math.min(EXPECTED_FUEL.max, deltaV + (EXPECTED_FUEL.regen + boost) * DT);
  }

  return { deltaV, timeSinceThrust, deltaVRecovering, deliveredThrust };
}

function makeAuthorityPlayer() {
  return {
    wx: 1,
    wy: 1,
    vx: 0,
    vy: 0,
    brain: { ...BRAIN_DEFAULTS },
    deltaV: 1,
    deltaVMax: BRAIN_DEFAULTS.deltaVMax,
    deltaVRegen: BRAIN_DEFAULTS.deltaVRegen,
    deltaVRegenBoost: BRAIN_DEFAULTS.deltaVRegenBoost,
    deltaVBurnEff: BRAIN_DEFAULTS.deltaVBurnEff,
    deltaVBurnRate: BRAIN_DEFAULTS.deltaVBurnRate,
    timeSinceThrust: 0,
    deltaVRecovering: false,
  };
}

function makeLocalShip() {
  const ship = new Ship(1200, 800);
  ship.wx = 1;
  ship.wy = 1;
  ship.deltaV = 1;
  ship.deltaVMax = BRAIN_DEFAULTS.deltaVMax;
  ship.deltaVRegen = BRAIN_DEFAULTS.deltaVRegen;
  ship.deltaVRegenBoost = BRAIN_DEFAULTS.deltaVRegenBoost;
  ship.deltaVBurnEff = BRAIN_DEFAULTS.deltaVBurnEff;
  ship.deltaVBurnRate = BRAIN_DEFAULTS.deltaVBurnRate;
  ship.timeSinceThrust = 0;
  ship.deltaVRecovering = false;
  ship.thrustScale = BRAIN_DEFAULTS.thrustScale;
  ship.dragScale = BRAIN_DEFAULTS.dragScale;
  ship.currentCoupling = BRAIN_DEFAULTS.currentCoupling;
  ship.setMoveIntent(1, 0);
  ship.setThrustIntensity(1);
  ship.setBrakeIntensity(0);
  return ship;
}

function assertClose(label, actual, expected) {
  assert(Math.abs(actual - expected) <= 1e-12,
    `${label}: expected ${expected}, got ${actual}`);
}

async function run() {
  const runner = new TestRunner('FuelRecovery');

  await runner.run('depleted thrust recovers into usable authority and local thrust', async () => {
    const authority = makeAuthorityPlayer();
    const local = makeLocalShip();
    let expected = {
      deltaV: EXPECTED_FUEL.initial,
      timeSinceThrust: 0,
      deltaVRecovering: false,
      deliveredThrust: 0,
    };
    let recoveryTick = null;
    let usableAfterRecoveryTick = null;

    assert(BRAIN_DEFAULTS.deltaVMax === EXPECTED_FUEL.max, 'Expected pinned delta-v capacity');
    assert(BRAIN_DEFAULTS.deltaVBurnRate === EXPECTED_FUEL.burnRate, 'Expected pinned burn rate');
    assert(BRAIN_DEFAULTS.deltaVBurnEff === EXPECTED_FUEL.burnEff, 'Expected pinned burn efficiency');
    assert(BRAIN_DEFAULTS.deltaVRegen === EXPECTED_FUEL.regen, 'Expected pinned ambient regen');
    assert(BRAIN_DEFAULTS.deltaVRegenBoost === EXPECTED_FUEL.regenBoost, 'Expected pinned boost regen');

    for (let tick = 0; tick < 180; tick += 1) {
      local.update(DT, { sample: () => FLOW.current }, null, null);
      const authorityStep = stepPlayerMovementCore(authority, INPUT, DT, {
        worldScale: 3,
        flowSample: FLOW,
      });
      expected = stepExpectedFuel(expected);

      assertClose(`tick ${tick} wx`, local.wx, authority.wx);
      assertClose(`tick ${tick} wy`, local.wy, authority.wy);
      assertClose(`tick ${tick} vx`, local.vx, authority.vx);
      assertClose(`tick ${tick} vy`, local.vy, authority.vy);
      assertClose(`tick ${tick} deltaV`, local.deltaV, authority.deltaV);
      assertClose(`tick ${tick} timeSinceThrust`, local.timeSinceThrust, authority.timeSinceThrust);
      assertClose(`tick ${tick} delivered thrust`, local.lastDeliveredThrustIntensity, authorityStep.thrustIntensity);
      assertClose(`tick ${tick} oracle authority deltaV`, authority.deltaV, expected.deltaV);
      assertClose(`tick ${tick} oracle local deltaV`, local.deltaV, expected.deltaV);
      assertClose(`tick ${tick} oracle timeSinceThrust`, authority.timeSinceThrust, expected.timeSinceThrust);
      assertClose(`tick ${tick} oracle delivered thrust`, authorityStep.thrustIntensity, expected.deliveredThrust);
      assert(authority.deltaVRecovering === expected.deltaVRecovering,
        `tick ${tick} authority recovery: expected ${expected.deltaVRecovering}, got ${authority.deltaVRecovering}`);
      assert(local.deltaVRecovering === expected.deltaVRecovering,
        `tick ${tick} local recovery: expected ${expected.deltaVRecovering}, got ${local.deltaVRecovering}`);

      if (recoveryTick === null && authority.deltaVRecovering) recoveryTick = tick;
      if (recoveryTick !== null && tick > recoveryTick && authorityStep.thrustIntensity > 0.99) {
        usableAfterRecoveryTick ??= tick;
      }
    }

    assert(recoveryTick !== null && recoveryTick > 0,
      `Expected recovery onset after tick 0, got ${recoveryTick}`);
    assert(usableAfterRecoveryTick !== null && usableAfterRecoveryTick > recoveryTick,
      `Expected usable thrust after recovery tick ${recoveryTick}, got ${usableAfterRecoveryTick}`);
    assert(authority.deltaV > 0, 'Expected recovery to leave the player with a live fuel reserve');
    assert(local.deltaV > 0, 'Expected the local presentation model to mirror recovered fuel');
    console.log(`  recovery onset tick: ${recoveryTick}, usable thrust tick: ${usableAfterRecoveryTick}`);
  });

  const passed = runner.summary();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
